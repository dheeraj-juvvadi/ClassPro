# Go Student Portal backend

## Architecture and current status

`portal-go/` is an isolated, standard-library Go HTTP service. It serves the
existing frontend from `STATIC_DIR` and owns public cookies, exact-origin CSRF,
request limits, report coalescing and a short per-session cache. It does not
modify or replace the running `portal-app/src/server.js` process automatically.

Authentication is **not a full native Go port**. `portal-app/src/portal.js`
depends on browser keyboard events when the Student Portal constructs its
login submission, screenshots a CAPTCHA, and fetches reports through refreshed
browser form state. The old `backend/` instead integrates with Academia/Zoho.
Reusing that cookie scraper would target a different authentication system.
Without a verified native Student Portal protocol, Go delegates named actions to
`portal-go/worker.mjs`, which imports the existing `PortalSession` unchanged.
Chromium remains the dominant memory/CPU cost. No login is synthesized.

The worker listens only on `127.0.0.1:3101`, accepts authenticated POST `/rpc`,
and implements only `challenge`, `prepare`, `login`, `reports`, `close`.
It has separate per-session browser contexts, capacity limits, deadlines,
expiration cleanup and no public/static endpoints. Go never forwards arbitrary
URLs, headers or client cookies to it. Public and worker session identifiers
are separate random values. Public tokens rotate after successful login.

## Public contracts

| Method and path | Request | Response |
| --- | --- | --- |
| GET `/api/session` | Cookie, if present | `{authenticated: boolean}` |
| POST `/api/challenge` | `{}` | `{image}` or `{authenticated: true}` |
| POST `/api/challenge/prepare` | `{answer}` | `{prepared: boolean}` |
| POST `/api/login/client` | `{account,password,answer,remember?}` | `{authenticated: true}` only after upstream success |
| GET `/api/reports` | Authenticated cookie | Existing attendance/marks/updatedAt response |
| DELETE `/api/session` | Cookie, if present | `{success: true}`; clears public session |
| GET/HEAD `/health` | Nothing | 200, GET `{ok:true}`, HEAD empty |

Errors retain `{error:{code,message}}`. Missing/expired sessions return 401,
invalid origin 403, invalid JSON/fields 400, unsupported media 415, oversized
body 413, busy session 409, throttling 429, capacity 503, upstream failure 502.
Unknown API routes return 404 and unsupported methods return 405 with `Allow`.
Legacy POST `/api/login` is deliberately not exposed: the current frontend uses
the client CAPTCHA flow. Neither health nor session inspection accesses the DB
or upstream. Session inspection reflects local lifetime; reports detect upstream
expiration. Health is process liveness, **not** a browser/upstream readiness claim.

## Security and efficiency

- Cookies are host-only, HttpOnly, Secure, SameSite=Strict and path `/`.
  The name is `classpro_go_session`, separate from Node's `portal_session` so
  local ports 8080 and 3100 do not overwrite one another's browser sessions.
  Remember-me controls browser persistence, never server session lifetime.
  Challenge lifetime is two minutes; authenticated lifetime is thirty minutes.
- Every API mutation requires `Origin` exactly equal to `APP_ORIGIN` including
  scheme and port. Missing origins and `Sec-Fetch-Site: cross-site` are rejected.
  POST requires JSON. No cross-origin CORS policy is enabled.
- JSON bodies are limited to 8 KiB; login field lengths and CAPTCHA syntax are
  validated and unknown fields rejected. Headers, reads, writes, worker calls,
  session count and concurrent browser work are bounded.
  Expired sessions are reclaimed on full-pool admission and by a bounded reaper.
  Go cleanup calls have a four-second deadline; worker browser close has a
  three-second deadline. A stuck browser close terminates the production worker
  and supervisor so the platform can restart cleanly instead of accumulating
  unreachable contexts. This loses in-memory sessions and requires sign-in again.
- Default capacity is four sessions, two operations and thirty API requests per
  minute per client IP. Rate state is capped at 4096 IPs. Login admission does not
  create unbounded browser contexts or queues. One operation runs per session;
  simultaneous report requests share one result.
- Successful complete reports are cached for sixty seconds inside that session
  only. Partial report/assessment errors are not cached by Go. The existing
  adapter also caches complete reports for sixty seconds. Cached reads do not
  extend upstream lifetime; there is no background polling or database traffic.
- Request bodies, passwords, cookies, tokens, report bodies and worker exception
  messages are not logged. Worker login diagnostics are forcibly disabled.
  Unknown upstream errors become generic public messages.
- `X-Forwarded-For` is ignored by default. Only explicit trusted proxy CIDRs enable
  right-to-left chain parsing, stopping at the nearest untrusted address. Never
  configure `0.0.0.0/0` or `::/0`. Without correct platform proxy ranges, users can
  share the proxy's conservative rate bucket; do not "fix" this by trusting all XFF.
  Trust-all CIDRs are rejected at startup. A full rate map prunes expired entries
  immediately rather than waiting for the periodic reaper.
- Security headers include CSP, HSTS in secure mode, nosniff, frame denial,
  no-referrer and disabled camera/microphone/geolocation. API responses are
  no-store; only public OCR assets receive day-long caching. Static root must be
  the public-assets directory, never repository root or a secrets directory.
