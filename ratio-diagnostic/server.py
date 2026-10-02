import asyncio
import base64
import concurrent.futures
import re
import importlib.util
import json
import os
import secrets
import sys
import time
import weakref
from types import SimpleNamespace
from capacity import can_admit
from refresh_queue import RefreshQueue
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
from academic_data import extras
from provider_flow import providers, combined, same_student, normalize_account, refresh as refresh_providers
from session_store import SessionStore, lifetime
import sync_schedule
import attendance_trends
from portal_exams import refresh_exams
from client_logs import ClientLogStore

# Upstream diagnostics include identifiers and CAPTCHA answers. Silence only
# its modules, once, rather than swapping process-wide stdout across awaits.
def _quiet_upstream(*args, **kwargs):
    pass


for _module in tuple(sys.modules.values()):
    _file = getattr(_module, "__file__", None)
    if _file and Path(_file).resolve().is_relative_to(ROOT / "upstream"):
        _module.print = _quiet_upstream

spec = importlib.util.spec_from_file_location("tinyocr_adapter", ROOT.parent / "portal-python/ocr.py")
ocr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocr)


# Admission ceilings, not measured login throughput or resource guarantees.
def _positive(name, default):
    try:
        return max(1, int(os.environ.get(name, default)))
    except (TypeError, ValueError):
        return default


API_CONCURRENCY = _positive("API_CONCURRENCY", 8)           # parallel /api/* handlers
OCR_CONCURRENCY = _positive("OCR_CONCURRENCY", 2)           # native inference workers
SESSION_LIMIT = _positive("SESSION_LIMIT", 2000)              # live sessions (>=100)
REFRESH_CONCURRENCY = _positive("REFRESH_CONCURRENCY", 4)
MEMORY_RESERVE_MB = _positive("MEMORY_RESERVE_MB", 160)
REFRESH_COOLDOWN = _positive("REFRESH_COOLDOWN", 60)
REFRESH_QUEUE_WAIT = _positive("REFRESH_QUEUE_WAIT", 600)
REFRESH_RESPONSE_WAIT = 1.5
refresh_response_waiters = 0

RATE_PER_MINUTE = _positive("RATE_PER_MINUTE", 30)           # per issued session
BOOTSTRAP_PER_MINUTE = _positive("BOOTSTRAP_PER_MINUTE", 1200)
SESSION_STARTS_PER_MINUTE = _positive("SESSION_STARTS_PER_MINUTE", 300)
PENDING_SESSION_LIMIT = min(SESSION_LIMIT, _positive("PENDING_SESSION_LIMIT", 512))
PENDING_SESSION_SECONDS = _positive("PENDING_SESSION_SECONDS", 300)
# This copy is reachable only through the private in-process ASGI client.
# Public admission already enforces per-session, campus and resource limits.
upstream.limiter.enabled = False
upstream.PORTAL_CAPTCHA_LIMIT = PENDING_SESSION_LIMIT + API_CONCURRENCY
RATE_TRACKED_KEYS = _positive("RATE_TRACKED_KEYS", 20000)    # bounded bucket table
PERSIST_INTERVAL = float(os.environ.get("PERSIST_INTERVAL", "5"))  # seconds
IO_THREADS = _positive("IO_THREADS", 16)
API_QUEUE = _positive("API_QUEUE", API_CONCURRENCY * 8)      # FCFS waiters before 503
QUEUE_WAIT = float(os.environ.get("API_QUEUE_WAIT", "12"))   # seconds a waiter may wait

gate = asyncio.Semaphore(API_CONCURRENCY)
ocr_slots = asyncio.Semaphore(OCR_CONCURRENCY)
ocr_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=OCR_CONCURRENCY, thread_name_prefix="anon-ocr")
waiters = 0
admission_waiters = 0
client_log_slots = asyncio.Semaphore(2)
session_locks = weakref.WeakValueDictionary()


class AdmissionTimeout(Exception):
    """The request has not entered its handler and can safely be resubmitted."""


