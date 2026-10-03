# Local versus Render evidence — 2026-09-16

Diagnostic deployment: `a04b89b`. Observed real unauthenticated login-page and
CAPTCHA fetches, with no credentials submitted by the agent.

## Identical in this probe

- Login client, upstream FastAPI, compatibility layer and observer source hashes.
- TinyOCR model and certifi CA bundle hashes.
- httpx 0.28.1, httpcore 1.0.9, anyio 4.15.1, certifi 2026.7.22,
  onnxruntime 1.22.1, numpy 2.2.6 and Pillow 11.3.0.
- Destination: SRM 103.4.223.143; same server certificate hash.
- Negotiated TLS 1.2 and ECDHE-RSA-AES128-GCM-SHA256.
- No proxy or SSL certificate override environment variables detected.
- CAPTCHA fetch carries its session cookie and reuses the connection.

## Differences observed

| Measurement | Local | Render |
| --- | --- | --- |
| OS / architecture | macOS / arm64 | Linux / x86_64 |
| Python | 3.11.13 | 3.11.16 |
| OpenSSL | 3.6.3 | 3.0.20 |
| Runtime timezone offset | +05:30 | UTC |
| Login page total | 168 ms | 1558 ms |
| TCP connection | 113 ms | 807 ms |
| TLS handshake | 31 ms | 499 ms |
| CAPTCHA fetch total | 25 ms | 258 ms |
| SRM Date minus local clock | -0.1 seconds | -0.5 to -0.7 seconds |

These are single samples, not averages. HTTP Date has second resolution;
the measured offsets do not establish significant clock skew. Identical
negotiated TLS does not establish identical ClientHello fingerprints. The
destination IP does not identify or compare outgoing source IPs. No conclusion
about IP blocking, timing rejection, or TLS fingerprint rejection is justified.

Earlier observed login: local automatic CAPTCHA failed once, then login
redirected with HTTP 302 and returned reports. Hosted attempts returned HTTP 200
login forms containing credentials-rejection alerts, despite matching basic
cookie/field/nonce checks. That comparison did not yet include the new credential
integrity and token-content checks.

## Next evidence required

One user-initiated login in the instrumented local build (port 8090) and one
in Vercel. Compare request IDs: browser integrity, received/submitted credential
equality, token content, connection reuse, cookie rotation, elapsed time,
container throttling, OCR completion and actual alert category. Passwords,
cookies, CAPTCHA answers and student records must remain absent from logs.

Raw sanitized captures are local-only under `/tmp/classpro-deep-local.log`
and `/tmp/classpro-deep-render.json`; do not commit production log captures.

## Instrumented user sign-ins

Two local login requests succeeded, after two and three OCR attempts respectively.
The hosted automatic request failed on all four attempts; two subsequent manual
requests also failed. All hosted LoginServlet alerts classified as credentials
rejection. Local failed attempts classified as CAPTCHA rejection before success.

Both environments passed browser-to-backend account/password/answer integrity
checks, and outbound parsed form credentials equaled received credentials.
The automatic form-structure/token records compared equal: field order/roles,
no duplicates, cookie continuity, nonce match, domain token, interaction token,
two-second elapsed time, and recorded synthetic telemetry. This verifies each
request's transport integrity, not equality of credentials across separate logins.

Local success: HTTP 302, session cookie rotated, then authenticated report fetch.
Hosted failure: HTTP 200 login HTML with credentials-rejection alert and no new
session cookie. Destination/certificate/TLS negotiation and request header names
matched. The different response headers/body are consequences of these different
responses, not evidence that compression caused rejection.

Hosted automatic login used about 0.119 CPU-seconds over 11.987 wall-seconds.
Peak process RSS was about 103 MiB; cgroup memory.current about 71.5 MiB against
a 512 MiB limit (these counters have different accounting). Requests completed
without captured transport errors. CPU-throttle counters were unavailable in
this capture, so throttling is not ruled out by those counters. These measurements
do not support a crash or memory exhaustion as the cause of the observed rejection.

The first observed behavioral divergence remains SRM's LoginServlet response.
Unmeasured differences still include outgoing network identity, full TLS
ClientHello fingerprint, and unrecorded server-side policy/state. None is proven
to be causal. Further identical login retries alone will not resolve that gap.
