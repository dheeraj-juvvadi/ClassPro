# Friends space

Implementation in progress. Entry: + → Friends, also in the desktop sidebar.

Students want to see who has a break and compare attendance with people they
choose. The page uses the app's dark sage palette, Inter type, open rows and
small monospace ASCII portraits. Availability leads; the top selector switches
between all friends, a person, and a group. Local navigation switches Now,
Leaderboard and Manage. Native select, buttons and dialogs keep keyboard access.
Use a 4px spacing scale, 44px control targets, subtle surface changes and no
ambient animation. The graph has readable names and values alongside bars.

Server records belong to a HMAC of the authenticated provider's verified student
ID, never a supplied account, name, gender, section, attendance or schedule.
Separate encrypted SQLite storage lives on the existing persistent data mount.
No passwords/cookies are copied to social storage. App sign-out clears browser
state but retains the social profile for 14 days after last activity. Expiry
deletes memberships, friend relationships, requests and invite codes. Groups
remain while an active member uses them; ownership transfers if the owner expires.
Avatars rotate after 14 days, with an optional user-selected style. Default style
comes from the explicit Personal Details gender, with a neutral fallback.

Friends require an invite code and acceptance. Groups have separate codes.
The X2 group is automatic for participating users with a verified X2 section,
matching institution, program and admission cohort. Missing values never imply
X2 or permit a client-supplied section. Only participating members are visible.
Sharing availability and attendance is an explicit choice; either can be disabled.
Block/remove/leave/delete controls are available. No real contacts are seeded.

Attendance ranks use total recorded present hours / total conducted hours,
not average percentages or planner projections. Ties share a rank. Unknown or
stale records stay unranked. Availability is a timetable estimate, not physical
presence or live location. It uses confirmed dates and expires after 24 hours
without a fresh report; hidden/unknown states never count as free. Only today's
coarse class/free status and times are returned, not other users' raw reports.

Friends endpoints use existing authentication, same-origin mutation checks,
body limits and rate limits. Reads do not fetch SRM. Sync refreshes enrolled
profiles from existing reports. Social failures cannot block academic sync.
