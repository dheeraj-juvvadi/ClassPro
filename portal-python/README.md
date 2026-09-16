# Ratio-D Student Portal client

Upstream: https://github.com/projectakshith/ratio-d

Pinned revision: `413b7f0055a14794ea11cb858c05abab311f89b4`.

`core/portal_client.py` and the two files under `services/` are copied
from upstream without behavioral changes (a final newline is added).
These files, the Python adapter, OCR adapter, and their tests are distributed
under AGPL-3.0; see LICENSE. Existing unrelated code retains its own license.
Corresponding source, build instructions and integration code:
https://github.com/dheeraj-juvvadi/revamp-tracker

## Runtime

Build from repository root with `docker build -f portal-go/Dockerfile .`.
The Go API starts one bounded Python process per active Student Portal session.
The process keeps the original HTTPX client, cookie jar, CAPTCHA page and nonce
in volatile memory. It exits on logout, expiration, error, or API restart.
Passwords are request-local, never persisted. Browser cookies contain only
opaque random session identifiers; no upstream state is serialized to them.
Academia retains its separate existing Go implementation.

The Go API enforces origin checks, credential integrity, concurrency limits,
session limits, timeouts, token rotation and report validation. Python communicates
only through private stdin/stdout pipes. It has no public listener.

## Differences from the previous Go path

- Actual upstream HTTPX transport and automatic redirect behavior.
- Same live client and cookie jar across CAPTCHA, submission and reports.
- Exact upstream dynamic form fields, synthetic telemetry, and NetID normalization.
- Automatic OCR runs server-side with a two-second pre-submit delay.
- At most four automatic attempts using upstream's CAPTCHA classification.
- Fresh PortalSession/cookie jar on refresh and between automatic CAPTCHA retries.
- Manual CAPTCHA remains available. Invalid credentials are not retried.
- Upstream's broad success test is additionally checked against our attendance parser.

## Deliberate differences from Ratio-D

Ratio-D calls a separate Rust TinyOCR service. This adapter runs the exact TinyOCR
weights, native 175x45 grayscale preprocessing, vocabulary and greedy CTC decoder
locally through ONNX Runtime with one CPU thread. It does not run the Rust HTTP
server; no third-party OCR service receives images. See model/README.md.
We do not copy upstream logging of predicted CAPTCHA answers or persistent
client-side plaintext upstream cookies. Diagnostics contain only fixed classifications,
status codes, attempt numbers, stages and exception class names.

The unchanged upstream classifier searches raw HTML and labels even an unsubmitted
login page `wrong_captcha` because validation scripts contain that phrase. This
is not proof SRM rejected the CAPTCHA. Separate `alert_classification` diagnostics
inspect alert elements without scripts or hidden validation messages; they emit
only fixed categories, never page text. Login success still requires valid reports.

Tests: `PYTHONPATH=portal-python python -m unittest discover -s portal-python -p 'test_*.py'`.
