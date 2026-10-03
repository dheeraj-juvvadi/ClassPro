"""Compare actual sync paths against delayed synthetic SRM HTML, never the network."""
import argparse
import asyncio
import hashlib
import json
import os
import sys
import time
from collections import Counter
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--backend", type=Path, default=Path(__file__).resolve().parent)
parser.add_argument("--latency-ms", type=int, default=250)
args = parser.parse_args()
if not 0 <= args.latency_ms <= 2000:
    parser.error("latency must be between 0 and 2000 ms")
for key in ("SESSION_STORE_DIR", "CLIENT_LOG_DIR", "BACKEND_TOKEN", "LEGACY_SESSION_COOKIE",
            "LEGACY_BACKEND_HEADER", "DIAGNOSTIC_STATIC_DIR"):
    os.environ.pop(key, None)
os.environ.update(APP_ORIGIN="http://localhost:8089", PYTHON_DOTENV_DISABLED="1")
sys.path.insert(0, str(args.backend.resolve()))
import httpx
import server
from core import portal_client

ATTENDANCE = """<table><tr><td>SYN001</td><td>Synthetic subject</td><td>40</td>
<td>32</td><td>8</td><td>80</td></tr></table>"""
MARKS = """<table><tr><td>SYN001</td><td>Synthetic subject</td><td>8 / 10</td><td>
<button onclick="funViewComponentWiseMarks('subject-id','SYN001','Synthetic',2)">View</button>
</td></tr></table>"""
DETAILS = """<table><tbody><tr><td>2026-09-01</td><td>Test</td><td>8 / 10</td></tr></tbody></table>"""
PROFILE = """<table><tr><td>Student Name</td><td>Synthetic student</td></tr>
<tr><td>Register No</td><td>SYNTHETIC</td></tr></table>"""
TIMETABLE = """<table><thead><tr><th>Day</th><th>08:00 - 08:50</th></tr></thead>
<tbody><tr><td>Day 1</td><td>SYN001</td></tr></tbody></table>"""
SHELL = '<input name="hdnFormDetails" value="1"><input name="csrfPreventionSalt" value="synthetic">'
HISTORY = """<table><tr><th>Semester</th><th>Month / Year</th><th>Code</th>
<th>Description</th><th>Credit</th><th>Grade</th></tr><tr><td>1</td><td>May/2026</td>
<td>SYN001</td><td>Synthetic subject</td><td>3</td><td>A</td></tr></table>"""
OFFICIAL = """<table><tr><th>Subject Code</th><th>Subject Description</th><th>Date &amp; Session</th></tr>
<tr><td colspan="3">No subjects found</td></tr></table>"""
SCRIBE = '<select id="txtExamMonthYear"><option value="11_2025">Nov-2025</option></select>'
SUBJECTS = """<table><tr><th>Subject Code</th><th>Subject Description</th><th>Date</th><th>Session</th></tr>
<tr><td>SYN001</td><td>Synthetic subject</td><td></td><td></td></tr></table>"""
PAGES = dict(zip(("studentAttendanceDetails.jsp", "studentInternalMarkDetails.jsp",
    "studentInternalMarkDetailsInner.jsp", "studentPersonalDetails.jsp", "studentTimeTableDetails.jsp",
    "HRDSystem.jsp", "studentMarksCredits.jsp", "StudentExamTimeTable.jsp", "Scribe.jsp", "ScribeInner.jsp"),
    (ATTENDANCE, MARKS, DETAILS, PROFILE, TIMETABLE, SHELL, HISTORY, OFFICIAL, SCRIBE, SUBJECTS)))


class Upstream:
    def __init__(self, expired=False):
        self.calls = Counter()
        self.expired = expired
        self.unexpected = []

    async def request(self, request):
        name = request.url.path.rsplit("/", 1)[-1]
        self.calls[name] += 1
        await asyncio.sleep(args.latency_ms / 1000)
        if name not in PAGES:
            self.unexpected.append(name)
            return httpx.Response(500)
        if self.expired and "JSESSIONID=old" in request.headers.get("cookie", ""):
            return httpx.Response(200, text='<form id="login_form"></form>')
        return httpx.Response(200, text=PAGES[name])


def seed(expired):
    server.sessions.clear()
    server.rates.clear()
    server.sessions["synthetic"] = {"created": time.monotonic(), "last_seen": time.time(),
        "remember": False, "report": {}, "providers": {"portal": {
            "username": "synthetic", "password": "test-only", "report": {},
            "cookies": {"JSESSIONID": "old" if expired else "valid"}}}}


class RecoverySession:
    def __init__(self):
        self.client = httpx.AsyncClient(transport=portal_client._BorrowedTransport())
        self.captcha_bytes = b"synthetic"
        self.authenticated_attendance = ATTENDANCE

    async def load_captcha(self):
        await asyncio.sleep(args.latency_ms / 1000)

    async def login(self, *credentials):
        await asyncio.sleep(args.latency_ms / 1000)
        return {"ok": True, "cookies": {"JSESSIONID": "fresh"}}


async def case(expired):
    source = Upstream(expired)
    with patch.object(portal_client, "_shared_transport", httpx.MockTransport(source.request)), \
         patch.object(server.upstream, "PortalSession", RecoverySession):
        async def solve(image):
            return True, "CODE", 200

        with patch.object(server.upstream, "solve_captcha_ocr_bytes", side_effect=solve):
            async with server.lifespan(server.app):
                seed(expired)
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
                    base_url="http://localhost:8089", headers={"cookie": "anon_session=synthetic"}) as client:
                    started = time.perf_counter()
                    response = await client.get("/api/reports?force=1&wait=1")
                    await server.app.state.refresh_queue.queue.join()
                    finished = time.perf_counter()
                    result = (await client.get("/api/reports?cache=only")).json()
                    assert response.status_code == 200
                    assert result["attendance"]["data"][0]["present"] == 32
                    assert result["marks"]["data"][0]["components"][0]["scored"] == 8
                    assert result["schedule"]["entries"][0]["code"] == "SYN001"
                    assert not source.unexpected
                    return {"scenario": "expired_session" if expired else "warm_session",
                            "sync_ms": round((finished - started) * 1000, 1),
                            "upstream_requests": sum(source.calls.values()),
                            "calls": dict(sorted(source.calls.items()))}


async def main():
    # Every provider uses the synthetic transport; accidental network use fails.
    with patch("httpx.AsyncHTTPTransport.handle_async_request", side_effect=AssertionError("Live network disabled")):
        with redirect_stdout(sys.stderr):
            results = [await case(False), await case(True)]
    print(json.dumps({"scope": "synthetic actual sync routes; no live SRM timing",
        "backend": str(args.backend.resolve()), "per_request_latency_ms": args.latency_ms,
        "dataset_sha256": hashlib.sha256(json.dumps(PAGES, sort_keys=True).encode()).hexdigest(),
        "results": results}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
