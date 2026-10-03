# Feature recommendations — October 2026

Recommend **1–3 first**, one at a time. Keep additions inside existing pages,
with secondary controls collapsed until needed. No new dashboard or navigation
section is necessary. Effort estimates are engineering days including focused
validation, assuming the existing report contracts remain stable.

## Evidence and scope

Reviewed current frontend modules against [the backlog](../implementation-backlog.md).
The backlog records attendance projections, optional-period filtering, inline
grade targets and offline schedules as shipped. Current code also contains
class reminders and academic history; this review does not establish a new
production deployment for changes in the dirty checkout.

Do not propose those features again. Keep removed Recent changes, profile
artwork and extra Settings content out. The older Settings document's claim
that class reminders are missing is superseded by
[class-reminders.js](../portal-app/public/class-reminders.js).
Exam dates through Scribe Request with fallback are already under consideration
and belong to the separate investigation; no exam or auth files were inspected.

## Ranked shortlist

Server cost below means incremental ongoing cost: all six can run locally on
existing reports, without new polling, storage services or upstream requests.

| Rank | Addition and user benefit | Effort | Server cost | Data dependencies |
| --- | --- | --- | --- | --- |
| **1** | **Export classes to calendar.** High: see classes in the phone's calendar and use its reminders after Anon closes. | 2–3 days | None | Verified dated teaching calendar, periods, timezone and optional-period choices. |
| **2** | **Personal attendance cushion.** High: plan toward 80% or 85% instead of repeatedly calculating extra safety above 75%. | 1–2 days | None | Present/conducted hours; confirmed schedule only for date estimates. |
| **3** | **CGPA goal → required semester GPA.** High: answer “What do I need this semester?” directly. | 1–2 days | None | Current CGPA, completed credits and current semester credits; existing manual inputs cover missing history. |
| 4 | Resume one saved leave draft. Medium: avoid rebuilding a multi-day plan after reload. | 2–4 days | None | Existing selections, period identifiers and a fresh report baseline; profile-scoped browser storage. |
| 5 | Show gaps between classes. Medium: quickly find a lunch or study window. | 1–2 days | None | Confirmed date, selected periods and valid start/end times. |
| 6 | Export academic history as CSV. Medium: reuse semester results in a spreadsheet without copying every row. | 1–2 days | None | Existing academicHistory semester/course records and freshness state. |

## Scope and acceptance

**1. Calendar export:** Add one Schedule action for a bounded date range and
download a static `.ics` file. [schedule-model.js](../portal-app/public/schedule-model.js)
and [the schedule contract](../portal-app/public/schedule-contract.md) already resolve dated periods;
the inspected UI has no calendar-file export. Acceptance: respect exclusions,
holidays and timezone; report skipped unknown dates; export no invented rotation.
Use stable event IDs and verify import into Apple and Google Calendar. Explain
that this is a snapshot and timetable changes require a new export; do not
promise automatic updates or duplicate-free reimport across calendar apps.

**2. Attendance cushion:** Add an optional personal planning target, retaining
the displayed 75% reference. [attendance-math.js](../portal-app/public/attendance-math.js)
already accepts a target; [academic-ui.js](../portal-app/public/academic-ui.js)
currently uses the default. Acceptance: choosing 80% updates projected margins
and recovery consistently; 75% preserves existing results; the personal goal
never changes recorded attendance or implies a different university rule.

**3. CGPA goal:** Add one optional goal input beside the existing cumulative
projection. [marks-target-math.js](../portal-app/public/marks-target-math.js)
currently computes forward projections only. Acceptance: CGPA 8.0 over 60
credits, with 20 semester credits and a goal of 8.2, returns required SGPA 8.8.
Withhold results for missing/invalid credits, flag requirements above 10, retain
manual overrides and label the result an estimate. No automatic subject-target
optimizer is needed.

**4. Leave draft:** [date-attendance.js](../portal-app/public/date-attendance.js)
holds plans in memory and already reconciles refresh/rollover. Acceptance:
explicitly save one draft, restore after reload, recalculate against current
records, flag changed periods, discard expired dates and clear on sign-out.
Offer Delete; handle unavailable browser storage without blocking planning.

**5. Class gaps:** [home.js](../portal-app/public/home.js) renders today's classes
but no computed gaps. Acceptance: show one quiet “Free 12:00–13:00” line between
non-overlapping classes; merge overlaps, respect exclusions and avoid claiming
free time on unconfirmed dates. No tasks, streaks or extra reminders.

**6. History CSV:** [academic-history.js](../portal-app/public/academic-history.js)
offers semester expansion but no export. Acceptance: a local download preserves
semester/period, course code/title, credits and grade, including retakes and
unpublished values; escape CSV and neutralize formula cells. Include freshness
and identify the file as a personal copy, not an official transcript.
