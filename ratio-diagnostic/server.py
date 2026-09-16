import asyncio
import base64
import re
import contextlib
import importlib.util
import io
import json
import os
import secrets
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "upstream"))
import main as upstream
from observe import events, instrument, record
from deep_evidence import integrity, runtime, submitted, workload
from academic_data import extras
from provider_flow import providers, combined, same_student, refresh as refresh_providers
from session_store import SessionStore, lifetime, SESSION_SECONDS

upstream.PortalSession = instrument(upstream.PortalSession)

spec = importlib.util.spec_from_file_location("tinyocr_adapter", ROOT.parent / "portal-python/ocr.py")
ocr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocr)


async def solve_image(image):
    try:
        started = time.monotonic()
        answer = await asyncio.to_thread(ocr.solve, image)
        record({"stage": "ocr", "completed": bool(answer), "duration_ms": round((time.monotonic() - started) * 1000)})
        return True, answer, 200
    except Exception:
        return False, "OCR unavailable", 503


upstream.solve_captcha_ocr_bytes = solve_image
origin = os.environ["APP_ORIGIN"]
secure = origin.startswith("https://")
required_token = os.environ.get("BACKEND_TOKEN", "")
sessions = {}
rates = {}
gate = asyncio.Lock()
cookie_name = "classpro_ratio_diagnostic"
session_store = None


@asynccontextmanager
async def lifespan(app):
    global session_store
    if os.environ.get("SESSION_STORE_DIR"):
        session_store = SessionStore(os.environ["SESSION_STORE_DIR"])
        sessions.update(session_store.load())
    print(json.dumps({"event": "ratio_runtime", **runtime()}), flush=True)
    async with upstream.lifespan(upstream.app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=upstream.app),
                                     base_url="http://ratio-internal", timeout=90) as client:
            app.state.client = client
            yield
    if session_store:
        session_store.save(sessions)
    sessions.clear()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def failure(code, message, status=401):
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def report(data, previous=None):
    marks = []
    for course in data.get("marks", []):
        components = []
        for item in course.get("assessments", []):
            try:
                components.append({"name": item.get("title", ""), "enteredOn": item.get("date", ""),
                                   "scored": float(item["marks"]), "total": float(item["total"])})
            except (ValueError, TypeError, KeyError):
                continue
        marks.append({"code": course.get("courseCode"), "title": course.get("title"),
                      "scored": course.get("totalMarkGot"), "total": course.get("totalMaxMarks"),
                      "components": components})
    return {"updatedAt": datetime.now(timezone.utc).isoformat(),
            **extras(data, previous), "marks": {"data": marks}}


async def invoke(request, path, payload):
    captured = [{"stage": "workload_before", **workload()}]
    token = events.set(captured)
    credential_token = submitted.set(payload)
    trace_id = request.state.diagnostic_id if hasattr(request.state, "diagnostic_id") else secrets.token_hex(8)
    started = time.monotonic()
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            response = await request.app.state.client.post(path, json=payload)
    finally:
        captured.append({"stage": "workload_after", **workload()})
        submitted.reset(credential_token)
        events.reset(token)
        for index, evidence in enumerate(captured):
            print(json.dumps({"event": "ratio_evidence", "request_id": trace_id,
                              "index": index, **evidence}), flush=True)
    data = response.json()
    detail = data.get("detail", "") if isinstance(data, dict) else ""
    category = "accepted" if response.status_code == 200 else "unclassified"
    if isinstance(detail, str):
        if "captcha" in detail.lower():
            category = "upstream_captcha_classification"
        elif "credentials" in detail.lower():
            category = "upstream_credentials_classification"
    print(json.dumps({"event": "ratio_diagnostic", "route": path,
                      "request_id": trace_id, "duration_ms": round((time.monotonic() - started) * 1000),
                      "status": response.status_code, "classification": category}), flush=True)
    return response, data


