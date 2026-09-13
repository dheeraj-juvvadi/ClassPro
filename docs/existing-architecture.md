# Existing backend architecture

## Scope and evidence

This describes the retired open-source repository, inspected at backend submodule commit `6e603868d185b77c2cd8c7bfde1d2a557a38846d` (`.gitmodules`: `rahuletto/goscraper`). It is source inspection, not a successful live-portal test. The user reports that newer alternatives automatically recover session limits; their implementation was not inspected, and findings here must not be attributed to them.

## Login and session lifecycle

- `backend/src/main.go`: Fiber exposes `POST /login`, `DELETE /logout`, `GET /attendance`, `/marks`, `/courses`, `/user`, `/timetable`, and aggregate `/get`.
- `backend/src/handlers/login.go`: login accepts `account`, `password`, optional `captcha` and `cdigest`. It appends `@srmist.edu.in` when absent and posts to Academia `/accounts/signin.ac`, with hardcoded ZohoCreator portal `10002227248`. It expects JSON `access_token` and `oauthorize_uri`, follows authorization redirects, then requires a cookie named `JSESSIONID`.
- Login uses a temporary name/value cookie map and returns its serialized cookies in JSON. It has a limited concurrent-session recovery branch: detect “concurrent”/“terminate”, submit a matching HTML form with its inputs, and retry at most twice. CAPTCHA handling expects Zoho `HIP_REQUIRED`/`HIP_FAILED` and returns a `cdigest` plus image URL. These mechanisms describe the retired implementation only.
- `frontend/app/auth/login/components/Form.tsx` stores returned cookies via `frontend/utils/Cookies.ts` in a JavaScript-readable `key` cookie, default lifetime three months. Requests pass this string as `X-CSRF-Token`; backend helpers forward it as the upstream `Cookie` header. There is no persistent backend session manager or refresh lifecycle in this flow. Logout calls the old Zoho endpoint; the frontend logout route clears local cookies when the backend HTTP response is OK, without inspecting its `success` field.
- `backend/src/globals/DevMode.go` sets `DevMode=true`, bypassing Authorization validation. Otherwise, `utils/validate.go` checks Bearer base64 `timestamp.secret` against `VALIDATION_KEY` with a 180-second age test. The alternative `Token` path calls `ValidateAuth`, which does not compare its key argument. This application authorization is separate from the portal cookie.

## Scraping and persistence

`handlers/attendance.go` and `handlers/marks.go` both delegate to `helpers/AttendanceHelper.go`. Each independently fetches Academia `/srm_university/academia-academic-services/page/My_Attendance`. Extraction depends on `.sanitize('…')`, hex-decoded HTML, exact table strings/colors, positional cells, and registration regex `RA2\d{12}`. Marks reuse attendance parsing to map course names, split test text on `.00` and `/`, and retain only `Theory` and `Practical` rows.

`helpers/CourseHelper.go` fetches the hardcoded `My_Time_Table_2023_24` page. `handlers/user.go` parses that page through `helpers/UserHelper.go`; `helpers/TimetableHelper.go` also depends on the course-page helper. Migrating attendance alone leaves aggregate dependencies on old Academia.

`main.go::fetchAllData` concurrently fetches user, attendance, marks, courses and timetable. A returned Go error aborts the aggregate. Several helpers instead embed errors/status 500 in response objects with nil Go errors; missing attendance/marks tables can produce empty results without an error. `utils/error.go` recognizes certain error strings as `tokenInvalid`, but swallowed errors do not reach that mapping.

`/get` reads Supabase `goscrape` by an encoded cookie token. Existing records containing timetable/attendance/marks are returned without an age check, while a background refresh runs. `helpers/databases/DatabaseHelper.go` upserts by registration number, adds `lastUpdated`, and encrypts most data fields with AES-GCM. Fiber caches GETs for two minutes by path plus cookie. `frontend/hooks/fetchUserData.tsx` adds five-minute memory caching and Next fetch revalidation at 120 seconds.

## Frontend contracts and aggregate dependencies

Canonical backend shapes are in `backend/src/types/AttendanceType.go` and `MarksType.go`; frontend counterparts are `frontend/types/Attendance.ts`, `Marks.ts`, and `Response.ts`.

- Attendance envelope: `{regNumber, attendance, status?, error?}`. Every row carries string `courseCode`, `courseTitle`, `category`, `facultyName`, `slot`, `hoursConducted`, `hoursAbsent`, and `attendancePercentage`. The frontend constrains category to `Theory | Practical` and expects status, although backend status can be omitted.
- Marks envelope: `{regNumber, marks, status, error?}`. Rows carry `courseName`, `courseCode`, `courseType`, `overall: {scored,total}`, and `testPerformance: [{test,marks:{scored,total}}]`. Scores/totals are strings; a test score may be `Abs`.
- `/get` nests these envelopes under `attendance` and `marks`, alongside `user`, `courses`, `timetable`, `regNumber`, encoded `token`, optional `ophour`, and cached metadata. `AllResponse` requires top-level `status` and `lastUpdated`, but fresh aggregate construction does not consistently populate these before serialization.
- `frontend/hooks/fetchUserData.tsx` calls `/get`, not the individual academic routes. It checks JSON `tokenInvalid` and `ratelimit`, but does not gate JSON consumption on HTTP success. Backend rate-limit middleware returns an `error` without `ratelimit`.
- `frontend/app/academia/ClientAcademia.tsx` consumes `timetable.schedule`, `ophour`, the full aggregate for attendance, and both `marks.marks` and `courses.courses` for marks. Attendance prediction also uses timetable/calendar data. `academia/layout.tsx` needs `user`; GradeX needs marks plus courses; course and library pages consume courses.
- `frontend/app/api/timetable/route.tsx` and `api/ophours/route.ts` access Supabase directly using `encode(key)` as the row token. The timetable route expects a JSON-serialized timetable field. Changing cookie/session identity therefore affects these paths as well as `/get`.

## Compatibility risks and migration seam

1. Replacing only login URLs cannot satisfy the old Zoho token, redirect, CAPTCHA, and cookie assumptions. The current frontend expects one login response with either `authenticated`/`cookies` or `captcha.image`/`captcha.cdigest`; a staged challenge flow needs an explicit contract change.
2. New page markup, registration formats, course categories or numeric representations can cause silent empty results, lost courses, parsing failures, or frontend type mismatches. Preserve normalized envelopes, field names, string values and course identifiers through an adapter.
3. A working attendance/marks adapter alone does not make `/get` usable: user/course/timetable fetches still target old Academia. Define aggregate availability/error behavior and migrate these dependencies together or explicitly adapt their consumers.
4. Cookie rotation or an opaque application session ID changes cache/database lookup identity. Coordinate the backend token encoding, direct Supabase consumers, logout and frontend cache behavior. Existing cached records can conceal upstream expiration or scraper failures.

Recommended seam: introduce a portal/session adapter beneath the existing handlers, returning the current typed academic DTOs. Separate login/challenge/session transport from parsing and aggregate orchestration; fetch shared academic data once where supported. Preserve `/get` consumer contracts deliberately rather than assuming route names alone provide compatibility.

## New portal follow-up

This source audit did not test the new portal. Subsequent authenticated inspection verified attendance, summary marks, and assessment breakdown requests; see [student-portal-migration.md](student-portal-migration.md). Automated login, session lifetime, session-limit recovery, cookie rotation, and logout remain unverified. The current backend does not implement the new portal flow.
