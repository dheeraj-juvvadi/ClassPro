# Client log review — October 18, 2026

Read-only collection via `az vm run-command` (SSH still blocked by source
restrictions; firewall unchanged) and Vercel CLI, ~05:20–05:30 UTC. Only
allowlisted aggregate fields were read. No credentials, cookies, report
contents or account identifiers are in this file. No source edits,
deployments or live-session changes were made.

## Scope

- VM `classpro-test` (`CLASSPRO-TEST-RG`), container `anon-api`,
  image `git-828f3100ccfa17ae4f30cbdea10230f82a77e359` (up 6 min at
  05:21 UTC; matches backend deploy 05:15:37Z).
- Host bind mount `/var/log/anon/client/*.jsonl`, UTC days. 7 files present
  (Oct 12–18); Oct 18 file is 937 bytes, last write 05:17 UTC.
- Stored event keys: `kind,page,release,received_at,viewport,active_ms,
  code,route,status,duration_ms,request_id`. No `script` or `line` field was
  present in any stored event.

## 7-day aggregate (821 events)

Errors total 15; all on Oct 12/14/15; **zero error events Oct 16–18**.

| day | kind | code | route | status | n |
|-----|------|------|-------|--------|--:|
| Oct 12 | api_error | HTTP_ERROR | /api/login/client | 401 | 9 |
| Oct 12 | asset_error | ASSET_FAILED | — | — | 1 |
| Oct 14 | asset_error | ASSET_FAILED | — | — | 1 |
| Oct 14 | api_error | NETWORK_ERROR | /api/reports | — | 1 |
| Oct 12 | api_error | NETWORK_ERROR | /api/reports | — | 1 |
| Oct 12 | api_error | NETWORK_ERROR | /api/session (home) | — | 1 |
| Oct 15 | api_error | NETWORK_ERROR | /api/session (attendance) | — | 1 |

- All 15 carry release `6c257371d6` (client assets unchanged).
- 9 login 401s cluster Oct 12 10:50–10:55 UTC (durations 252–8695 ms); they
  are the only events with `request_id`.
- Zero `runtime_error`, `promise_error` or `user_report` events in 7 days.
- The 4 NETWORK_ERRORs are single, non-recurring, and span Oct 12–15
  (`/api/session` duration 44697 ms on Oct 15 is the outlier).
- `asset_error` carries only `code=ASSET_FAILED`; no source/route/asset name.

## Focused window Oct 18 05:12Z onward

- Client telemetry: 8 events, 4 `page_view` + 4 `page_engagement`, **0 errors**.
  05:14 login engagement 2617 ms/5000 ms; attendance 5000 ms.
- `presence.json`: 1 bucket, page attendance, device mobile, count 1
  (~05:17:44Z).
- `reports/latest.json`: `events=6`, 4 groups, all `page_view`/`page_engagement`.
- Container logs since 05:12: 8 lines — `service_started` + 2 `portal_request`
  200 (`/refresh`, `/portal/refresh`) + 1 `refresh_finished`; zero 401/exception.
- Vercel production `revamp-tracker` (alias anon-tracker.vercel.app),
  window 05:12:22–05:25:49Z, 36 requests, all 2xx, level info, no error lines:

| method | path | status | n |
|--------|------|--------|--:|
| GET | /api/session | 200 | 21 |
| POST | /api/client-events | 202 | 6 |
| GET | /api/reports | 200 | 6 |
| GET | /api/exams | 200 | 2 |
| POST | /api/presence | 202 | 1 |

## Interpretation

- `/api/exams` returned **200** in the focused window; the stale-exam warning
  is a stale-payload/logic outcome, not an HTTP failure. Browser error
  telemetry therefore cannot record it (no error to report).
- The only candidate defect class is the Oct 12 login 401 burst and two
  `ASSET_FAILED` events; neither recurs after Oct 15.

## Follow-up fixes

- The server allowlist omitted `/api/exams`, the exam page and `exam-dates.js`.
  The follow-up patch preserves those fixed labels while still dropping
  arbitrary values and private fields. This improves attribution for HTTP
  errors; stale results returned with HTTP 200 are a separate condition.
- Actual upstream exam checks now log `exam_refresh_finished` with a request
  ID, duration and `success`/`stale` outcome, without report contents.
- `line`/`column` are allowlisted but no `runtime_error`/`promise_error`
  events existed in 7 days, so no script/line data is available.

## Correlation limits / uncertainty

- Client `request_id` exists only on the 9 Oct 12 login 401s. Vercel
  retention is exhausted (both probed IDs returned 0 lines) and the container
  was replaced at 05:15:37Z, so those IDs cannot be correlated to
  backend/Vercel. The focused window has no client `api_error`, so no ID to
  correlate.
- Telemetry is best-effort; absence of error events is not proof of success.
- Vercel window is a bounded 13-minute sample, not full-day.
- Container log lines carry no timestamps; ordering only.

## Access

SSH port 22 remains blocked by source restrictions (by design). `az vm
run-command` and Vercel CLI both worked. The Vercel project is named
`revamp-tracker` (the earlier `revamp-tracker-dbv399fq9` string is a
deployment label, not a project).
