# Selective Rust backend work — October 3, 2026

Use measured improvements inside the existing service. A complete backend rewrite
is not justified by the current evidence. The earlier standalone Axum prototype
uses synthetic providers and does not establish production speed or feature parity.
Its original source remains at `/private/tmp/classpro-rust-rewrite/portal-rust`.

## Implemented improvement

The authenticated `/api/reports` route now declares a strict JSON response model.
FastAPI 0.141.1 uses its installed Pydantic Rust core to validate and serialize
directly to JSON bytes, avoiding recursive Python `jsonable_encoder` traversal
followed by standard-library encoding. No additional dependency, service, compiler,
deployment target, or Rust toolchain is needed in production.

The model preserves unknown JSON fields, strings used for numeric metadata,
Unicode, nullable marks, nested objects, booleans, and large integers. It rejects
nonfinite values instead of silently replacing invalid attendance with null.
Error Response objects bypass the success model. This encoding change retains
authentication, cookies, rate limits, encryption, and report values. Separate
sync-path changes below remove unnecessary requests and completion delays.

## Local measurements

Command: `python portal-backend/benchmark_report_response.py` with production
dependencies installed. The script compares the same report handler and boundary,
using the old response encoding or the new response model. It only requests the
cache-only route against synthetic in-memory sessions. No real account, SRM
request, production storage, or hosted load test is involved.

Measured on macOS arm64, Python 3.11.16, Pydantic 2.11.4. Payload: 35,459 bytes,
10 courses, 50 assessment components, 50 periods, and 250 synthetic calendar days.
Each concurrency level uses 240 requests and three repetitions with alternating
order and warmup. Values below are medians across repetitions.

| Concurrent clients | Previous median / p95 | Rust core median / p95 | Previous → new requests/s |
| --- | --- | --- | --- |
| 1 | 2.456 / 2.699 ms | 0.852 / 0.975 ms | 369.1 → 926.4 |
| 4 | 10.751 / 11.767 ms | 3.795 / 4.420 ms | 365.7 → 943.8 |
| 8 | 22.893 / 24.198 ms | 7.840 / 9.241 ms | 340.1 → 913.6 |

Encoding alone: 1.915 → 0.401 ms, about 4.8× faster. Cached-route throughput:
2.5–2.7× higher. CPU time per request falls approximately 62%. The HTTP benchmark
includes the in-process test client and contract assertions as well as server work;
it is not a public-network or Azure capacity measurement. Memory savings were not
measured. The dataset SHA-256 is emitted by the script for reproducibility.

The isolated single-request saving is approximately 1.6 ms. That cannot establish
a comparable improvement to a login or sync that waits on SRM. This optimization
primarily frees CPU during cached-report bursts. Cloud cost savings would require
a separate demonstrated capacity or instance-sizing change; none is claimed.

## Keep or reconsider

| Component | Decision |
| --- | --- |
| Cached-report JSON response | Use the measured Rust-core serialization path. |
| OCR inference | Keep ONNX Runtime and NumPy; native inference already runs outside Python bytecode. |
| HTML parsing | Keep selectolax/lxml; no equivalent Rust parser has shown a useful measured gain. |
| TLS, encryption and SQLite | Keep their existing native libraries and storage format. |
| SRM login, dynamic forms and cookies | Keep the working implementation; language changes do not remove upstream latency. |
| Queues and cache deduplication | Keep current bounded controls; wait on the existing completion future at low load. |
| Session JSON serialization | Measure full encrypted save/restore before changing it; a codec microbenchmark alone is insufficient. |
| Standalone Rust server | Preserve as experimental work; do not deploy a fixture-only replacement. |

Verification includes the real route's byte-serialization path, unchanged response
fields/security headers, expired-session errors, and rejection of invalid numeric
values. Existing refresh and session tests cover the surrounding behavior.

## Sync and recovery latency

The production wrapper still fetched retired exam pages after every Student
Portal login and on forced refresh. Those unused fetches are removed from both
paths; their parsers and saved records remain for possible future use. Active
attendance, marks, schedule, and academic-history reads remain fresh on sync.

After a cookie-only request returns 401, the internal recovery request explicitly
skips the duplicate expired-report fanout. Credentials still go to the provider
only during recovery. Portal attendance failure cancels and drains optional reads
before reconnection; a stalled optional page cannot delay a known-expired session.
The same-operation attendance HTML that verified login is reused for its initial
report, with fresh fetching on later syncs. Shared TCP/TLS connections retain the
existing 50-idle/200-total bounds but allow 60-second reuse instead of five seconds.

