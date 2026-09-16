# Anon academic data

Production: https://revamp-tracker.vercel.app
Vercel project: `revamp-tracker`, linked to `dheeraj-juvvadi/ClassPro`, branch
`main`, root directory `portal-app/public`. Pushes to main deploy the frontend.
The Python backend runs separately in the Azure `classpro-test` VM.

Academia uses Ratio-D's `/login` and `/refresh`; Portal uses `/portal/login`
and `/portal/refresh`. The public compatibility endpoints select these based
on the requested provider. Home offers account connection buttons without
discarding the other connection. Accounts must match by registration number
or, when unavailable, normalized username. Separate cookies and credentials
remain on the server for retry after SRM session expiry. Remembered sessions
are encrypted at rest and expire after 48 hours of inactivity. A failed
provider refresh preserves previous reports and displays a warning.

`SESSION_STORE_DIR` points to the mounted persistent session directory. The
Fernet key and encrypted SQLite records must survive container replacement;
both are restricted to the container user. Logout removes the stored session.
Unchecked "Keep me signed in" uses a browser-session cookie, a 30-minute idle
timeout, and no disk persistence. The frontend syncs on reopening, focus,
network reconnection and every five minutes while visible. SRM CAPTCHA or
rejected credentials can still require user action.

Academia builds its schedule from `My_Time_Table_2023_24` course allocation and
the appropriate batch of `Unified_Time_Table_2025`. Portal attendance takes
priority while Academia supplies the timetable if Portal has no entries.

The Ratio-D portal client uses these paths under
`https://sp.srmist.edu.in/srmiststudentportal`:

- Attendance and monthly totals: `/students/report/studentAttendanceDetails.jsp`
- Marks: `/students/report/studentInternalMarkDetails.jsp`
- Timetable: POST `/students/report/studentTimeTableDetails.jsp`, with
  `iden=10`, `filter=`, `hdnFormDetails=1`, `csrfPreventionSalt=`.
- Profile: `/students/report/studentPersonalDetails.jsp`

Login and refresh retrieve the timetable. The compatibility report retains
schedule and course metadata when a refresh omits them. Portal cookies stay on
the server. The UI displays course faculty, room, credits, monthly totals and
per-course attendance margins when supplied.

Day orders come from Ratio-D's bundled `src/data/calendar_data.json`, copied
to `ratio-diagnostic/data/calendar_data.json`, under the retained AGPL license
in `ratio-diagnostic/upstream/LICENSE`. This is a 2026 calendar, not a live SRM
calendar endpoint. Missing dates remain unknown; years are never substituted.
Campus time is Asia/Kolkata. Afternoon timetable hours below 7 are interpreted
as PM, matching Ratio-D. Counted hours use its 50-minute period convention.

Date projections follow Ratio-D: Leave adds absent hours; Attend and future OD
add present hours; past OD corrects existing absences, capped at the recorded
absence total. Unselected teaching days through the last leave date count as
attended. Unknown calendar dates are disclosed and excluded. Each course has
its own 75% target; overall attendance does not override a course's requirement.

Validation: Python report/calendar tests, frontend attendance/schedule/date
projection tests, and browser interaction checks at 320, 390 and 1280 pixels.

## September 16 interface update

Home now keeps the greeting and date without profile/account status text. Account
connections are available from More options → Accounts. The next-class card is
more compact, retaining duration, attendance and margin. Its duplicate calculator
button has been removed; the attendance date calculator is still available.

More options → Academic calendar opens a month grid with day orders, holiday and
exam indications where supplied by calendar descriptions, and selected-day
classes. More options → Timetable renders the returned periods as an accessible,
horizontally scrollable SVG using Inter and the existing sage/charcoal palette.
Subjects was removed because it duplicated Attendance. Empty timetables remain
explicit; this presentation does not manufacture missing SRM schedule data.

New HTTP sign-ins start on Academia. Connection failures offer a Student Portal
fallback dialog; a successful Academia login continues normally. Invalid
credentials, CAPTCHA and capacity errors retain their own handling. Switching to
Student Portal clears the password and keeps the account name; providers may use
different passwords. Remembered-session and auto-sync behavior is unchanged.

## Scheduled sync and compact agenda

Automatic refresh uses Asia/Kolkata time: hourly at 08:00 through 19:00, then
21:00 and 23:00. A visible, online browser checks whether a slot is due; hidden
or closed browsers do not request upstream refreshes. Returning after missed
slots performs one catch-up sync. Failed automatic attempts retain cached data
and wait until the next slot; manual Sync can retry immediately.

`GET /api/reports?cache=only` serves the remembered report immediately on startup.
A normal report request refreshes only when its slot is due; `?force=1` explicitly
refreshes for manual Sync. Slot metadata persists with the encrypted session.
No overnight background job logs into SRM for inactive users.

The Sync icon rotates while fetching, without a loading banner over existing
content. Unchanged report sections retain their DOM. Navigation does not fetch.
Today’s classes share one compact agenda; period planning buttons and connection
source labels were removed. The standalone timetable view is deferred; its menu
entry and the next-class arrow now lead to Attendance. The month calendar and
attendance date calculator remain available.

## Attendance change and Sunday sync

Automatic sync skips Sundays in Asia/Kolkata in both browser and backend.
Saturday's last slot leads to Monday 08:00. Cached startup reads and explicit
sign-in are allowed; manual Sync uses force=1 and works on Sundays.

Successful attendance readings are saved with the encrypted session, bounded to
200 observations / 3 days. Reports include per-course change24h only when a
baseline exists at or up to two hours before the 24-hour comparison point.
No missing baseline is fabricated. The displayed signed percentage is a change
in percentage points, with the precise explanation in its accessible label.
Warnings/errors are not sampled. Observations persist across server restarts
for remembered sessions; they are removed with session logout/expiry.

Both Sync buttons share a rotating SVG control. It remains visible for at least
650ms for fast responses and respects reduced-motion preferences. No new API
requests are introduced by the delta or greeting display.
