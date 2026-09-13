# Student Portal migration

## Decision

Build a new Student Portal adapter while retaining ClassPro's Go API and Next.js UI. Replace the Academia-specific authentication and report parsing. Use a browser worker for the real login flow, then reuse the authenticated session for report requests. Do not adopt a Python service solely for Scrapling's CAPTCHA claims.

This is an investigation and migration design, not a completed production migration. The live report requests were verified in the user's authenticated browser. Independent Go/Python requests, automated login, expiry recovery, and session-limit termination have not been verified.

## Verified portal contract

Origin: `https://sp.srmist.edu.in`; application prefix: `/srmiststudentportal/`.

- Unauthenticated `students/template/HRDSystem.jsp` submits to `students/loginManager/youLogin.jsp`.
- Login uses NetID without the email suffix and posts to `LoginServlet`. Its page includes custom CAPTCHA, dynamic security fields, fingerprint fields, and telemetry scripts. Let those scripts run in the browser; do not hardcode their generated values.
- Both user-provided URLs are the same application shell. Menu actions submit `#userHomePage`, changing `hdnFormId` to `9` for attendance or `13` for internal marks.
- The resulting shell runs `funShow`, which loads a report into `#divMainDetails`.

All paths below are relative to the application prefix. Requests use form encoding and the current portal session.

| Report | POST path | Body |
| --- | --- | --- |
| Attendance | `students/report/studentAttendanceDetails.jsp` | `iden=9`, `filter=`, current `hdnFormDetails`, current `csrfPreventionSalt` |
| Internal summary | `students/report/studentInternalMarkDetails.jsp` | `iden=13`, `filter=`, current `hdnFormDetails`, current `csrfPreventionSalt` |
| Assessment breakdown | `students/report/studentInternalMarkDetailsInner.jsp` | `iden=1`, `hdnSubjectId`, `status` from the course's details button |

Keep `students/template/HRDSystem.jsp` as the Referer. Extract tokens from the current shell rather than using fallback constants. For breakdowns, parse arguments from the observed `funViewComponentWiseMarks` button handler; do not evaluate arbitrary handler text.

Attendance headers are `Code`, `Description`, `Max. hours`, `Att. hours`, `Absent hours`, `Total Percentage`. Ignore the separate monthly cumulative table. Summary marks headers are `Code`, `Description`, `Mark / Max. Mark`. Breakdown headers are `Entered on`, `Component`, `Mark / Max. Mark`.

Live verification: attendance returned five rows; internal summary returned four courses; all four course breakdown requests returned an assessment table. Every request returned HTTP 200 without returning the login form. Different course counts are valid: a course can lack published marks.

## Data mapping

Map attendance `Code` to `courseCode`, `Description` to `courseTitle`, `Max. hours` to `hoursConducted`, and the absent/percentage columns to their existing fields. Preserve numeric strings for compatibility, but validate nonnegative hours and percentages and check present + absent against conducted hours.

Split `Mark / Max. Mark` into scored and total values. Map assessment `Component` to `testPerformance[].test`; preserve absence/unpublished states instead of converting them to zero. Join summary and detail data by course identity. Do not infer a fixed overall denominator such as 100.

These reports do not provide faculty, slot, category, registration number, user profile, or timetable. Obtain those from verified sources or expose unavailable values deliberately. Do not fabricate them. The existing `/get` aggregate and UI need explicit partial-data support before switching providers.

## Login and session lifecycle

Use separate `studentPortal` and `academia` provider sessions under one opaque ClassPro session. Retain Academia only for features whose data remains there and verify those independently. GradeX's public client describes this same division: Student Portal attendance/marks can work while Academia rejects a timetable password.

Keep upstream cookies on the server; issue a Secure, HttpOnly ClassPro session cookie. Serialize login/recovery per account and provider so refreshes from multiple tabs do not create extra portal sessions. Use a shared lock/store across replicas, plus session expiry and idle cleanup. Coalesce report refreshes, cache by account/provider, and retain last successful data with a visible freshness timestamp.

Expose slow browser authentication as a job: start, poll status, complete/cancel, with a deadline and short-lived challenge identifier. Keep it outside the current ten-second frontend data-fetch timeout. GradeX's public client independently exposes queued/running login job states and polls a status action; this is useful architectural evidence but does not reveal its backend or CAPTCHA implementation.

On a verified upstream session-limit response, submit that provider's own termination action once, preserving its current CSRF/transaction fields, then retry authentication once. Subsequent failures should return a specific recoverable error rather than loop. An invalid password, CAPTCHA challenge, server outage, and expired session are different states; do not terminate sessions on every exception or generic 401. Treat CAPTCHA as a resumable challenge bound to the pending browser session.

A report refresh after session expiry may require fresh credentials/challenge completion. Do not promise indefinite automatic relogin from cookies alone. Reuse credentials in memory during an active login/recovery attempt; persistent unattended recovery would need a separate deliberate credential-storage design.