async def dispatch(request, call_next, token, deadline=None):
    if not token:
        return await call_next(request)
    if request and request.method == "GET":
        return await call_next(request)
    lock = session_locks.setdefault(token, asyncio.Lock())
    try:
        if deadline is None:
            await lock.acquire()
        else:
            await asyncio.wait_for(lock.acquire(), max(0, deadline - time.monotonic()))
    except asyncio.TimeoutError as error:
        raise AdmissionTimeout from error
    try:
        return await call_next(request)
    finally:
        lock.release()


async def acquire_api(deadline=None):
    """Strict FCFS admission: callers queue on the semaphore in arrival order.
    Waiters beyond API_QUEUE, or past QUEUE_WAIT, get 503 with Retry-After.
    waiters is only touched without an awaiting gap, so the single event loop
    makes the check-and-increment atomic without a lock (which would also bind
    to whichever loop first used it and break multi-loop test suites)."""
    global waiters
    if waiters >= API_QUEUE:
        return False
    waiters += 1
    try:
        try:
            timeout = QUEUE_WAIT if deadline is None else min(QUEUE_WAIT, deadline - time.monotonic())
            await asyncio.wait_for(gate.acquire(), max(0, timeout))
            return True
        except asyncio.TimeoutError:
            return False
    finally:
        waiters -= 1


async def solve_image(image):
    # Bounded separately from the API gate so several logins can read CAPTCHAs
    # at once without letting OCR inference exhaust CPU or memory.
    await ocr_slots.acquire()
    slots = ocr_slots
    task = asyncio.get_running_loop().run_in_executor(ocr_executor, ocr.solve, image)
    # Cancellation cannot stop a running native inference. Keep its permit until
    # the worker actually exits, even when its HTTP request has disconnected.
    def finished(worker):
        slots.release()
        if not worker.cancelled():
            worker.exception()
    task.add_done_callback(finished)
    try:
        answer = await asyncio.shield(task)
        return True, answer, 200
    except Exception:
        return False, "OCR unavailable", 503


upstream.solve_captcha_ocr_bytes = solve_image
origin = os.environ["APP_ORIGIN"]
secure = origin.startswith("https://")
required_token = os.environ.get("BACKEND_TOKEN", "")
sessions = {}
rates = {}
cookie_name = "classpro_ratio_diagnostic"
session_store = None
persisted_at = 0.0
cleaned_at = 0.0


def persist(force=False):
    """Snapshot sessions to disk, throttled so bursts cannot block the loop."""
    global persisted_at
    if not session_store:
        return
    now = time.monotonic()
    if not force and now - persisted_at < PERSIST_INTERVAL:
        return
    persisted_at = now
    try:
        session_store.save(sessions)
    except Exception as exception:
        print(json.dumps({"event": "session_persist_failed",
                          "exception_type": type(exception).__name__}), flush=True)


async def persist_activity():
    while True:
        await asyncio.sleep(30)
        if session_store:
            try:
                session_store.touch(sessions)
            except Exception as error:
                print(json.dumps({"event": "session_persist_failed",
                                  "exception_type": type(error).__name__}), flush=True)


@asynccontextmanager
async def lifespan(app):
    global session_store
    if os.environ.get("SESSION_STORE_DIR"):
        session_store = SessionStore(os.environ["SESSION_STORE_DIR"])
        sessions.update(session_store.load())
        for entry in sessions.values():
            entry.setdefault("sync_offset", secrets.randbelow(300))
    log_dir = os.environ.get("CLIENT_LOG_DIR")
    app.state.client_logs = ClientLogStore(log_dir) if log_dir else None
    loop = asyncio.get_running_loop()
    loop.set_default_executor(concurrent.futures.ThreadPoolExecutor(
        max_workers=IO_THREADS, thread_name_prefix="anon-io"))
    print(json.dumps({"event": "service_started", "api_concurrency": API_CONCURRENCY,
                      "ocr_concurrency": OCR_CONCURRENCY, "session_limit": SESSION_LIMIT,
                      "rate_per_minute": RATE_PER_MINUTE, "io_threads": IO_THREADS,
                      "session_starts_per_minute": SESSION_STARTS_PER_MINUTE,
                      "bootstrap_per_minute": BOOTSTRAP_PER_MINUTE,
                      "pending_session_limit": PENDING_SESSION_LIMIT}), flush=True)
    async with upstream.lifespan(upstream.app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=upstream.app),
                                     base_url="http://ratio-internal", timeout=90) as client:
            app.state.client = client
            app.state.refresh_queue = RefreshQueue(REFRESH_CONCURRENCY, SESSION_LIMIT, refresh_job)
            activity_task = asyncio.create_task(persist_activity())
            try:
                yield
            finally:
                activity_task.cancel()
                await asyncio.gather(activity_task, return_exceptions=True)
                await app.state.refresh_queue.close()
                app.state.refresh_queue = None
    persist(force=True)
    if app.state.client_logs:
        app.state.client_logs.close()
    sessions.clear()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def failure(code, message, status=401):
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def admission_failure(code="SERVER_BUSY", message="Anon is busy. Please retry shortly.", wait=2):
    response = JSONResponse({"error": {"code": code, "message": message, "retryable": True}},
                            status_code=429 if code == "RATE_LIMIT" else 503)
    response.headers["Retry-After"] = str(wait)
    response.headers["Cache-Control"] = "no-store"
    return response


