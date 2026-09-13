# Student Portal base

Original Node app, separate from the retired ClassPro frontend/backend. One service serves a two-field NetID/password form and attendance/internal marks. No Academia, Supabase, or deployment integration is required.

## Run locally

Use Node 22+, Python 3.12, and Chromium:

```sh
cd portal-app
npm ci
npm run browsers
python3.12 -m venv .venv-ocr
.venv-ocr/bin/pip install -r requirements-ocr.txt
npm start
```

Open `http://127.0.0.1:3100`. If using an existing compatible Chromium installation, set `PORTAL_BROWSER_PATH` to its executable. `HEADED=1` enables a visible backend browser. `PORT`, `HOST`, and `MAX_SESSIONS` are optional. The local `.venv-ocr` is detected automatically; `PORTAL_OCR_PYTHON` overrides its Python path. `PORTAL_OCR_ENGINE=tesseract` selects the experimental old engine. Browser compatibility mode is enabled by default; `PORTAL_BROWSER_COMPAT=0` disables it for diagnosis. Set `COOKIE_SECURE=1` when served over HTTPS.

## Flow

- `POST /api/login` accepts `{account,password}`. The backend loads the actual portal form, recognizes the image locally, submits through the browser, and returns an opaque HttpOnly session cookie on confirmed success. Recognition is experimental. It retries only explicit CAPTCHA errors or unreadable images, at most twice.
- `GET /api/session` checks the app session.
- `GET /api/reports` retrieves attendance, internal summary, and each available assessment breakdown. Complete reports are cached for one minute. Failures remain distinct per report. No guessed timetable/faculty metadata is inserted.
- `DELETE /api/session` destroys the local browser session. It does not claim to terminate remote portal sessions.

Mutations require a matching Origin. Credentials are held only during the request and are not stored. Upstream cookies stay in the isolated browser context. In-memory sessions expire after 30 idle minutes and are lost when the server restarts. This single-process base is not yet a multi-instance production service.

## Verification boundary

A live login through the app's ordinary NetID/password form succeeded with automatic CAPTCHA recognition: `/api/login` completed in 4,365 ms, followed by `/api/reports` in 886 ms. The app displayed five attendance courses and four internal-mark summaries. This used a fresh backend browser session, not cookies imported from the user's browser.

The working combination uses Chromium browser compatibility mode, native portal form scripts, and a local ddddocr CPU model. That first success used 90 ms keyboard events; removing that delay subsequently produced two failed phone logins, so the Wi-Fi build restores the previously successful 90 ms timing. The precise rejection reason remains unconfirmed. Earlier backend attempts with user-entered CAPTCHA answers failed. Because browser configuration and OCR changed together, the successful result does not isolate each change's causal contribution.

The model is loaded once in a persistent local worker with a bounded queue; images never go to a third-party OCR service. Predictions must have mean confidence >=90 and minimum character confidence >=80 (0–100 scale). These thresholds are uncalibrated, and model scores are not measured accuracy. The Tesseract fallback requires two agreeing variants and mean confidence >=65.

The portal sometimes renders an empty `csrfPreventionSalt`; the adapter preserves that valid value while rejecting a missing field. Report/header parsing, session expiry, API isolation, and recognition thresholds have regression coverage. One successful automatic app login is a milestone, not a reliability or mobile-performance benchmark. Multi-user load, cold deployment latency, automatic session termination, and mobile-side inference remain unverified.

```sh
npm test
```

`scripts/probe-login.js` is an explicit bounded diagnostic. It reads credentials only from `PORTAL_TEST_CREDENTIAL_DIR` when `TRY_LOGIN=1`; it never prints credential values. Do not commit credential files. UI mock checks and unit tests are not evidence of successful portal authentication.

Wi-Fi latency update: uncertain client CAPTCHA retries now refresh the existing unauthenticated browser context. Client telemetry separates model wait, challenge loading, recognition, and portal submission. The browser-reuse change remains. Fast typing was rolled back after two failed phone logins. The 72 passing tests are not evidence of live portal acceptance.

Login preparation now starts when the form appears, independently of keyboard/input events. Manual typing and password-manager autofill share the same in-flight challenge. Credentials are read only on form submission. Prepared challenges older than 60 seconds are refreshed. Regression tests cover immediate submission, manual entry, stale preparation, and retry after failure; 75 tests pass. The accepted 90 ms portal typing remains unchanged.
