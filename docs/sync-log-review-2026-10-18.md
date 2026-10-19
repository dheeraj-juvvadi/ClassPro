# Sync log review — October 18, 2026

Queries run ~04:39–04:53 UTC Oct 18, 2026 via `az vm run-command`
(direct SSH port 22 timed out) and Vercel CLI. The sampled expired-session
responses recovered within their sync jobs. This sample does not establish
the cause of the user's persistent warning; exam results are not in these
backend operational events. No production changes were made during review.

## Releases / liveness

- VM `classpro-test` (`CLASSPRO-TEST-RG`): running, `Standard_B2ats_v2`.
- Container `anon-api`: image `git-4c6dc5431a...`, restart=0,
  started `2026-10-16T22:38:20Z`, mem 113.5/384 MiB, cpu 0.09% (one sample).
- Backend `/health`: HTTP 200, 0.77 s.
- Vercel production: `dpl_2JyzXGbdgYojhqYH7d88KS3qSZao`
  (`revamp-tracker-dbv399fq9`), created Oct 17 14:45:56 UTC,
  alias `anon-tracker.vercel.app`, single fn `api/proxy`.
- Client telemetry release: `6c257371d6`. Alias `/api/session`: HTTP 200, 0.58 s.

## Container logs (36 lines Oct 17; 0 lines Oct 18)

- W17 (`--since 2026-10-17T00:00:00Z --until 2026-10-18T00:00:00Z`): 36 lines.
- W18 (`--since 2026-10-18T00:00:00Z`, to ~04:52 UTC): 0 lines.
- `refresh_finished`: 9 total, 9 `outcome=success`, 9 `exception_type=null`.
  `duration_ms`: n=9, min=1045, p50=3564, max=5734.
- `portal_request`: 27 total. `/portal/refresh`: 200x9, 401x8.
  `/refresh`: 200x9, 401x1. Classifications: accepted 18, unclassified 9.
  `duration_ms`: n=27, min=144, p50=987, max=5563.
- `portal_exception`: 0. `session_persist_failed`: 0. `service_started`: 0.
- 9 distinct request IDs (random hex, nonsensitive). Ordered lines per ID
  show 401 line(s) preceding 200 lines on both routes within the same ID
  for 8 IDs; the 9th ID (`0563715b…`) shows 2x200 only:
  `b0c21f21…`, `2b948c4c…`, `98222275…`, `7b227bd9…`, `f7d16979…`,
  `37602658…`, `5b6bfafe…`, `e089bf0f…`, `0563715b…`.

## Client telemetry (host bind mount)

- Lines per day: Oct12 193, Oct13 111, Oct14 187, Oct15 120, Oct16 153,
  Oct17 49 (total 813). No Oct 18 file; last write Oct 17 19:22 UTC.
- `--days 2` review: 49 events, all `page_view`/`page_engagement`
  (attendance 19, login 15, home 11, marks 4); zero error kinds.
- `latest.json`: `{"events": 0, "groups": []}`. `presence.json`: 1 bucket.

## Vercel request logs

- Current deployment sample: 50 lines, window `2026-10-18T03:55:51Z` to
  `2026-10-18T04:46:31Z`; 50x `GET /api/session 200`, all info, no messages.
- `--level error` on current deployment: 0 lines.
- Prior deployment `9jgcwp2fg`: 0 lines returned.

## Limitations

- Container log lines carry no timestamps (no `-t`); ordering only.
- `queue_ms` percentiles not collected.
- Empty W18 window = zero logged backend events, not proof of zero traffic;
  frontend→backend `/api/*` calls are not per-request logged server-side.
- These Vercel samples contain no `/api/reports` or `/api/exams` requests.
  Client telemetry shows zero errors Oct 17 and no events Oct 18.
- No Oct 17 Vercel-side request logs available (retention/deployment scope).
- Client telemetry is best-effort; absence of error events is not proof.
- Resource sample is a single point in time.
