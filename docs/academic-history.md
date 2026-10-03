# Academic history

Verified against the signed-in Student Portal on September 20, 2026.

The shell at `students/template/HRDSystem.jsp` loads
`students/report/studentMarksCredits.jsp` by POST with `iden=8`, an empty
`filter`, and the shell's current `hdnFormDetails` and `csrfPreventionSalt`.
The Grade / Mark & Credit menu and its actual network request were inspected.

The first results table contains Semester, Month / Year, Code, Description,
Credit, and Grade. An SGPA row follows each semester; the final CGPA row is the
official cumulative result. A separate table gives Credits Registered, Credits
Earned, and Credits Required. Later tables contain failures, absences, and grade
definitions; they must not be appended to the main transcript.

`PortalAcademicService` returns `academicHistory` with the official totals,
semester groups, and course grades. GPA values are not reconstructed or averaged.
Semester earned credits count passing course rows; zero-credit and unpublished
grades remain visible. Retake periods remain separate. Overall earned credits
always come from the official summary, not a sum of course attempts.

The public report includes this history and copies official CGPA/earned credits
into the profile for the existing projection calculator. Sync failures preserve
the last successful history with `stale: true`. A recognized empty report clears
old history. Unknown layouts are unavailable, never a fabricated zero GPA.

The Marks view shows current CGPA, degree-credit progress, an expandable semester
chart, best semester, change from the first published semester, grade counts,
and expandable subject lists. Open sections survive refresh. Manual calculator
edits survive autofill. Logout clears the history with the existing report cache.

Fetching runs only within existing login/report sync work: two requests maximum,
ten seconds total, and 512 KB per response. No additional polling or persistent
worker is created. Production grades stay in the existing private session/report
storage; no academic data is added to analytics. Live student records are excluded
from source fixtures, which use synthetic subjects and grades.

Checks cover the observed report layout, official totals, duplicate failure
tables, retakes, empty/invalid data, failed sync, bounded HTTP fetching, keyboard
expansion, text escaping, manual edits, logout, and 320–1440px layouts.
