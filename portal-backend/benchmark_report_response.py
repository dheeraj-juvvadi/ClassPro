"""Compare the real cached-report route; synthetic data, no network or disk writes."""
import argparse
import asyncio
import copy
import hashlib
import json
import os
import platform
import statistics
import time
from datetime import date, timedelta
from unittest.mock import patch

# Clear external-service/storage configuration before importing the application.
for name in ("SESSION_STORE_DIR", "CLIENT_LOG_DIR", "BACKEND_TOKEN", "LEGACY_BACKEND_HEADER",
             "LEGACY_SESSION_COOKIE", "DIAGNOSTIC_STATIC_DIR"):
    os.environ.pop(name, None)
os.environ.update(APP_ORIGIN="http://localhost:8089", PYTHON_DOTENV_DISABLED="1")

import httpx
import pydantic
from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from report_response import ReportResponse
import server


def synthetic_report(courses=10):
    attendance = [{"code": f"SYN{i:03}", "title": f"Synthetic course {i} – अभ्यास",
                   "present": 31, "conducted": 40, "absent": 9, "percentage": 77.5,
                   "faculty": "Synthetic faculty", "room": "SYN 101", "credits": "3.0"}
                  for i in range(courses)]
    marks = [{"code": row["code"], "title": row["title"], "scored": None, "total": None,
              "components": [{"name": f"Test {i}", "scored": 8.5, "total": 10,
                              "enteredOn": "2026-09-01"} for i in range(5)]}
             for row in attendance]
    calendar = [{"date": str(date(2026, 1, 1) + timedelta(days=i)), "kind": "teaching",
                 "dayOrder": str(i % 5 + 1), "label": "Synthetic benchmark only"}
                for i in range(250)]
    entries = [{"code": row["code"], "title": row["title"], "dayOrder": str(day),
                "start": "08:00", "end": "08:50", "hours": 1} for day in range(1, 6)
               for row in attendance]
    return {"attendance": {"data": attendance}, "marks": {"data": marks},
            "profile": {"name": "Synthetic student", "regNo": "SYNTHETIC"},
            "schedule": {"timezone": "Asia/Kolkata", "entries": entries,
                         "calendar": calendar, "calendarSource": "Synthetic"},
            "academicHistory": {"status": "unavailable"}, "courses": {}, "monthly": [],
            "connections": {"portal": {"connected": True, "expired": False}}, "warnings": []}


def measure(function, iterations):
    values = []
    for _ in range(5):
        started = time.perf_counter()
        for _ in range(iterations):
            function()
        values.append((time.perf_counter() - started) * 1000 / iterations)
    return round(statistics.median(values), 4)


def summarize(values):
    ordered = sorted(values)
    return {"median_ms": round(statistics.median(ordered), 3),
            "p95_ms": round(ordered[max(0, int(len(ordered) * .95) - 1)], 3)}


def application(native):
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.middleware("http")(server.boundary)
    app.add_api_route("/api/reports", server.reports, methods=["GET"],
                      response_model=ReportResponse if native else None)
    return app


async def run_case(native, report, concurrency, requests):
    app = application(native)
    server.sessions.clear()
    server.rates.clear()
    for index in range(concurrency):
        server.sessions[f"synthetic-{index}"] = {
            "created": time.monotonic(), "last_seen": time.time(), "remember": False,
            "providers": {"portal": {"report": {}}}, "synced_at": time.time(),
            "report": copy.deepcopy(report), "sync_attempted_at": time.time()}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                base_url="http://localhost:8089") as client:
        async def worker(index, count):
            values = []
            for _ in range(count):
                started = time.perf_counter()
                response = await client.get("/api/reports?cache=only", headers={
                    "cookie": f"{server.cookie_name}=synthetic-{index}"})
                values.append((time.perf_counter() - started) * 1000)
                assert response.status_code == 200
                body = response.json()
                body.pop("sync")
                assert body == report
            return values
        await worker(0, 10)
        started = time.perf_counter()
        cpu_started = time.process_time()
        batches = await asyncio.gather(*(worker(i, requests // concurrency)
                                        for i in range(concurrency)))
        cpu_ms = (time.process_time() - cpu_started) * 1000
        elapsed = time.perf_counter() - started
    values = [value for batch in batches for value in batch]
    server.sessions.clear()
    return {**summarize(values), "requests_per_second": round(len(values) / elapsed, 1),
            "cpu_ms_per_request": round(cpu_ms / len(values), 3)}


async def main(args):
    report = synthetic_report(args.courses)
    previous = lambda: JSONResponse(jsonable_encoder(report)).body
    native = lambda: ReportResponse.model_validate(report).model_dump_json().encode()
    assert json.loads(previous()) == json.loads(native()) == report
    output = {"scope": "local synthetic cached reports; ASGI, no SRM or live throughput",
              "python": platform.python_version(), "pydantic": pydantic.__version__,
              "courses": args.courses, "payload_bytes": len(previous()),
              "dataset_sha256": hashlib.sha256(previous()).hexdigest(),
              "encoding_ms": {"previous": measure(previous, args.requests),
                              "rust_core": measure(native, args.requests)}, "http": []}
    with patch.object(server, "RATE_PER_MINUTE", args.requests * 100):
        for concurrency in (1, 4, 8):
            results = {False: [], True: []}
            for repetition in range(args.repetitions):
                for mode in ((False, True) if repetition % 2 == 0 else (True, False)):
                    results[mode].append(await run_case(mode, report, concurrency, args.requests))
            output["http"].append({"concurrency": concurrency, **{
                "rust_core" if mode else "previous": {
                    key: round(statistics.median(row[key] for row in rows), 3)
                    for key in rows[0]} for mode, rows in results.items()}})
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--requests", type=int, default=240)
    parser.add_argument("--repetitions", type=int, default=3)
    parser.add_argument("--courses", type=int, default=10)
    args = parser.parse_args()
    if args.requests < 8 or args.repetitions < 1 or not 1 <= args.courses <= 200:
        parser.error("requests >= 8, repetitions >= 1, and 1 <= courses <= 200 required")
    asyncio.run(main(args))
