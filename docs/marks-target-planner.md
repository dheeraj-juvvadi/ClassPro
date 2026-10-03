# Marks and GPA planning

Marks shows an overall grade slider above bordered subject cards. It starts at
Max possible and caps each included subject at its highest attainable grade.
Individual subject sliders default to that same ceiling. There is no Custom
scheme or numeric grade-target form.

Codes ending in P (case-insensitive, ignoring surrounding spaces) use 100 internal
marks with no final exam. Other subjects use 60 internal + 40 final, with the
exam marked out of 75 and weighted to 40. Remaining internal marks default to
full marks; a simple slider adjusts this assumption. Final-exam requirements
appear in a full-width result area.

Planning thresholds: O 91, A+ 81, A 71, B+ 61, B 56, C 50, F below 50.
Grade points: O 10, A+ 9, A 8, B+ 7, B 6, C 5, F 0.
Semester GPA = sum(grade points × course credits) / included credits.
Zero-credit and excluded subjects do not contribute. Course codes identify
subjects; credits come from course metadata, never guessed. Missing credits
show an unavailable estimate rather than a fabricated number.

Projected cumulative CGPA = (current CGPA × completed credits + semester GPA ×
semester credits) / (completed credits + semester credits). Current CGPA and
completed credits are optional inputs; semester GPA works without them. All
inputs are local to the current visit and clear on sign-out. No scenario is
sent to the server or written into academic records.

Defaults use the highest attainable total (scored + unrecorded internals +
final weight). User-edited targets and exclusions survive a report refresh.
These are projections, subject to actual course grading and exam pass rules.

Verification covers credit weighting, F/zero-credit/exclusion handling,
cumulative weighting, P suffixes, attainable defaults, the overall slider,
keyboard control, report refresh, missing metadata, sign-out, and mobile overflow.
