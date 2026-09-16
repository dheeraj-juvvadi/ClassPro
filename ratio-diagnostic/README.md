# Temporary Ratio-D backend comparison

The `upstream/` runtime is copied from projectakshith/ratio-d revision
`413b7f0055a14794ea11cb858c05abab311f89b4`. Its AGPL license is retained.
Source: https://github.com/projectakshith/ratio-d

This diagnostic uses the actual FastAPI `/portal/captcha`, `/portal/login`,
and `/portal/refresh` handlers, HTTPX client and report parsers. It does not
use our Go server, Python subprocess adapter or Go report validation.

The small public compatibility layer preserves `/api/*` for the current UI:
- Routes requests internally to the upstream FastAPI application.
- Maps attendance and marks into the existing frontend data format.
- Keeps SRM cookies in bounded, expiring process memory, never browser storage.
- Uses random HttpOnly session cookies, rotated after successful sign-in.
- Applies origin checks, request limits and single-request concurrency.
- Suppresses upstream print output, including predicted CAPTCHA answers.
- Exposes only the compatibility routes, not upstream proxy/feedback endpoints.

One explicit substitution remains: upstream's TinyOCR HTTP helper calls the
same TinyOCR model locally via ONNX Runtime. No separate Rust HTTP server is
required. No changes are made to the upstream login algorithm or classifier.
Consequently upstream may still misclassify a login rejection as a CAPTCHA
error. Success is not claimed until real reports are returned.

No passwords are persisted. Logout removes local session state; it does not
claim to revoke the upstream SRM session. Restart clears all local sessions.
This diagnostic supports Student Portal only, not Academia or schedule mapping.

Render Dockerfile: `ratio-diagnostic/Dockerfile`, build context repository root.
Required environment: `APP_ORIGIN=https://revamp-tracker.vercel.app`.
The Docker image sets `OCR_ASSET_DIR`; the startup command uses Render's `PORT`
or 8080. `TINYOCR_URL` and `TINYOCR_API_KEY` are unused by the local model helper.
Do not set `HMAC_SECRET` for this internal ASGI setup: upstream would require a
signature from the compatibility layer. Public requests retain origin checks.
Vercel uses the existing static rewrite and needs no backend URL environment key.
Health: `GET /health` returns `backend: ratio-diagnostic`.
Rollback: restore Render Dockerfile to `portal-go/Dockerfile` and redeploy.
The existing frontend rewrites and original backend files remain unchanged.

`observe.py` adds read-only HTTPX hooks without modifying upstream form submission
or failure classification. Logs include OCR completion/duration, cookie continuity
booleans, form-field presence and fixed alert categories. Cookie values, passwords,
CAPTCHA answers, dynamic field names and raw responses are never logged.

Deep comparison diagnostics additionally record:
- Runtime/package versions and source/model/CA-bundle hashes.
- Proxy/certificate override presence, never their values.
- TCP/TLS timings, protocol/cipher, certificate hash and SRM destination IP.
- Request header names, cookie flags/rotation, redirect category and clock offset.
- Field roles/order, token validity, safe synthetic telemetry fields and timings.
- Browser credential-integrity match flags and received-to-submitted equality.
- Process CPU/RSS and Linux container CPU-throttle/memory counters.

Each event has a random request ID; events are split into bounded log lines.
No credential hashes, nonce values, raw query strings, response bodies or student
records are emitted. Integrity compares only within a request: it does not prove
two separate local/hosted sign-ins used identical credentials. Observers do not
change login fields or retries. Response timing includes observation overhead;
an HTTP Date comparison has approximately one-second precision, not exact skew.

Tests: `PYTHONPATH=ratio-diagnostic python -m unittest discover -s ratio-diagnostic -p 'test_*.py'`.