def rate_admission(key, limit, now):
    start, count = rates.get(key, (now, 0))
    if now - start >= 60:
        start, count = now, 0
    if count >= limit or (key not in rates and len(rates) >= RATE_TRACKED_KEYS):
        return admission_failure("RATE_LIMIT", "Please wait before retrying.",
                                 max(1, int(60 - (now - start)) + 1))
    rates[key] = (start, count + 1)
    return None


def session_expired(entry, now):
    if entry.get("providers") or entry.get("cookies"):
        return time.time() - entry.get("last_seen", time.time()) > lifetime(entry)
    return now - entry.get("created", now) > PENDING_SESSION_SECONDS


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
    result = {"updatedAt": datetime.now(timezone.utc).isoformat(),
              **extras(data, previous), "marks": {"data": marks}}
    if isinstance(data.get("exams"), dict):
        result["exams"] = data["exams"]
    elif isinstance((previous or {}).get("exams"), dict):
        result["exams"] = {**previous["exams"], "stale": True}
    return result


async def invoke(request, path, payload):
    trace_id = request.state.diagnostic_id if hasattr(request.state, "diagnostic_id") else secrets.token_hex(8)
    started = time.monotonic()
    response = await request.app.state.client.post(path, json=payload)
    data = response.json()
    detail = data.get("detail", "") if isinstance(data, dict) else ""
    category = "accepted" if response.status_code == 200 else "unclassified"
    if isinstance(detail, str):
        if "captcha" in detail.lower():
            category = "upstream_captcha_classification"
        elif "credentials" in detail.lower():
            category = "upstream_credentials_classification"
    print(json.dumps({"event": "portal_request", "route": path,
                      "request_id": trace_id, "duration_ms": round((time.monotonic() - started) * 1000),
                      "status": response.status_code, "classification": category}), flush=True)
    return response, data


