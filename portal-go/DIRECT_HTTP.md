# Experimental direct HTTP adapter

Local only. No production deployment is authorized by the results below.
The default adapter remains the existing browser worker.

Build with `go build -o /tmp/classpro-direct-go .`, then run from this directory:

```sh
APP_ORIGIN=http://localhost:8082 ALLOW_INSECURE_LOCAL=1 PORT=8082 \
PORTAL_ADAPTER=direct WORKER_TOKEN=local-direct-adapter-unused-token-000000 \
STATIC_DIR=../portal-app/public /tmp/classpro-direct-go
```

The direct adapter runs in the Go process. It uses isolated cookie jars, the
native form's named inputs, dynamic domain/interaction fields, bounded response
sizes, timeouts, and same-origin redirects. It identifies itself as an HTTP client
and does not manufacture browser fingerprints or human interaction counts.
SRM may reject this client even when browser login works.

The existing frontend performs automatic OCR; manual CAPTCHA remains available.
The prepare endpoint is a compatibility acknowledgment, not upstream validation.
Successful authentication requires a portal dashboard marker. Attendance, marks,
and assessment details are parsed into the existing frontend response format.
Unsupported assessment handler formats produce unavailable-detail messages rather
than executing JavaScript. Report parsing failures remain visible as partial errors.

Validation: synthetic HTTP login/redirect/report/logout, per-session isolation,
cross-origin redirect rejection, existing Go race tests and vet. A real unauthenticated
SRM CAPTCHA fetch and browser OCR initialization succeeded locally. Real direct
authentication failed with both automatic and manually entered CAPTCHA on
2026-09-14: SRM returned HTTP 200 with the login form, and the adapter returned
HTTP 401. No live reports were reached. No credentials are stored in logs.

This experiment is not equivalent to the working browser submission. In addition
to changing the HTTP transport, it sends its own user agent and reduced telemetry
with webdriver enabled, no canvas, and zero interaction counts. The rejection does
not isolate any one of those differences, prove that direct HTTP cannot work, or
explain the separate Render browser rejection. Do not promote this adapter based
on synthetic tests or successful CAPTCHA retrieval. Repeating the same unchanged
login is not a useful diagnostic.

## Browser-prepared HTTP submission control

`PORTAL_SUBMISSION_TRANSPORT=http` on the browser worker enables a separate
localhost-only experiment. Chromium still loads SRM and executes its native
submission handlers. Playwright's route HTTP client sends the original intercepted
POST with no body/header overrides, no automatic redirects, and no retries; the
response is fulfilled into the browser for normal navigation and report handling.
This tests transport with real browser-generated fields. It is not browser-free
and does not establish that the Go telemetry implementation can authenticate.

Local harness: http://localhost:8083. Synthetic transport forwarding and failure
cleanup tests pass. On 2026-09-14 the real automatic-CAPTCHA login succeeded:
the HTTP-forwarded submission returned 302, authenticated login returned 200 in
about 1.9 seconds, and reports returned 200 in about 0.77 seconds without a visible
report error. Session continuity checks passed. No Render changes.

This proves HTTP transport can submit a browser-prepared login locally. It does
not isolate the reduced telemetry as the only defect in the pure Go experiment,
prove Chromium can be removed, or verify acceptance from Render's environment.

## Go fasthttp submission control

Port 8084 runs `PORTAL_SUBMISSION_TRANSPORT=fasthttp` with the normal browser
adapter. The worker forwards the original prepared form and allowlisted headers
to an authenticated loopback-only Go listener (`FAST_TRANSPORT_PORT=3105`). The
listener posts only to the fixed Student Portal LoginServlet with fasthttp 1.58.0,
system certificate verification, a bounded response, and a 30-second deadline.
It does not follow redirects or retry login. Response cookies and redirects return
to the browser. No Academia endpoint or JSON-token login is introduced.

The Dockerfile explicitly installs ca-certificates; it does not disable TLS checks.
Existing successful HTTPS responses were not evidence of a missing CA bundle.
Tests cover fixed destination, unmodified body, cookie forwarding, loopback auth,
response cookies, and rejection of an untrusted certificate. On 2026-09-14 the
real automatic-CAPTCHA login succeeded locally: fasthttp received HTTP 302 in
243 ms, login completed in about 1.9 seconds, and reports completed in about
0.93 seconds. Five attendance courses and four marks courses loaded, with no
report or assessment-detail errors. These changes are local and not deployed
to Render. This verifies the browser-prepared fasthttp path, not browser-free
authentication or acceptance from Render's environment.
