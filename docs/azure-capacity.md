# Azure capacity and burst handling — September 17, 2026

Production target: existing Standard_B2ats_v2 VM, 2 vCPUs, 893 MiB RAM.
No VM resize or added paid service. These are synthetic measurements, not a
promise of complete SRM login latency or a guarantee of maximum user capacity.

## September 19: prompt sync completion feedback

The old cached response deferred its next check by 15–30 seconds; the browser's
15-second schedule tick could add another delay even after the upstream job
finished. A `wait=1` report request can now await its shared job for at most 1.5
seconds when there are fewer than four jobs/waiters. Finished results return in
that same response. Timeout/disconnection does not cancel the shared refresh.

Larger bursts retain immediate cached replies and the existing four-worker queue.
Pending low-load work suggests a check in 2–3 seconds, while busy queues retain
15–30-second jitter. The browser uses a single pending timer and cache-only
follow-ups, with a five-second minimum after five checks. Hidden/offline pages
defer checks. Queued follow-ups neither resubmit credentials nor start upstream
work. A queue-full `busy` reply retries admission after its server delay.

Tests verify prompt completed responses, continued work after the brief wait,
deduplication, and UI completion without waiting for the schedule tick. The
live public session endpoint responded in 0.93 seconds during investigation;
that is not a measurement of SRM refresh latency. The upstream provider can
still take longer than two seconds. Existing admission/memory limits remain.

## Production controls

- Session ceiling: 2,000 (previously 200), subject to memory admission.
- Native OCR: two dedicated executor workers, separate from report parsing.
- Login/mutation handlers: eight; FIFO overflow queue remains bounded.
- Refresh: four background workers, at most one job per session, 2,000 queued
  entries. HTTP responses return cached reports and an explicit pending state.
- Repeated manual refreshes within 60 seconds reuse the result/attempt; pending
  requests share one job. Queue polling uses a randomized 15–30 second delay.
- Session and cached-report reads bypass upstream admission. Authenticated users
  have separate rate buckets, so a shared campus/proxy address is not one bucket.
- Automatic refresh offsets spread each hourly slot over five minutes. Manual
  refreshes enqueue immediately. No automatic Sunday refresh is introduced.
- Docker CPU quota: 1.8 CPUs, leaving 10% of two CPUs for the host.
- Expensive work/new sessions pause below 160 MiB available memory, using both
  host and cgroup availability. This is above the requested 89.3 MiB minimum
  reserve and gives running tasks room. It is admission control, not a hard
  guarantee against every allocation spike or unrelated host process.

## Persistence

Responses persist only the changed session, with token rotation/deletion in one
transaction. Cache/session reads do not serialize all reports. Activity expiry
is batched every 30 seconds; shutdown flushes the complete state. An abrupt crash
can lose the latest 30 seconds of activity extension, not previously committed
credentials or reports. Saves and restores stream rows, avoiding a whole encrypted
payload copy. Encryption and seven-day remembered-session policy are unchanged.

## Measured on Azure, isolated network-disabled containers

OCR: real ONNX inference on synthetic 175×45 images; uncertainty in decoding is
counted as inference, so these measurements say nothing about recognition accuracy.
100-item bursts, 10 seconds per worker count, 192 MiB RAM, 1.8 CPU quota:

| Workers | Inferences/sec | p95 queue + inference | Max observed | Peak RSS |
| --- | ---: | ---: | ---: | ---: |
| 1 | 323.14 | 295.48 ms | 319.18 ms | 59.9 MiB |
| 2 | 353.83 | 270.32 ms | 293.24 ms | 63.0 MiB |
| 4 | 355.98 | 271.36 ms | 286.14 ms | 63.5 MiB |
| 6 | 356.21 | 273.39 ms | 285.09 ms | 68.4 MiB |

Two workers retain essentially the same throughput with fewer active workers.
At unrestricted two CPUs, the initial run reached 388.43/sec; do not use that
number for the production quota. Burstable CPU credits and mixed traffic still
require longer observation. Four seconds is not a guaranteed full-login maximum:
SRM requests, report fetches and CAPTCHA retries are outside local inference.

Persistence: synthetic ~42 KB provider report per session, 1 CPU/192 MiB,
three save/restore cycles. Corrected benchmark drops the prior restored copy
before the next cycle (the earlier harness retained it and inflated peak RSS).
2,000 sessions passed at 145,668 KiB peak RSS; median full save/restore 1,389.78 ms,
maximum 5,741.56 ms, incremental single-session save mean 9.545 ms. This does not
include two live providers, large real timetable payloads, or all application
memory. Actual admission can stop below 2,000 to preserve memory headroom.

