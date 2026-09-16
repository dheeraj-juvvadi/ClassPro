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