The new portal's session-limit screen/action was not encountered in this investigation. Its exact termination protocol remains unverified. Do not implement a guessed logout endpoint or assume the Academia termination action applies to it.

### Academia session limit: directly observed

The user subsequently signed into Academia and reached `/accounts/p/40-10002227248/preannouncement/block-sessions`. Its text explicitly states a maximum of two active sessions, with a `Terminate All Sessions` control (`#continue_button`). There is no termination HTML form.

The page's own `terminateAllSession()` JavaScript performs:

1. `DELETE /accounts/p/40-10002227248/webclient/v1/announcement/pre/blocksessions`, empty body, form-urlencoded content type.
2. `X-ZCSRF-TOKEN: iamcsrcoo=<encodeURIComponent(current iamcsr cookie)>`, using the pending Academia authentication cookie jar.
3. Parse the JSON response: `code=Z113` means the pending session expired; `status_code=204` (numeric or string) triggers navigation to `/accounts/p/40-10002227248/preannouncement/block-sessions/next`.
4. Continue redirects and verify the authenticated application. This resumes the pending sign-in; a second password submission is not necessarily required.

This supplies an exact provider-specific recovery contract. The retired `forceLogout` searches for a form containing “terminate”, so it cannot handle this observed page. Replace that heuristic with a bounded, origin-checked Academia state transition, retaining cookies across every redirect. Test missing CSRF, `Z113`, malformed responses, repeated blocks, and successful continuation. Do not treat the mere presence of `JSESSIONID` as authenticated success.

Evidence here is the real page and its JavaScript. The termination button was not clicked: existing sessions were not ended during inspection, and runtime completion has not yet been verified. This Academia behavior must not be conflated with Student Portal session management.

## Scrapling assessment

The official D4Vinci/Scrapling README describes adaptive element relocation, HTTP/browser sessions, Playwright-based dynamic fetching, and Cloudflare challenge handling. None establishes support for SRM's custom CAPTCHA. Adaptive matching cannot recover data that has moved to another portal, and it must not silently substitute a wrong grades table after a layout change.

Prefer a browser-backed login adapter plus explicit HTTP report contracts and header-based parsers in the existing stack. First verify whether browser-authenticated report requests can move to the Go HTTP client while retaining all required state; the live test here used browser fetch. Keep a browser request-context fallback if binding prevents that transfer. Add Scrapling only if a measured prototype shows a reliability benefit worth the Python/browser service cost; it is not required by the verified report layout.

## Implementation sequence and acceptance checks

1. Resolve backend ownership: `backend` is an external Git submodule. Use a maintained fork or a deliberate monorepo import so deployment does not depend on an unpublished submodule commit.
2. Implement an isolated Student Portal provider, with login/challenge/session states and explicit report fetches; retain separate Academia capability for timetable if confirmed.
3. Build parser fixtures from sanitized report structure. Cover column reordering, unrelated monthly tables, missing required headers, empty/unpublished results, absent marks, HTML escaping, and malformed mark pairs. Reject unknown layouts rather than returning empty successful data.
4. Update `/get` and UI for independent provider failures and missing metadata. Distinguish a successful empty report from a parser failure or expired login.
5. Verify session reuse, concurrent-refresh locking, termination/retry bounds, challenge expiry, logout, and cancellation with simulated provider responses. Validate the actual provider termination screen when encountered in an authorized account.
6. Run an end-to-end login and compare attendance, summary marks, and every assessment against the portal. Confirm no credentials, CSRF values, student data, or upstream cookies enter source fixtures/logs.

## Evidence

- Primary: authenticated SRM page scripts, headers, and six successful same-origin report requests (two summaries plus four assessment breakdowns).
- Existing code: backend submodule `6e603868d185b77c2cd8c7bfde1d2a557a38846d`; parent `e7f2f5f`.
- Scrapling: `https://github.com/D4Vinci/Scrapling`, official README inspected via GitHub.
- GradeX: public page `https://gradex.bond/?theme=dark` and its directly linked client asset `/assets/index-CuVYvL29-v34710.js`. Client calls `/api/srm/terminate-sessions` with credentials, handles success, and retries login/timetable. Fallback copy explicitly references Academia session termination. This proves shipped client behavior, not the unseen server implementation or current runtime success. No GradeX API calls, credentials, security testing, or code reuse were performed.
- GradeX's Student Portal client separately uses `/api/student-portal` actions `v4-attendance`, `v4-sync-login-start`, and `v4-sync-login-status`, with queued/running state updates. The client alone does not establish which library or session-limit strategy the server uses.
- Ratio: [ratio-public-flow.md](ratio-public-flow.md) records its public client evidence. Academia has an explicit session-expired retry using available credentials; Student Portal has a separate login/CAPTCHA/refresh contract. Public loading copy mentions removing another session, but the inspected client does not expose the underlying termination protocol.
- A public SRM scraper repository was inspected for corroboration, but its report parameters differed from observed portal behavior and no license was identified. No code was copied; live portal evidence takes precedence.
