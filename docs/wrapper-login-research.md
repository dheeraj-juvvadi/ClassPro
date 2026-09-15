# Student Portal wrapper research — 2026-09-14

Research only. No deployment or login attempts were performed for this review.

## Exact-portal implementations inspected

- `satadru-bh/srm-academia`, `session/StudentPortalClient.js` and
  `portal-bridge.js`: maintains a cookie jar, follows redirects explicitly,
  starts at `/srmiststudentportal/`, and adds a persistent bridge for hosted
  sessions. Recent commits cover session-token priority, cookie resets, username
  normalization, timezone, and headers. No independently verified hosted login
  result was found. Its bridge comments assert stable egress/IP-bound security;
  persistent process lifetime alone does not guarantee static egress on Render.
- `projectakshith/ratio-d`, `backend/core/portal_client.py`: uses an HTTP session
  and checks an authenticated attendance page after submitting credentials.
- `prashanth-karanam/srm-companion`, `server/scraper_engine.py`: recognizes a
  JavaScript login-loader response and follows the portal navigation.
- `shreyas-sha3/YAA`, `backend/app.py`: distinguishes Academia and Student Portal
  routes, carries session context across requests, and submits dynamic fields.

These sources contain synthetic telemetry and varying success/error heuristics.
They are examples of approaches, not proof of SRM requirements or successful
production operation. No implementation was copied.

## Relevant failure patterns

1. Serverless requests can lose in-memory session context between challenge and
   login. Our portal session stays on Render; Vercel only proxies. Existing logs
   confirm the same JSESSIONID and preserved challenge cookies. This makes plain
   cookie loss a poor explanation, but does not prove server-side session validity.
2. Cookie-bound security can depend on source/device state. F5 documents optional
   device/session tracking and cookie-hijacking responses. Another SRM wrapper
   claims this applies to SRM, but our local unauthenticated response exposed only
   JSESSIONID and Apache; that does not establish F5 deployment or policy at SRM.
3. Render documents shared regional outbound IP ranges and occasional routing
   changes. It does not say every request rotates IP. Its documented routing-change
   symptom is connection reset; our observed symptom is a completed HTTP 200
   rejection. Do not equate these or declare an IP block.
4. Error classifiers can mistake static form-validation text for upstream errors.
   StudentPortalClient explicitly removes `.invalid-feedback` before classifying.
   Our current classifier scans body text. We should separately classify visible
   server alert containers before interpreting the error as credentials-related.
5. Some wrappers follow JavaScript navigation or make an authenticated report GET
   after an ambiguous HTTP 200. One inspected wrapper has overbroad success tests
   (`youLogin.jsp` text is treated as success), so use actual protected-page markers
   and parsed reports, never that shortcut.
6. Split HTTP clients can use different TCP connections, headers or routing. Our
   current hybrid does split browser preparation and fasthttp submission, but the
   original all-browser Render path also failed. Split transport cannot alone
   explain all observed failures.

## Next discriminating evidence

- Classify visible upstream alerts separately from static validation; record
  only fixed categories, not raw HTML or credentials.
- On ambiguous responses, make one same-session protected-page GET without
  resubmitting credentials. Only actual authenticated markers count as success.
- Compare the exact Linux image locally versus Render. Local macOS success is
  not equivalent. A before/after IP echo probe is only indicative: routing to the
  echo service may differ from routing to SRM. Definitive egress/session-binding
  evidence requires upstream/network visibility or a controlled stable route.

## Sources

## Additional source review — 2026-09-15

- `anuj-rishu/Hostel-Roomate-Finder_Server` (`controllers/authController.js`,
  `utils/browser.js`, `utils/httpAgent.js`, June 2026): despite the browser.js
  name, uses node-fetch and HTTPS agents. Saves proxyIndex alongside cookies and
  UA, reusing that proxy for CAPTCHA, fingerprint token, login, and report calls.
  Supports a fingerprint flow through `/fpCToken` and `/fpToken`. This differs
  materially from our current native form flow, but predates the inspected live
  guard scripts. The current login HTML retains fpNonce/fpToken inputs while
  listing only guardlogin.js, secure2.js, and guardloginbottom.js, with no inline
  fingerprint-endpoint call. Local success with empty fingerprint fields means
  their presence alone does not establish a missing required handshake.
- `Akshat2711/academia_scrapper_api_fast`, `tools/studentportal_result.py`:
  requests.Session + OCR, a simple LoginServlet POST, then a POST to youLogin.jsp
  and a dashboard GET. This implementation does not generate the dynamic guard
  fields in the current page. Its separate Academia API also has synthetic
  attendance fallback generation; do not treat that fallback as live SRM data.
- `nimo-codes/srm-sp-scraper` (2023): Selenium plus requests and obsolete
  hdnCaptcha form fields. Not applicable to the current portal protocol.

Correction: this review did not substantiate an HTTP/2-to-HTTP/1.1 fallback in
the inspected implementations. No transport recommendation is based on that claim.

The defensible new leads are version-aware fingerprint-handshake detection and
one consistent upstream connection/proxy path. Neither is yet a verified fix.
No production changes were made for this source review.

- https://github.com/anuj-rishu/Hostel-Roomate-Finder_Server/blob/main/controllers/authController.js
- https://github.com/anuj-rishu/Hostel-Roomate-Finder_Server/blob/main/utils/httpAgent.js
- https://github.com/Akshat2711/academia_scrapper_api_fast/blob/master/tools/studentportal_result.py
- https://github.com/nimo-codes/srm-sp-scraper/blob/main/src/request_scraper.py

- https://github.com/satadru-bh/srm-academia/blob/main/session/StudentPortalClient.js
- https://github.com/satadru-bh/srm-academia/blob/main/portal-bridge.js
- https://github.com/satadru-bh/srm-academia/commit/725ca7c8f66e02995fef1b0979df130688c11429
- https://github.com/projectakshith/ratio-d/blob/main/backend/core/portal_client.py
- https://github.com/prashanth-karanam/srm-companion/blob/main/server/scraper_engine.py
- https://github.com/shreyas-sha3/YAA/blob/main/backend/app.py
- https://render.com/docs/outbound-ip-addresses
- https://render.com/docs/outbound-connection-resets
- https://techdocs.f5.com/en-us/bigip-14-1-0/big-ip-asm-implementations-14-1-0/preventing-session-hijacking-and-tracking-user-sessions.html