@app.middleware("http")
async def boundary(request, call_next):
    global cleaned_at, admission_waiters
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
    if request.url.path == "/api/client-events":
        response = await receive_client_events(request)
        response.headers["Cache-Control"] = "no-store"
        return response
    now = time.monotonic()
    if now - cleaned_at >= 30:
        cleaned_at = now
        expired_tokens = []
        for key, entry in list(sessions.items()):
            expired = session_expired(entry, now)
            stale_challenge = now - entry.get("challenge_at", entry.get("created", now)) > PENDING_SESSION_SECONDS
            if expired or stale_challenge:
                previous = upstream._portal_captcha_sessions.pop(entry.pop("digest", None), None)
                if previous:
                    await previous.client.aclose()
            if expired:
                sessions.pop(key, None)
                rates.pop("session:" + key, None)
                expired_tokens.append(key)
        if session_store and expired_tokens:
            session_store.save_changes({}, removed=expired_tokens)
        for key, entry in list(rates.items()):
            if now - entry[0] > 60:
                rates.pop(key, None)
    token = request.cookies.get(cookie_name)
    entry = sessions.get(token)
    if entry and session_expired(entry, now):
        sessions.pop(token, None)
        rates.pop("session:" + token, None)
        previous = upstream._portal_captcha_sessions.pop(entry.pop("digest", None), None)
        if previous:
            await previous.client.aclose()
        if session_store:
            session_store.save_changes({}, removed=[token])
        entry = None
    address = (request.headers.get("x-anon-client-ip") if required_token else None) or (
        request.client.host if request.client else "unknown")
    lightweight = request.method == "GET" and request.url.path in {"/api/session", "/api/reports"}
    if entry:
        key, limit = "session:" + token, RATE_PER_MINUTE
    elif lightweight:
        key, limit = "bootstrap:" + address, BOOTSTRAP_PER_MINUTE
    elif request.method == "POST" and request.url.path == "/api/challenge":
        key, limit = "start:" + address, SESSION_STARTS_PER_MINUTE
    else:
        key, limit = address, RATE_PER_MINUTE
    rejected = rate_admission(key, limit, now)
    if rejected is not None:
        return rejected
    if entry and (entry.get("providers") or entry.get("cookies")):
        entry["last_seen"] = time.time()
    if not lightweight and request.method == "POST" and not can_admit(MEMORY_RESERVE_MB):
        return admission_failure(wait=15)
    if not lightweight and admission_waiters >= API_QUEUE:
        return admission_failure()
    counted = not lightweight
    if counted:
        admission_waiters += 1
    deadline = time.monotonic() + QUEUE_WAIT

    async def admitted(current_request):
        nonlocal counted
        global admission_waiters
        if not lightweight and not await acquire_api(deadline):
            raise AdmissionTimeout
        if counted:
            admission_waiters -= 1
            counted = False
        try:
            if not lightweight and request.method == "POST" and not can_admit(MEMORY_RESERVE_MB):
                return admission_failure(wait=15)
            try:
                response = await asyncio.wait_for(call_next(current_request), 95)
            except Exception as exception:
                print(json.dumps({"event": "ratio_exception", "request_id": request.state.diagnostic_id,
                                  "exception_type": type(exception).__name__}), flush=True)
                response = failure("PORTAL_UNAVAILABLE", "Student Portal request failed.", 502)
            if session_store and not lightweight:
                changed_token = getattr(request.state, "session_token", token)
                changed = {changed_token: sessions[changed_token]} if changed_token in sessions else {}
                removed = [token] if token and (token != changed_token or token not in sessions) else []
                session_store.save_changes(changed, removed=removed)
            return response
        finally:
            if not lightweight:
                gate.release()

    try:
        response = await dispatch(request, admitted, token if entry else None, deadline)
    except AdmissionTimeout:
        response = admission_failure()
    finally:
        if counted:
            admission_waiters -= 1
    if token in sessions and sessions[token].get("providers"):
        set_session_cookie(response, token, sessions[token])
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Request-ID"] = request.state.diagnostic_id
    return response


def set_session_cookie(response, token, entry):
    response.set_cookie(cookie_name, token, httponly=True, secure=secure, samesite="strict",
                        max_age=lifetime(entry) if entry.get("remember", True) else None)


async def receive_client_events(request):
    if request.method != "POST":
        return failure("METHOD_NOT_ALLOWED", "Method not allowed.", 405)
    store = getattr(request.app.state, "client_logs", None)
    if store is None:
        return JSONResponse({"accepted": 0}, status_code=202)
    try:
        payload = await request.json()
    except ValueError:
        return failure("INVALID_REQUEST", "Send an event batch.", 400)
    values = payload.get("events") if isinstance(payload, dict) else None
    if not isinstance(values, list) or len(values) > 10:
        return failure("INVALID_REQUEST", "Send up to ten events.", 400)
    if client_log_slots.locked():
        return JSONResponse({"accepted": 0}, status_code=202)
    async with client_log_slots:
        try:
            count = await asyncio.to_thread(store.append, values)
        except OSError:
            return JSONResponse({"accepted": 0}, status_code=202)
    return JSONResponse({"accepted": count}, status_code=202)


@app.get("/api/session")
async def session_status(request: Request):
    entry = sessions.get(request.cookies.get(cookie_name))
    return {"authenticated": bool(entry and providers(entry)), "authMode": "http",
            "provider": "academia", "providers": ["academia", "portal"],
            "serverAuto": True, "diagnosticBackend": True}


