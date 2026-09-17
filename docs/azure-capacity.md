# Azure capacity and burst handling — September 17, 2026

Production target: existing Standard_B2ats_v2 VM, 2 vCPUs, 893 MiB RAM.
No VM resize or added paid service. These are synthetic measurements, not a
promise of complete SRM login latency or a guarantee of maximum user capacity.

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
