"""Measure actual Academia sync with synthetic HTML and independently delayed grids."""
import argparse
import asyncio
import hashlib
import json
import os
import sys
import time
from collections import Counter
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--backend", type=Path, default=Path(__file__).resolve().parent)
parser.add_argument("--latency-ms", type=int, default=500)
parser.add_argument("--unused-ms", type=int, default=1500)
args = parser.parse_args()
if not all(0 <= value <= 5000 for value in (args.latency_ms, args.unused_ms)):
    parser.error("delays must be between 0 and 5000 ms")
for name in ("SESSION_STORE_DIR", "CLIENT_LOG_DIR", "BACKEND_TOKEN", "LEGACY_SESSION_COOKIE",
             "LEGACY_BACKEND_HEADER", "DIAGNOSTIC_STATIC_DIR"):
    os.environ.pop(name, None)
os.environ.update(APP_ORIGIN="http://localhost:8089", PYTHON_DOTENV_DISABLED="1")
sys.path.insert(0, str(args.backend.resolve()))
import httpx
import server

PROFILE = """<table><tr><td>Student Name</td><td>Synthetic student</td></tr>
<tr><td>Register No</td><td>SYNTHETIC</td></tr><tr><td>Batch</td><td>2026/1</td></tr></table>
<table><tr><th>Course Code</th></tr><tr><td>1</td><td>SYN00001</td><td>Synthetic course</td>
<td>3</td><td></td><td></td><td>Theory</td><td>Sample faculty</td><td>A</td><td>R1</td><td></td></tr></table>"""
ATTENDANCE = """<table><tr><td>SYN00001</td><td>Synthetic course</td><td>Theory</td>
<td></td><td>A</td><td></td><td>40</td><td>8</td><td>80</td></tr></table>"""
GRID = '<table><tr><th>Day</th><th>08:00 - 08:50</th></tr><tr><td>Day 1</td><td>A</td></tr></table>'


async def measure(known_batch):
    calls, cancelled = Counter(), Counter()

    class SyntheticAcademia:
        def __init__(self, *credentials):
            self.session_handler = SimpleNamespace(client=SimpleNamespace(cookies=httpx.Cookies({"session": "valid"})))

        async def read(self, name, html, delay):
            calls[name] += 1
            try:
                await asyncio.sleep(delay / 1000)
                return html
            except asyncio.CancelledError:
                cancelled[name] += 1
                raise

        async def get_profile_html(self):
            return await self.read("profile", PROFILE, args.latency_ms)

        async def get_attendance_html(self):
            return await self.read("attendance", ATTENDANCE, args.latency_ms)

        async def get_grid_html(self, batch):
            return await self.read(batch, GRID, args.latency_ms if batch == "Batch_1" else args.unused_ms)

    with patch.object(server.upstream, "AcademiaClient", SyntheticAcademia):
        async with server.lifespan(server.app):
            server.sessions.clear()
            server.rates.clear()
            server.upstream.limiter.reset()
            server.sessions["synthetic"] = {"created": time.monotonic(), "last_seen": time.time(),
                "remember": False, "report": {}, "providers": {"academia": {"username": "synthetic",
                "cookies": {"session": "valid"}, "report": {"profile": {"batch": "1"}} if known_batch else {}}}}
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
                    base_url="http://localhost:8089", headers={"cookie": "anon_session=synthetic"}) as client:
                start = time.perf_counter()
                response = await client.get("/api/reports?force=1&wait=1")
                await server.app.state.refresh_queue.queue.join()
                elapsed = (time.perf_counter() - start) * 1000
                result = (await client.get("/api/reports?cache=only")).json()
                assert response.status_code == 200
                assert result["attendance"]["data"][0]["present"] == 32
                assert result["schedule"]["entries"][0]["code"] == "SYN00001"
                assert result["profile"]["batch"] == "1"
                assert not result.get("warnings")
                return {"scenario": "saved_batch" if known_batch else "unknown_batch",
                        "sync_ms": round(elapsed, 1), "calls": dict(calls), "cancelled": dict(cancelled)}


async def main():
    with patch("httpx.AsyncHTTPTransport.handle_async_request", side_effect=AssertionError("Live network disabled")):
        with redirect_stdout(sys.stderr):
            results = [await measure(True), await measure(False)]
    print(json.dumps({"scope": "synthetic actual sync route; no live SRM timing",
        "backend": str(args.backend.resolve()), "relevant_latency_ms": args.latency_ms,
        "unused_grid_ms": args.unused_ms,
        "dataset_sha256": hashlib.sha256((PROFILE + ATTENDANCE + GRID).encode()).hexdigest(),
        "results": results}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