@app.middleware("http")
async def boundary(request, call_next):
    request.state.diagnostic_id = secrets.token_hex(12)
    if request.url.path == "/health":
        return JSONResponse({"ok": True, "backend": "ratio-diagnostic"})
    if not request.url.path.startswith("/api/"):
        if request.method not in {"GET", "HEAD"}:
            return failure("METHOD_NOT_ALLOWED", "Method not allowed.", 405)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response
    if request.method not in {"GET", "POST", "DELETE"}:
        return failure("METHOD_NOT_ALLOWED", "Method not allowed.", 405)
    if required_token and not secrets.compare_digest(request.headers.get("x-classpro-key", ""), required_token):
        return failure("UNAUTHORIZED", "Not available.", 401)
    if request.method != "GET":
        if request.headers.get("origin") != origin or request.headers.get("sec-fetch-site") == "cross-site":
            return failure("INVALID_ORIGIN", "Reload the app.", 403)
    if request.method == "POST":
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            return failure("INVALID_REQUEST", "Send JSON.", 415)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 8192:
                return failure("INVALID_REQUEST", "Request too large.", 413)
        request._body = bytes(body)
    now = time.monotonic()
    for key, entry in list(sessions.items()):
        expired = (time.time() - entry.get("last_seen", time.time()) > lifetime(entry)
                   if entry.get("providers") or entry.get("cookies") else now - entry["created"] > SESSION_SECONDS)
        if expired:
            sessions.pop(key, None)
            previous = upstream._portal_captcha_sessions.pop(entry.get("digest"), None)
            if previous:
                await previous.client.aclose()
    for key, entry in list(rates.items()):
        if now - entry[0] > 60:
            rates.pop(key, None)
    key = request.client.host if request.client else "unknown"
    start, count = rates.get(key, (now, 0))
    if count >= 30 or (key not in rates and len(rates) >= 4096):
        return failure("RATE_LIMIT", "Wait a minute before retrying.", 429)
    rates[key] = (start, count + 1)
    token = request.cookies.get(cookie_name)
    entry = sessions.get(token)
    if entry and (entry.get("providers") or entry.get("cookies")):
        entry["last_seen"] = time.time()
    if gate.locked():
        response = failure("SERVER_BUSY", "ClassPro is processing another request.", 503)
        response.headers["Retry-After"] = "2"
        return response
    async with gate:
        try:
            response = await asyncio.wait_for(call_next(request), 95)
        except Exception as exception:
            print(json.dumps({"event": "ratio_exception", "request_id": request.state.diagnostic_id,
                              "exception_type": type(exception).__name__}), flush=True)
            response = failure("PORTAL_UNAVAILABLE", "Student Portal request failed.", 502)
        if session_store:
            session_store.save(sessions)
    if token in sessions and sessions[token].get("providers"):
        set_session_cookie(response, token, sessions[token])
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Request-ID"] = request.state.diagnostic_id
    return response


def set_session_cookie(response, token, entry):
    response.set_cookie(cookie_name, token, httponly=True, secure=secure, samesite="strict",
                        max_age=lifetime(entry) if entry.get("remember", True) else None)


@app.get("/api/session")
async def session_status(request: Request):
    entry = sessions.get(request.cookies.get(cookie_name))
    return {"authenticated": bool(entry and providers(entry)), "authMode": "http",
            "provider": "academia", "providers": ["academia", "portal"],
            "serverAuto": True, "diagnosticBackend": True}


@app.delete("/api/session")
async def logout(request: Request):
    entry = sessions.pop(request.cookies.get(cookie_name), None)
    if entry and entry.get("digest"):
        previous = upstream._portal_captcha_sessions.pop(entry["digest"], None)
        if previous:
            await previous.client.aclose()
    response = JSONResponse({"success": True})
    response.delete_cookie(cookie_name, path="/")
    return response


@app.post("/api/challenge")
async def challenge(request: Request):
    payload = await request.json()
    provider = payload.get("provider", "portal")
    if provider not in {"academia", "portal"}:
        return failure("PROVIDER_UNAVAILABLE", "Choose Academia or Student Portal.", 400)
    token = request.cookies.get(cookie_name)
    entry = sessions.get(token)
    if entry is None:
        if len(sessions) >= 4:
            return failure("CAPACITY", "Diagnostic sessions are full. Please sign out first.", 503)
        token = secrets.token_urlsafe(32)
        entry = {"created": time.monotonic(), "remember": True, "last_seen": time.time()}
        sessions[token] = entry
    entry["pending_provider"] = provider
    if provider == "academia":
        result = JSONResponse({"required": False})
        set_session_cookie(result, token, entry)
        return result
    if entry.get("digest"):
        previous = upstream._portal_captcha_sessions.pop(entry["digest"], None)
        if previous:
            await previous.client.aclose()
    response, data = await invoke(request, "/portal/captcha", {})
    if response.status_code != 200 or not data.get("captcha_image"):
        return failure("PORTAL_UNAVAILABLE", "Cannot load SRM verification.", 502)
    entry["digest"] = data["session"]
    result = JSONResponse({"required": True, "serverAuto": True, "image": data["captcha_image"]})
    set_session_cookie(result, token, entry)
    return result


