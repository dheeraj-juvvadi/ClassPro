# Marks target planner

Each course in Marks contains an inline grade planner. A native slider and
grade stops sit beside the expected remaining internals and exam target.
Assessment rows expand underneath; grade planning does not open a dialog.
The planner uses reported scored/maximum totals, a student-selected marking
scheme, expected remaining internals, and a target out of 100.

Ratio-D's target workflow and 60/40 examples informed this feature, reviewed at
reference commit 413b7f0. Grade buttons now match ClassPro GradeX:
O = 91, A+ = 81, A = 71, B+ = 61, B = 56, C = 50. Verified against
frontend/types/Grade.ts and GradeCard.tsx in ClassPro commit
1c4ee678f4e5cafa976c7119b98f35f1d3dc819f. These are planning presets;
course grading rules can differ. Custom retains arbitrary numeric targets.
New plans default to A+; each course retains its own inputs for the visit.

Anon still requires an explicit marking scheme:
60 internal + 40 final (exam out of 75 or 40), 100 internal, or custom.

With I internal points available, S scored, E expected from remaining internals,
target T, and final exam maximum M, the raw exam score needed is
`max(0, T - S - E) × M / (100 - I)`. Displayed scores round upward to hundredths.
Internal-only courses show the projected total without dividing by zero.
Impossible targets, absent totals and mismatched schemes have separate states.
The planner does not calculate an official grade or waive an exam pass minimum.

No network, localStorage or telemetry writes are added. Scenarios are kept
in memory per course for this visit and cleared on sign-out. Report refreshes
update calculations while preserving input controls, focus, and expanded
assessment rows. Removed courses discard their plans.

Validation covers theory/practical/custom/internal-only calculations, limits,
missing inputs, grade/custom switching, slider keyboard selection, focus retention, scheme
changes, session clearing, mark updates, and overflow at 320, 390, 768 and 1280
pixels. Grade buttons use native controls with 44px minimum touch targets;
no additional library or network requests are introduced.