At low load the backend advertises `sync.waitForCompletion`; the browser then
uses `cache=only&wait=1` to await the existing job for at most five seconds. It
returns immediately when that job finishes, does not start a new refresh, and
does not consume a login or refresh slot. Four waiting responses maximum;
busy/older backends retain normal backoff. Cached startup without `wait=1` stays
immediate. Disconnects do not cancel shared work; removed sessions return 401.

`benchmark_sync_path.py` compares the actual old/new public sync routes using
identical delayed synthetic SRM HTML and mocked authentication/OCR. Live network
access is prohibited. The previous code is commit `0681f413fa8f29a46d6015279d977a69ab48a02b`.
The two-second portal recovery wait is retained in both versions. One run per
scenario is reported; these are controlled examples, not production percentiles.

| Simulated latency per SRM read | Scenario | Before | After | Saved |
| --- | --- | --- | --- | --- |
| 250 ms | Warm sync | 1.052 s | 0.534 s | 0.518 s |
| 250 ms | Expired-session recovery | 4.058 s | 3.275 s | 0.783 s |
| 500 ms | Warm sync | 2.054 s | 1.030 s | 1.024 s |
| 500 ms | Expired-session recovery | 6.055 s | 4.528 s | 1.528 s |

Measured report/exam requests: 10 → 7 for warm sync, 20 → 11 for recovery.
The challenge/login mock delays are identical and are not counted as report
requests. Dataset hash and endpoint counts are emitted for both versions.
TCP/TLS reuse and browser completion savings are additional, unmeasured by this
transport benchmark. A browser regression verifies completion within 1.5 seconds
after the server result becomes available even after the old backoff threshold.

Run against a separate source snapshot using `--backend /path/to/portal-backend`
and `--latency-ms 250` or `500`; use the same Python dependencies for both versions.
Real gains depend on SRM response times, session expiry, and network conditions.
No lower refresh-worker limits, stale substitutes for live attendance, shortened
provider authentication waits, or additional recurring services are introduced.

Final local validation: 184 backend tests, 130 frontend release tests, six focused
sync/proxy checks, static build and offline-shell consistency passed. Regression
coverage includes cancelled optional report requests, one expiry check before
recovery, login attendance reuse, bounded completion waits, logout during waits,
and ensuring retired exam fetches cannot run during login or manual sync.

## October 4 follow-up

Academia now starts the saved batch's grid beside profile and attendance. The
fresh profile verifies that hint; a changed batch starts the correct grid and
cancels the unused one. Without a hint both start concurrently, then the unused
request is cancelled once the batch is known. Unknown profile batch labels keep
the existing two-grid fallback. Required-request failures and cancellation drain
all outstanding requests before their cookie jar closes.

Portal CAPTCHA verification still waits until the challenge is at least two
seconds old. Its monotonic timestamp now counts time already spent doing OCR or
waiting for submission, instead of always adding two more seconds. Reloading a
challenge resets that timestamp. No provider wait minimum is shortened.

Actual sync-route benchmarks against `37baa54`, with network disabled and the
same synthetic HTML on each side:

| Scenario | Before | After | Saved |
| --- | --- | --- | --- |
| Academia saved batch: relevant pages 500 ms, other grid 1500 ms | 1.522 s | 0.522 s | 1.000 s |
| Academia no saved batch, same delays | 1.509 s | 0.513 s | 0.996 s |
| Portal recovery: pages 250 ms, OCR 750 ms | 4.026 s | 3.280 s | 0.746 s |

These single-run examples isolate the intended slow-grid and OCR cases; they are
not live SRM percentiles. Saved-batch requests fall from four to three; initial
discovery starts four and cancels one. When both grids take equally long, the
request reduction alone does not imply a second saved. Portal warm sync remains
approximately 0.53 seconds in both versions; the new wait change affects login
and recovery. Provider refreshes overlap, so these savings cannot simply be added.

Reproduce with `benchmark_academia_sync.py` (500/1500 ms defaults) and
`benchmark_sync_path.py --latency-ms 250 --ocr-ms 750`. Pass `--backend` pointing
at a separate `37baa54` checkout for the baseline. Both verify returned data and
emit fixture hashes. Focused checks cover batch changes, missing labels, expired
sessions, unrelated-grid failure, required-request failure and challenge age.
All 197 backend tests pass locally with the production Python dependencies.