- Node operations finish independently of client disconnects so browser contexts
  are not concurrently reused while a canceled operation continues. The private
  worker deadline is 85 seconds, bridge deadline 90 seconds, public timeout 100
  seconds. Long reports may fail within these bounds instead of holding slots
  indefinitely. Worker cleanup also expires contexts after Go restarts.

## Supabase seam

Persistence is intentionally disabled. See `docs/supabase.md`: no verified stable
student identifier is currently extracted from the authenticated portal session.
Submitted NetID, browser storage and session tokens are not substitutes. No
database driver, Supabase auth, guessed `auth.uid()` or persistence endpoint has
been introduced. The server-only `CLASSPRO_DATABASE_URL` and
`CLASSPRO_OWNER_HMAC_KEY` are reserved by that contract and unused here. Future
integration must use the restricted role, transaction-local owner context and a
verified upstream identity; it must not attach DB requests to health/login polling.

## Run and deploy

Local development, from the repository root, requires Go 1.23+, Node 22+ and
the already installed `portal-app` dependencies/Chromium. Export the same random
`WORKER_TOKEN` of at least 32 characters in both processes, without committing or
printing it. Start `node portal-go/worker.mjs`; in another terminal run
`cd portal-go && go run .` with:

```text
APP_ORIGIN=http://localhost:8080
ALLOW_INSECURE_LOCAL=1
STATIC_DIR=../portal-app/public
WORKER_URL=http://127.0.0.1:3101
PORT=8080
```

Only explicit HTTP localhost development can disable Secure cookies. Production
requires HTTPS `APP_ORIGIN` with no trailing slash. Set origin to the actual
browser origin, not the internal container URL. Reverse-proxy `/api` and assets
under that same origin if frontend hosting is separate. No wildcard origins.

For supervised local startup, build a binary and set `PORTAL_GO_BINARY` to its
absolute path, then run `node portal-go/start.mjs` from repository root with the
same origin/static environment above. The supervisor creates the ephemeral
worker token itself; no token needs to appear in command arguments or logs.

Build the optional combined container from **repository root**:

```sh
docker build -f portal-go/Dockerfile -t classpro-portal .
docker run --rm -p 8080:8080 -e APP_ORIGIN=https://your-host.example classpro-portal
```

The container serves the existing public assets, runs as the unprivileged `node`
user, and supervises both processes. Only port 8080 is exposed; Render may inject
another `PORT`. `start.mjs` generates an ephemeral worker bearer token shared only
with its two child processes unless `WORKER_TOKEN` is explicitly supplied. Worker
stdout/stderr are suppressed to avoid browser diagnostics exposing portal data.
If either process exits the supervisor terminates the other, allowing platform
restart. Sessions are in memory and intentionally disappear on restart. Deploy
one instance unless session affinity/shared lifecycle is explicitly implemented.
This Dockerfile does not modify `render.yaml` or deploy anything by itself.

Additional optional configuration: `MAX_SESSIONS=4`, `MAX_CONCURRENT=2`,
`RATE_PER_MINUTE=30`, `TRUSTED_PROXY_CIDRS` (comma-separated explicit CIDRs).
Use `MAX_SESSIONS=2` and `MAX_CONCURRENT=1` as a conservative initial browser
budget on a constrained instance; verify memory and login latency with real
sessions. No claim is made that a particular Render free instance fits Chromium.
Do not expose the worker through an ingress or external port mapping.

FastCron can issue GET or HEAD `https://your-host.example/health` without a key.
It returns only process liveness and performs no upstream, browser or database
work. POST is rejected. Configure Render's native health check to `/health`.
Frequent external keepalive calls can prevent idle suspension and **consume**
free instance hours; they do not extend the free tier. Prefer native health
checks and sparse external monitoring, with no keepalive cron when idle savings
are the goal. Report caching and client-triggered work reduce requests, not billed
wall-clock hours of an always-awake instance.

## Verification and rollout gate

Run `go test -race ./...` and `go vet ./...` inside `portal-go`, and
`node --test portal-go/worker.test.mjs` from the repository root. Tests use fake
upstream sessions, not student credentials. They cover origin/body validation,
secure cookie rotation/logout, rate spoofing, route/method/capacity limits,
report coalescing/isolation/TTL, partial failure handling, cheap GET/HEAD health,
worker authentication, serialized contexts and sanitized errors.

Before switching real traffic: build the container in Docker/Render, verify
Chromium starts under the runtime's sandbox restrictions, complete an actual
Student Portal CAPTCHA/login/report/logout cycle, test report duration and
memory on the selected plan, verify trusted proxy ranges, and confirm frontend
CSP/OCR compatibility. No real authenticated Go flow or Docker build was claimed
by the local test suite. The existing Node service remains the live harness path
until that acceptance check passes.

Local follow-up verification: Go and the private worker are running on 8080/3101
with an ephemeral supervisor-generated token. The local Playwright Chromium
bundle had a missing framework; setting `PORTAL_BROWSER_PATH` to the installed
system Chrome executable resolved browser launch. A real upstream challenge
request returned 200 with an image, then DELETE session returned 200. No account
credentials were used, and no CAPTCHA/cookie content was logged. GET/HEAD health,
POST health rejection, session inspection and static root also passed. This
verifies browser/challenge connectivity, not authenticated reports or production
container compatibility. The Node service on 3100 remains unchanged.