@app.delete("/api/session")
async def logout(request: Request):
    token = request.cookies.get(cookie_name)
    entry = sessions.pop(token, None)
    if token:
        rates.pop("session:" + token, None)
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
        pending = sum(not (item.get("providers") or item.get("cookies")) for item in sessions.values())
        if len(sessions) >= SESSION_LIMIT or pending >= PENDING_SESSION_LIMIT:
            return admission_failure("CAPACITY", "Sign-in is busy. Please try again shortly.", 15)
        if not can_admit(MEMORY_RESERVE_MB):
            return admission_failure(wait=15)
        token = secrets.token_urlsafe(32)
        entry = {"created": time.monotonic(), "remember": True, "last_seen": time.time(), "sync_offset": secrets.randbelow(300)}
        sessions[token] = entry
    request.state.session_token = token
    entry["pending_provider"] = provider
    entry["challenge_at"] = time.monotonic()
    if provider == "academia":
        result = JSONResponse({"required": False})
        set_session_cookie(result, token, entry)
        return result
    if entry.get("digest"):
        previous = upstream._portal_captcha_sessions.pop(entry["digest"], None)
        if previous:
            await previous.client.aclose()
    # Return the issued session even on an upstream failure, so a retry reuses
    # its bounded slot instead of leaving an unreachable pending session.
    try:
        response, data = await invoke(request, "/portal/captcha", {})
    except Exception:
        result = failure("PORTAL_UNAVAILABLE", "Cannot load SRM verification.", 502)
        set_session_cookie(result, token, entry)
        return result
    if response.status_code == 503 and data.get("detail") == {"type": "CAPTCHA_CAPACITY"}:
        result = admission_failure("CAPACITY", "Verification is busy. Please retry shortly.", 15)
        set_session_cookie(result, token, entry)
        return result
    if response.status_code != 200 or not data.get("captcha_image"):
        result = failure("PORTAL_UNAVAILABLE", "Cannot load SRM verification.", 502)
        set_session_cookie(result, token, entry)
        return result
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
    login_payload = {
        "username": normalize_account(payload["account"], provider),
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
    if provider == "portal":
        data["exams"] = await refresh_exams(data["cookies"])
    states[provider] = {"cookies": data["cookies"], "username": login_payload["username"],
                        "password": payload["password"], "report": report(data), "expired": False}
    entry["remember"] = payload.get("remember", entry.get("remember", True)) is not False
    entry["last_seen"] = time.time()
    sessions.pop(token, None)
    previous_rate = rates.pop("session:" + token, None)
    token = secrets.token_urlsafe(32)
    if previous_rate:
        rates["session:" + token] = previous_rate
    entry.update({"cookies": data["cookies"], "report": combined(entry), "cached": time.monotonic(), "synced_at": time.time()})
    attendance_trends.observe(entry, time.time())
    sessions[token] = entry
    request.state.session_token = token
    result = JSONResponse({"authenticated": True, "connections": entry["report"]["connections"]})
    set_session_cookie(result, token, entry)
    return result


async def refresh_job(token, entry, request):
    state = getattr(request, "state", None)
    queued_at = getattr(state, "queued_at", time.monotonic())
    started = None
    outcome = "discarded"
    exception_type = None
    lock = session_locks.setdefault(token, asyncio.Lock())
    acquired = False
    try:
        remaining = REFRESH_QUEUE_WAIT - (time.monotonic() - queued_at)
        async with asyncio.timeout(max(0, remaining)):
            while True:
                if sessions.get(token) is not entry or time.time() - entry.get("last_seen", time.time()) > lifetime(entry):
                    return False
                if time.monotonic() - queued_at >= REFRESH_QUEUE_WAIT:
                    raise TimeoutError
                if not can_admit(MEMORY_RESERVE_MB):
                    await asyncio.sleep(1)
                    continue
                await lock.acquire()
                acquired = True
                if sessions.get(token) is not entry or time.time() - entry.get("last_seen", time.time()) > lifetime(entry):
                    return False
                if time.monotonic() - queued_at >= REFRESH_QUEUE_WAIT:
                    raise TimeoutError
                if can_admit(MEMORY_RESERVE_MB):
                    break
                lock.release()
                acquired = False
        started = time.monotonic()
        entry["sync_attempted_at"] = time.time()
        try:
            data, succeeded = await asyncio.wait_for(
                refresh_providers(request, entry, invoke, report, refresh_exams), timeout=90)
        except Exception as error:
            entry["sync_failed"] = True
            exception_type = type(error).__name__
            outcome = "failed"
            return False
        entry["sync_failed"] = not succeeded
        entry.update({"report": data, "cached": time.monotonic()})
        if succeeded:
            entry["synced_at"] = time.time()
            attendance_trends.observe(entry, entry["synced_at"])
        outcome = "success" if succeeded else "failed"
        if session_store and sessions.get(token) is entry:
            session_store.save_changes({token: entry})
        return succeeded
    except TimeoutError:
        if sessions.get(token) is entry:
            entry.update({"sync_failed": True, "sync_attempted_at": time.time()})
        outcome = "queue_timeout"
        return False
    except asyncio.CancelledError:
        outcome = "cancelled"
        raise
    except Exception as error:
        outcome = "failed"
        exception_type = type(error).__name__
        raise
    finally:
        if acquired:
            lock.release()
        finished = time.monotonic()
        print(json.dumps({"event": "refresh_finished", "outcome": outcome,
                          "request_id": getattr(state, "diagnostic_id", None),
                          "queue_ms": round(((started if started is not None else finished) - queued_at) * 1000),
                          "duration_ms": round((finished - started) * 1000) if started is not None else 0,
                          "exception_type": exception_type}), flush=True)


@app.get("/api/reports")
async def reports(request: Request):
    global refresh_response_waiters
    token = request.cookies.get(cookie_name)
    entry = sessions.get(token)
    if not entry or not providers(entry):
        return failure("SESSION_EXPIRED", "Please sign in again.")
    now = time.time()
    force = request.query_params.get("force") == "1"
    cache_only = request.query_params.get("cache") == "only"
    queue = getattr(app.state, "refresh_queue", None)
    pending = queue and token in queue.jobs
    # Only a few requests may briefly await work. Large bursts still return
    # cached reports immediately and never occupy the login worker pool.
    wait_fast = (queue and request.query_params.get("wait") == "1"
                 and len(queue.jobs) < REFRESH_CONCURRENCY
                 and refresh_response_waiters < REFRESH_CONCURRENCY)
    recent = now - entry.get("sync_attempted_at", 0) < REFRESH_COOLDOWN
    wanted = force or sync_schedule.due(entry, now)
    if not cache_only and wanted and not pending and not recent:
        if queue:
            context = SimpleNamespace(app=app, state=SimpleNamespace(
                diagnostic_id=getattr(getattr(request, "state", None), "diagnostic_id", secrets.token_hex(12)),
                queued_at=time.monotonic()))
            pending = queue.submit(token, entry, context) is not None
        else:
            await refresh_job(token, entry, request)
    if wait_fast and pending:
        job = queue.jobs.get(token)
        if job is not None:
            refresh_response_waiters += 1
            try:
                # asyncio.wait never cancels the shared job on timeout or when
                # this browser disconnects. Other callers reuse the same work.
                await asyncio.wait({job}, timeout=REFRESH_RESPONSE_WAIT)
            finally:
                refresh_response_waiters -= 1
        pending = token in queue.jobs
    result = sync_schedule.response(entry, time.time())
    if entry.get("sync_failed"):
        result["warnings"] = [*result.get("warnings", []), "Sync could not finish. Your last data is still available; try again shortly."]
    recent = time.time() - entry.get("sync_attempted_at", 0) < REFRESH_COOLDOWN
    if queue and (pending or (wanted and not recent and not cache_only)):
        light = len(queue.jobs) <= REFRESH_CONCURRENCY
        result["sync"].update({"pending": True, "state": "queued" if pending else "busy",
                               "nextAt": (time.time() + (2 + secrets.randbelow(2) if light else 15 + secrets.randbelow(16))) * 1000})
    return result



if os.environ.get("DIAGNOSTIC_STATIC_DIR") and not secure:
    app.mount("/", StaticFiles(directory=os.environ["DIAGNOSTIC_STATIC_DIR"], html=True))
