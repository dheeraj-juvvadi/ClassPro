# Marks target planner

Open a course in Marks and choose **Plan a target**. The planner uses that
course's reported scored/maximum totals, a scheme chosen by the student, an
expected score from remaining internal assessments, and a target out of 100.

Ratio-D's target workflow and 60/40 examples informed this feature, reviewed at
reference commit 413b7f0. Its grade labels and inferred practical-course rules
are not assumed to apply to every SRM course. Anon requires an explicit scheme:
60 internal + 40 final (exam out of 75 or 40), 100 internal, or custom.

With I internal points available, S scored, E expected from remaining internals,
target T, and final exam maximum M, the raw exam score needed is
`max(0, T - S - E) × M / (100 - I)`. Displayed scores round upward to hundredths.
Internal-only courses show the projected total without dividing by zero.
Impossible targets, absent totals and mismatched schemes have separate states.
The planner does not calculate an official grade or waive an exam pass minimum.

No network, localStorage or telemetry writes are added. Valid scenarios are kept
in memory per course for this visit and cleared on sign-out. A refresh updates
an open planner's reported marks; removed courses close their outdated plan.

Validation covers theory/practical/custom/internal-only calculations, limits,
missing inputs, focus return, scheme changes, session clearing, mark updates,
and overflow at 320, 390, 768 and 1280 pixels.
