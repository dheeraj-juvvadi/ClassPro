# Anon academic data

Production: https://revamp-tracker.vercel.app
Vercel project: `revamp-tracker`, linked to `dheeraj-juvvadi/ClassPro`, branch
`main`, root directory `portal-app/public`. Pushes to main deploy the frontend.
The Python backend runs separately in the Azure `classpro-test` VM.

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
