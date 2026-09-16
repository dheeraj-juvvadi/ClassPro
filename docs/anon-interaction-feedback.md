# Login recovery and action feedback

Academia server/network failures open a styled recovery dialog with a Student
Portal sign-in action. Rejected credentials offer the same alternative with
accurate rejection wording, without alleging an outage. CAPTCHA and capacity
errors retain their specific flows. Switching providers preserves the account
name and clears the password, as the passwords may differ.

Feedback includes 180ms transitions, visible success confirmations for login,
manual sync and name saving, and brief optional vibration for selected controls.
Touch feedback can be disabled in Settings. Reduced motion disables transitions
and haptics. Unsupported vibration APIs are ignored. Background refreshes do not
trigger celebratory toasts. No new network polling or analytics is introduced.

Design reference: Nielsen Norman Group's usability heuristics, especially system
status, user control, minimalism and recovery from errors:
https://www.nngroup.com/articles/ten-usability-heuristics/
These changes target friction reduction; retention improvement is unmeasured.

Verified: full 137-test frontend suite, outage vs rejection recovery, password
clearing, fallback navigation, haptics opt-out, reduced motion and mobile overflow.