Burst: 1,000 synthetic authenticated users sent 2,000 ASGI session/force-sync
requests concurrently. 192 MiB container, 1.8 CPUs, test reserve 20 MiB (over 10%
of that container). Accepted all in 1.667 seconds, per-user p95 1,497.1 ms,
max 1,519.41 ms. Four refresh workers maximum, all 1,000 jobs completed;
33.666 seconds to drain with 20 ms simulated upstream delay. RSS 134,560 KiB.
Memory admission pauses are included. No real SRM traffic or public network
was exercised. With real upstream latency L seconds, four workers require roughly
250 × L seconds to drain 1,000 jobs, plus overhead/retries. Queuing keeps the app
usable; it cannot make 1,000 upstream operations finish simultaneously.

Reproduce with `benchmark_ocr.py`, `benchmark_sessions.py --sessions 2000`, and
`benchmark_burst.py` inside an isolated production image. Never point these at
live credentials or the live session database. Production logs already record
upstream duration/status/request ID without request bodies or credentials.

## Queue lifecycle and operational logs

Queued work expires after ten minutes (`REFRESH_QUEUE_WAIT=600`), including
memory admission and session-lock waits. Memory is checked again under the lock,
which is released before waiting for memory. Removed/expired sessions are checked before contacting
SRM. A timed-out job preserves cached reports and reports a retryable sync failure;
it does not silently keep an upstream job alive indefinitely. The deadline is
for queued admission; a started upstream refresh has its separate 90-second limit.

Each finished refresh logs request ID, outcome, queue milliseconds, execution
milliseconds and exception type only. Queue time includes memory and lock waits;
execution time starts at upstream admission. No token, account, report, cookie, password
or exception message is logged. Docker logs rotate at 10 MB × 3 files, keeping
operational logging bounded. Client error JSONL and its daily summary remain in
`/var/log/anon/client` and `/var/log/anon/reports` as documented separately.

Azure Monitor observation on September 17: hourly CPU credit averages increased
from 477.92 to 518.31 across the three latest buckets; the latest bucket averaged
8.34% CPU. This establishes that credits were available during the observation,
not sustained capacity at a 1,000-user login/sync peak.

## Sign-in burst admission and embedded-client fixes

The September 17 continuation removes two previously missed internal bottlenecks:
the embedded the upstream client limiter counted every request against its loopback IP
(Academia 5/minute, Portal login/challenge 15/minute), and its 20-entry CAPTCHA
pool evicted active challenges. The private ASGI copy now uses the outer
service's admission rules. Its standalone limiter remains enabled by default.
CAPTCHA reservations are bounded before loading; overflow leaves existing codes
intact. A client's close no longer shuts down the shared Portal connection pool.

- Issued sessions, including unfinished sign-ins, have separate 30/minute buckets.
  Token rotation preserves the bucket. Shared-IP bootstrap reads get 1,200/minute;
  new-session starts get 300/minute. These ceilings do not imply that many full
  logins can complete per minute.
- At most 512 unfinished sessions, expiring after five minutes. Abandoned
  reconnection challenges expire too, preserving the connected account.
- The 64-waiter cap includes session-lock and worker waits. Both share the same
  12-second admission deadline. Duplicate requests wait outside the eight-worker
  pool, and memory is rechecked after waiting. Session/cache reads remain available.
- Login and reconnection retry only explicit pre-processing admission rejections.
  They honor Retry-After and add jitter, stop after five total attempts or the
  retry deadline, and do not resubmit credentials after network/timeout/password
  failures. A started request can outlast the retry window; it is never replayed
  on an uncertain outcome. CAPTCHA age further limits retries.

Local synthetic 50-user test, all on one IP, one provider per user, each mocked
upstream login taking exactly four seconds: all 50 completed; first 4.049s,
median 18.303s, p95 26.543s, last 30.331s, eight upstream calls maximum,
26 admission retries, zero remaining waiters. No SRM requests or real accounts.
This illustrates queue behavior and must not be described as measured SRM speed.

Regression checks also exercise 50 real embedded CAPTCHA routes with fake SRM
clients, 50 embedded Academia routes, client/pool ownership, cancellation,
overflow, stale challenges, memory rechecks and non-retryable failures.
