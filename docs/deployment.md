# ClassPro revamp deployment

## Expanded temporary login diagnostics

Browser `classproDiagnostics` retains the latest 30 request summaries in memory:
route, mode, timing, status, client trace, Render request ID, and Vercel response ID.
Connection details shows the last login request ID. Vercel uses an external rewrite,
not a serverless function; these are browser/proxy response records, not Vercel
function logs. Render validates the diagnostic headers before recording them.

Portal diagnostics now include boolean cookie transmission, duplicate credential
fields, honeypot emptiness, fingerprint-field presence, domain-proof matching,
redirect categories/statuses, page age, timezone, failed-request count, and fixed
response-text categories. No raw HTML, error text, form values, cookies, tokens,
credentials, or account identifiers are retained. Chrome 152 also failed remotely;
the browser version change did not resolve authentication.

## Backend-only packaging and request diagnostics

The current adapter succeeded locally with both automatic and manual CAPTCHA on
2026-09-14. Local SRM responses redirected with HTTP 302; Render returned its login
page with HTTP 200 and `LOGIN_REJECTED`. Both environments reported matching submitted
fields, security telemetry, and a headless user agent. This does not support blaming
OCR or the headless identifier alone.

The next controlled deployment replaces Playwright's Chromium 145 with official
Chrome for Testing 152.0.7977.82, from the same build family as working local Chrome
152.0.7977.84. The exact local patch is not published in Chrome for Testing. Browser
startup logs report version/platform/headless mode. Linux and Render egress remain
different, so this is a diagnostic deployment, not a verified authentication fix.

The Render Docker build now copies only the Go API, Node worker, portal adapter,
parser, and their runtime dependencies. Its Docker-specific context allowlist
excludes the frontend, OCR weights, development files, and unrelated project code.
Vercel owns frontend and browser OCR delivery. Render has no `STATIC_DIR` by default;
`/` returns 404 while `/health` and `/api/*` remain available. Local harnesses may
still set `STATIC_DIR` explicitly. Chromium remains required for SRM's native form.

Render stdout includes JSON `http_request`, `authentication`, `worker_request`,
`worker_error`, and `portal_submission` records. The API generates an
`X-Request-ID` and forwards it to the private worker for correlation. Successful
health probes are omitted to avoid repetitive logs. Request records include
allowlisted route, method, status, duration, and byte count, never request bodies,
query strings, NetIDs, passwords, cookies, session tokens, or CAPTCHA answers.

Submission diagnostics record only boolean field-match checks, security-field
presence, upstream status, script-error count, and outcome. They do not establish
CAPTCHA acceptance or authenticated access unless SRM actually returns success.
An authenticated production retry is still required to diagnose the reported
rejection; model delivery and challenge preparation alone do not prove login.

## Verified deployment: 2026-09-14

Final Go commit `7d61627044c42468dc92c3a2948a3f7bbba6b442` was pushed to
`revamp/main` and confirmed live on Render. Vercel deployment
`dpl_HSStQp2WBXXT5aGEL9FzFSQvyWPv` is ready at
`https://revamp-tracker.vercel.app`. Render deployment
`dep-dajsm5oae00c73b8qtlg` is live on the existing `goscraper` free service.
The frontend snapshot is from `82e4307`; later commits change only the Go
backend, deployment records and Supabase artifacts, not the frontend.

Production checks returned: `/health` 200, proxied `/api/session` 200 with
`authenticated:false`, unauthenticated `/api/reports` 401, and an untrusted-origin
challenge request 403. A permitted-origin challenge returned 200 with a CAPTCHA
image, demonstrating deployed Chromium and upstream access. Its temporary
session was then deleted successfully. No credentials were submitted; a complete
real login/report/logout cycle is still an acceptance check, not a claimed result.

The final published stylesheet was compared byte-for-byte with the approved
local file. Health, session, real Chromium challenge and DELETE cleanup checks
were repeated successfully after the final Go hardening release became live.
The Supabase owner's handoff confirms both migrations applied remotely on the
existing project; see `docs/supabase.md`. Application persistence remains disabled
pending a verified stable student identity and restricted runtime credentials.

## Existing accounts and destinations

- Publish to `revamp` (`dheeraj-juvvadi/revamp-tracker`), branch `main`.
- `origin` is the original ClassPro repository; do not push revamp changes there.
- The existing Vercel project is `revamp-tracker`; its production domain is
  `https://revamp-tracker.vercel.app`. The local project link is under
  `portal-app/public/.vercel` and must remain untracked.
