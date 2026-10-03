# the upstream client browser credentials review

Reviewed local reference commit 413b7f0. Findings describe its source, not an
independent audit of the hosted service or its operational logging.

## What is stored in the browser

`src/utils/shared/Encryption.ts` uses Web Crypto AES-GCM with a random 12-byte
IV and a non-extractable 256-bit key. It stores that CryptoKey in IndexedDB
(`ratio_secure/keys/dk`) and encrypted values in localStorage.

`src/context/AppContext.tsx` saves Academia username/password under
`ratio_credentials`, Academia cookies under `academia_cookies`, and equivalent
Student Portal values under `portal_credentials` / `portal_cookies`. Reports,
including the timetable, are JSON in `upstream_data`. `upstream_session=active` is a
browser-set presence marker rather than proof of upstream authentication.

## How refresh and relogin work

The browser decrypts saved values and submits them to its backend. Academia's
first `/refresh` request includes username/cookies but no password. A specific
SESSION_EXPIRED 401 triggers a retry with the saved password. Updated cookies
are returned to the browser and encrypted again.

The Student Portal branch sends username, cookies **and password on each**
`/portal/refresh` request. Its backend first tries the cookies; if attendance is
unavailable and credentials were supplied, it attempts server-side OCR login.
It currently includes a two-second sleep on each OCR relogin attempt. This is
not a browser-to-SRM direct login; the backend receives the secrets in memory.

The inspected routes don't persist credentials in a session database. This
observation does not establish that every deployment/proxy/log retains nothing.
There are also source issues worth avoiding: `cleanOldKeys()` omits both Portal
credential/cookie keys, and automatic startup refresh is gated on saved Academia
credentials even though Portal has separate credentials.

## Anon's current behavior

The complete report, including its timetable/calendar, is already saved in
`classpro-reports-cache`. Optional period choices are browser-local under
profile-scoped `anon.schedule.v1.*` keys. Tests reopen the timetable and chosen
periods with the browser offline. Sign-out clears reports; local preferences
remain scoped to the profile. The public service worker caches no API reports.

Anon currently holds provider cookies/credentials on the backend and encrypts
remembered sessions at rest. Browser-origin password storage is not introduced
by this review. Such a migration would need explicit short-lived credential
handoffs, server credential removal, bounded reconnect handling, migration and
logout cleanup, updated policy text and loss-of-local-key recovery.

A non-extractable key prevents exporting key bytes, but JavaScript running with
the app's origin can still ask Web Crypto to decrypt. Browser encryption reduces
server-side stored-secret exposure; it does not prevent same-origin XSS or a
compromised client from obtaining usable credentials. A device-local reconnect
design should send passwords only after confirmed upstream expiry, retain
HttpOnly app sessions and avoid copying the upstream client's broad storage deletion.