@app.post("/api/login/client")
async def login(request: Request):
    token = request.cookies.get(cookie_name)
    entry = sessions.get(token)
    if not entry:
        return failure("SESSION_EXPIRED", "Start a fresh sign-in.")
    payload = await request.json()
    provider = payload.get("provider", entry.get("pending_provider", "portal"))
    if provider not in {"academia", "portal"} or provider != entry.get("pending_provider", "portal"):
        return failure("INVALID_REQUEST", "Start a fresh sign-in for this provider.", 400)
    if provider == "portal" and not entry.get("digest"):
        return failure("SESSION_EXPIRED", "Start a fresh sign-in.")
    if not isinstance(payload.get("account"), str) or not isinstance(payload.get("password"), str):
        return failure("INVALID_REQUEST", "Enter your account and password.", 400)
    print(json.dumps({"event": "ratio_evidence", "request_id": request.state.diagnostic_id,
                      **integrity(payload)}), flush=True)
    login_payload = {
        "username": (payload["account"].strip() + "@srmist.edu.in") if provider == "academia" and "@" not in payload["account"] else payload["account"].strip(),
        "password": payload["password"],
        "captcha": payload.get("answer") or None,
        "cdigest": entry.get("academia_digest") if provider == "academia" else entry.get("digest"),
    }
    response, data = await invoke(request, "/portal/login" if provider == "portal" else "/login", login_payload)
    if response.status_code != 200 or data.get("success") is not True:
        detail = data.get("detail")
        if provider == "academia" and isinstance(detail, dict) and detail.get("type") == "CAPTCHA_REQUIRED":
            digest = detail.get("cdigest", "")
            if not isinstance(digest, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", digest):
                return failure("PORTAL_UNAVAILABLE", "Academia verification is unavailable.", 502)
            entry["academia_digest"] = digest
            async with httpx.AsyncClient(timeout=15) as client:
                captcha = await client.get(f"https://academia.srmist.edu.in/accounts/p/40-10002227248/webclient/v1/captcha/{digest}?darkmode=false")
            mime = captcha.headers.get("content-type", "").split(";")[0]
            if captcha.status_code != 200 or mime not in {"image/png", "image/jpeg"} or len(captcha.content) > 500000:
                return failure("PORTAL_UNAVAILABLE", "Cannot load Academia verification.", 502)
            return JSONResponse({"error": {"code": "CAPTCHA_REQUIRED", "message": "Enter the Academia verification code."},
                                 "image": f"data:{mime};base64,{base64.b64encode(captcha.content).decode()}"}, status_code=401)
        if isinstance(detail, str) and "captcha" in detail.lower():
            return failure("CAPTCHA_REQUIRED", "Ratio-D backend requested a new verification code.")
        return failure("LOGIN_REJECTED", "Ratio-D backend did not establish an SRM session.",
                       401 if response.status_code < 500 else 502)
    if not data.get("cookies") or not (data.get("attendance") or data.get("schedule")):
        return failure("PORTAL_CHANGED", "Login returned no attendance or timetable data.", 502)
    states = providers(entry)
    if not same_student(states, provider, data, payload["account"]):
        return failure("ACCOUNT_MISMATCH", "Connect the same student's account for both providers.", 409)
    states[provider] = {"cookies": data["cookies"], "username": login_payload["username"],
                        "password": payload["password"], "report": report(data), "expired": False}
    entry["remember"] = payload.get("remember", entry.get("remember", True)) is not False
    entry["last_seen"] = time.time()
    sessions.pop(token, None)
    token = secrets.token_urlsafe(32)
    entry.update({"cookies": data["cookies"], "report": combined(entry), "cached": time.monotonic()})
    sessions[token] = entry
    result = JSONResponse({"authenticated": True, "connections": entry["report"]["connections"]})
    set_session_cookie(result, token, entry)
    return result


@app.get("/api/reports")
async def reports(request: Request):
    entry = sessions.get(request.cookies.get(cookie_name))
    if not entry or not providers(entry):
        return failure("SESSION_EXPIRED", "Please sign in again.")
    if time.monotonic() - entry.get("cached", 0) < 60:
        return entry["report"]
    data, succeeded = await refresh_providers(request, entry, invoke, report)
    entry.update({"report": data, "cached": time.monotonic()})
    return entry["report"]


if os.environ.get("DIAGNOSTIC_STATIC_DIR") and not secure:
    app.mount("/", StaticFiles(directory=os.environ["DIAGNOSTIC_STATIC_DIR"], html=True))
