# User log review — October 15, 2026

Reviewed the live Azure `anon-api` container at revision `4e7c3d2` around
03:07 UTC. Only aggregate operational data was collected; no credentials,
account records, or raw user payloads were inspected.

## Client events

The retained seven UTC calendar days contained 791 events:

- No manual `user_report` events or JavaScript runtime/promise errors.
- 16 HTTP 401 events, seven network failures, and two failed asset loads.
- The remaining events were optional page views and engagement.

These are best-effort diagnostics. Network and asset events lack enough
information to establish a reproducible application defect.

## Runtime and capacity

The 168-hour operational review contained 99 completed refresh jobs, all marked
successful. Queue time had a 1 ms maximum. Refresh duration was 3.56 seconds at
the median and 7.61 seconds at the 95th percentile. The longest provider request
accounted for most of that time (3.35 seconds median; 7.46 seconds p95).

There were 14 Portal login rejections classified as CAPTCHA-related and two
Academia login rejections classified as credential-related. Expired provider
refreshes returned 401 and the application supports automatic reauthentication.
No backend exception or session-persistence failure events were present.

Three resource observations, five seconds apart, showed about 119 MiB used
against a 384 MiB limit. There were no container restarts, OOM events, or sampled
CPU throttling. This short resource sample and the logged queue timings show no
current internal capacity bottleneck; they do not establish peak-load capacity.

## Fixes and checks

Attendance change badges now retain each course's latest update for 24 hours,
survive unchanged syncs and encrypted-session restarts, and are replaced by the
next update. Backend responses and cached browser views both enforce expiry.
The visible `pp` suffix was removed. Existing observations migrate without
inventing a new change time.

The 28/38 projection was already mathematically correct: two future attended
hours produce 30/40 = 75%; one produces 29/39 = 74.36%. Expanded details now
explain this, and regression tests distinguish new classes from corrections to
existing absences. A fractional future requirement rounds up to a whole hour.

Validation: 144 frontend release tests, 23 backend tests, static/offline build
checks, and T3 browser checks for independent expiry, stale cached reports,
signed badges, and layouts at 320px and 390px. Changes are local; no deployment
was performed during this review.