- The user selected replacement of the existing ClassPro backend: Render
  `goscraper` (`srv-d01a1gje5dus73e1qgh0`) at
  `https://goscraper-quf1.onrender.com`. Keep its free plan and assigned hostname.
  The unrelated `youtube-clipper` service must remain untouched.
- The previous proposed `revamp-tracker-backend.onrender.com` hostname had no
  service and returned 404. The frontend rewrite now targets `goscraper`.
- Vercel also has the legacy `class-pro` project and its aliases. This release
  publishes the UI to `revamp-tracker`; replacing legacy frontend aliases is a
  separate coordinated cutover. Updating the shared backend changes the legacy
  app's API compatibility, so do not describe that old frontend as verified.

## Release gate

The coordinating agent approved the UI and final Go release. For subsequent
releases, confirm each owner's ready signal and an explicit reviewed file list.
The backend owner maintains `portal-go`; the UI owner maintains `portal-app/public`.

Before publishing:

1. Confirm the UI and backend agents have finished writing and provide their
   verification results. Review the exact staged diff, including existing user
   changes. Never use a blanket `git add .`.
2. Exclude credentials, `.env` files, local provider links, diagnostics, temporary
   exports, caches and build products. Include required licensed runtime assets.
3. Verify `revamp/main` has not advanced; integrate remote changes without force
   pushing. Commit only the agreed release files, then push `main` to `revamp`.
4. Update only the existing `goscraper` Render service on the free plan. Use
   `portal-go/Dockerfile` with repository-root Docker context. Auto-deploy is
   disabled so a GitHub push alone cannot publish an unreviewed backend change.
   Trigger the deployment explicitly after the release commit is approved.
5. Confirm Render reports the expected commit as live and the health endpoint
   succeeds. The UI API rewrite must use `https://goscraper-quf1.onrender.com`.
6. Deploy the approved static directory through its existing Vercel project:
   `cd portal-app/public && vercel deploy --prod`.
7. Check the production page, API proxy, secure cookies, rejected origins,
   unauthenticated protected requests, and the agreed login flow. A passing
   health check alone does not verify authentication or upstream SRM access.

## Secrets and account access

Render access was verified through its official HTTPS API. The session-supplied
credential is stored outside this repository in an owner-readable local file;
it is never part of a Blueprint, command argument, deployment document or log.
Do not copy local credential or MCP configuration into the repository.

Supabase account login and schema setup are owned by the separate Supabase
agent. Require that agent's confirmed project and server/client key boundaries
before wiring environment variables. Never ship a Supabase service-role key
to the static frontend.

## Go runtime contract

`portal-go/start.mjs` starts the public Go listener and the Node portal adapter
in one container. The adapter binds only `127.0.0.1:3101`; only the Go listener
uses Render's `PORT`. The startup process generates a shared random worker token
in memory if none was provisioned. Both child processes receive the same token;
it is not sent to the frontend. Child-process failure shuts down the container.

`APP_ORIGIN` is exactly `https://revamp-tracker.vercel.app` with no trailing slash.
HTTPS cookies are the default. `WORKER_URL` is `http://127.0.0.1:3101`,
`MAX_SESSIONS=2`, `MAX_CONCURRENT=1`, and `RATE_PER_MINUTE=30`. Do not set
`ALLOW_INSECURE_LOCAL` in production or blindly trust all proxy CIDRs.
The gateway also has access to static assets inside the container; the primary
frontend remains the existing Vercel project with same-origin API rewrites.

## Health checks and free-tier limits

Reserve `GET /health` for minimal unauthenticated process liveness with no user
data or configuration details. It must not launch Chromium, contact SRM, query
Supabase or refresh sessions. Render can use this route as its native health
check. Confirm the Go implementation before configuring an external monitor.

The monitor URL is `https://goscraper-quf1.onrender.com/health`.
A FastCron check may alert on an
unexpected status with a finite timeout, but must not run a perpetual keepalive
to bypass Render's idle sleep. Free services can cold-start and lose ephemeral
in-memory sessions; report these behaviors honestly.

Keep work request-driven: cache reports for a bounded interval, coalesce
duplicate upstream requests, cap browser concurrency and sessions, and avoid
background polling. Render free hours are running-instance hours; fewer API
calls do not directly multiply the monthly allowance. No paid service, disk or
plan upgrade is authorized.
