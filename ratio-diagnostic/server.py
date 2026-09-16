import asyncio
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

spec = importlib.util.spec_from_file_location("tinyocr_adapter", ROOT.parent / "portal-python/ocr.py")
ocr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocr)


async def solve_image(image):
    try:
        return True, await asyncio.to_thread(ocr.solve, image), 200
    except Exception:
        return False, "OCR unavailable", 503


upstream.solve_captcha_ocr_bytes = solve_image
origin = os.environ["APP_ORIGIN"]
secure = origin.startswith("https://")
sessions = {}
rates = {}
gate = asyncio.Lock()
cookie_name = "classpro_ratio_diagnostic"


@asynccontextmanager
async def lifespan(app):
    async with upstream.lifespan(upstream.app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=upstream.app),
                                     base_url="http://ratio-internal", timeout=90) as client:
            app.state.client = client
            yield
    sessions.clear()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def failure(code, message, status=401):
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def report(data):
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
            "attendance": {"data": data.get("attendance", [])}, "marks": {"data": marks}}


async def invoke(request, path, payload):
    with contextlib.redirect_stdout(io.StringIO()):
        response = await request.app.state.client.post(path, json=payload)
    data = response.json()
    detail = data.get("detail", "") if isinstance(data, dict) else ""
    category = "accepted" if response.status_code == 200 else "unclassified"
    if isinstance(detail, str):
        if "captcha" in detail.lower():
            category = "upstream_captcha_classification"
        elif "credentials" in detail.lower():
            category = "upstream_credentials_classification"
    print(json.dumps({"event": "ratio_diagnostic", "route": path,
                      "status": response.status_code, "classification": category}), flush=True)
    return response, data


@app.middleware("http")
async def boundary(request, call_next):
    if request.url.path == "/health":
        return JSONResponse({"ok": True, "backend": "ratio-diagnostic"})
    if request.method not in {"GET", "POST", "DELETE"}:
        return failure("METHOD_NOT_ALLOWED", "Method not allowed.", 405)
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
        if now - entry["created"] > 1800:
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
    if gate.locked():
        response = failure("SERVER_BUSY", "ClassPro is processing another request.", 503)
        response.headers["Retry-After"] = "2"
        return response
    async with gate:
        try:
            response = await asyncio.wait_for(call_next(request), 95)
        except Exception:
            response = failure("PORTAL_UNAVAILABLE", "Student Portal request failed.", 502)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/api/session")
async def session_status(request: Request):
    entry = sessions.get(request.cookies.get(cookie_name))
    return {"authenticated": bool(entry and entry.get("cookies")), "authMode": "http",
            "provider": "portal", "serverAuto": True, "diagnosticBackend": True}


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
    if payload.get("provider") != "portal":
        return failure("PROVIDER_UNAVAILABLE", "This diagnostic backend tests Student Portal only.", 400)
    token = request.cookies.get(cookie_name)
    entry = sessions.get(token)
    if entry is None:
        if len(sessions) >= 4:
            return failure("CAPACITY", "Diagnostic sessions are full. Please sign out first.", 503)
        token = secrets.token_urlsafe(32)
        entry = {"created": time.monotonic()}
        sessions[token] = entry
    if entry.get("digest"):
        previous = upstream._portal_captcha_sessions.pop(entry["digest"], None)
        if previous:
            await previous.client.aclose()
    response, data = await invoke(request, "/portal/captcha", {})
    if response.status_code != 200 or not data.get("captcha_image"):
        return failure("PORTAL_UNAVAILABLE", "Cannot load SRM verification.", 502)
    entry["digest"] = data["session"]
    result = JSONResponse({"required": True, "serverAuto": True, "image": data["captcha_image"]})
    result.set_cookie(cookie_name, token, httponly=True, secure=secure, samesite="strict", max_age=1800)
    return result


@app.post("/api/login/client")
async def login(request: Request):
    token = request.cookies.get(cookie_name)
    entry = sessions.get(token)
    if not entry or not entry.get("digest"):
        return failure("SESSION_EXPIRED", "Start a fresh sign-in.")
    payload = await request.json()
    if not isinstance(payload.get("account"), str) or not isinstance(payload.get("password"), str):
        return failure("INVALID_REQUEST", "Enter your account and password.", 400)
    response, data = await invoke(request, "/portal/login", {
        "username": payload["account"], "password": payload["password"],
        "captcha": payload.get("answer") or None, "cdigest": entry["digest"],
    })
    if response.status_code != 200 or data.get("success") is not True:
        detail = data.get("detail")
        if isinstance(detail, str) and "captcha" in detail.lower():
            return failure("CAPTCHA_REQUIRED", "Ratio-D backend requested a new verification code.")
        return failure("LOGIN_REJECTED", "Ratio-D backend did not establish an SRM session.",
                       401 if response.status_code < 500 else 502)
    if not data.get("cookies") or not data.get("attendance"):
        return failure("PORTAL_CHANGED", "Login returned no verifiable attendance data.", 502)
    sessions.pop(token, None)
    token = secrets.token_urlsafe(32)
    entry.update({"cookies": data["cookies"], "report": report(data), "cached": time.monotonic()})
    sessions[token] = entry
    result = JSONResponse({"authenticated": True})
    result.set_cookie(cookie_name, token, httponly=True, secure=secure, samesite="strict", max_age=1800)
    return result


@app.get("/api/reports")
async def reports(request: Request):
    entry = sessions.get(request.cookies.get(cookie_name))
    if not entry or not entry.get("cookies"):
        return failure("SESSION_EXPIRED", "Please sign in again.")
    if time.monotonic() - entry.get("cached", 0) < 60:
        return entry["report"]
    response, data = await invoke(request, "/portal/refresh", {"cookies": entry["cookies"]})
    if response.status_code != 200:
        return failure("SESSION_EXPIRED", "Your SRM session expired.")
    entry.update({"cookies": data.get("cookies", entry["cookies"]),
                  "report": report(data), "cached": time.monotonic()})
    return entry["report"]


if os.environ.get("DIAGNOSTIC_STATIC_DIR") and not secure:
    app.mount("/", StaticFiles(directory=os.environ["DIAGNOSTIC_STATIC_DIR"], html=True))
