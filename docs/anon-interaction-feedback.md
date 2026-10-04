# Login recovery and action feedback

Academia server/network failures open a styled recovery dialog with a Student
Portal sign-in action. Rejected credentials offer the same alternative with
accurate rejection wording, without alleging an outage. CAPTCHA and capacity
errors retain their specific flows. Switching providers preserves the account
name and clears the password, as the passwords may differ.

Feedback includes 180ms transitions, visible success confirmations for login,
manual sync and name saving, and brief optional vibration for selected controls.
Touch feedback can be disabled in Settings. Reduced motion disables transitions
and haptics. Unsupported vibration APIs are ignored. Running and queued syncs
use the existing button indicator and a screen-reader status announcement.
The floating progress notice and duplicate page/Settings queue messages were
removed on October 4. No new network polling or analytics is introduced.

The top notice appears only for completed outcomes. “Synced” requires an
advanced server sync timestamp; unchanged data
says “Up to date”. Offline, failed and partial updates keep their own status.
The existing refresh schedule drives queue checks. Motion pauses in background
and stops after completion; reduced-motion users see a still flower.

Design reference: Nielsen Norman Group's usability heuristics, especially system
status, user control, minimalism and recovery from errors:
https://www.nngroup.com/articles/ten-usability-heuristics/
These changes target friction reduction; retention improvement is unmeasured.

October 4 validation: static/offline build and two existing sync browser checks
pass, including hidden progress banners, queue completion and retry feedback.

Verified: full 137-test frontend suite, outage vs rejection recovery, password
clearing, fallback navigation, haptics opt-out, reduced motion and mobile overflow.
