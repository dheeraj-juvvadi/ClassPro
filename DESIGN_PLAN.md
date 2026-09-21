# Attendance layout

Approved: Ledger B, without visible Margin/Required labels.

- Hours stay at the far right; percentage and attended/missed counts remain visible.
- Open rows use separators, consistent 128px minimum height and tabular digits.
- No plus marker or per-subject Plan button. The page-level planner remains.
- Course metadata remains keyboard-accessible through the subject row.
- Screen readers receive the hours' Margin/Required meaning.

Implementation: `portal-app/public/academic-ui.js`, `attendance-page.css`, and the refresh focus handling in `app.js`.

Home widgets show today's remaining classes only. One class uses a shared lower message; two classes use the third widget for the remaining-count message. No classes shows “You are done for the day”. A class remains through its end minute and disappears on the following minute, including from today's timeline.

Validation: responsive layout, keyboard expansion and refresh focus, page planner, unknown attendance, and simulated minute transitions. Build and release checks run before deployment.
