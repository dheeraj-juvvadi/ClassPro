# Anon Settings

The former Accounts dialog is now Settings, with grouped rows inspired by
Ratio-D's shared SettingsPage and desktop Settings components. Connection status
is displayed only inside Settings. Expired or missing providers offer the existing
reconnection flow; successful providers show Connected.

Implemented controls:
- Display-name override, saved per profile in this browser.
- Sage, Sand and Clay accent choices within the existing dark design.
- Opt-in browser notifications when a running Anon session detects changed marks
  or attendance. No background push subscription or notification polling.
- Manual Sync, using the existing forced report refresh route and scheduled cache.
- Reset local preferences, privacy information, What's New, GitHub feedback link
  and sign-out.

The sync schedule explanation, Course details and Recent changes were removed
from Settings at the user's request. Scheduled background sync remains active.
No change history is stored; existing stored history is discarded on the next
report load while preserving preferences.

Preferences are stored under a per-profile localStorage key. This is
browser storage, not encryption; no portal credentials or grades are saved there.
Signing out clears the visible Settings state. Resetting local preferences does
not end the server session. Feedback opens GitHub; Anon submits nothing itself.

Validation covers connection state visibility, name/theme updates, persistence,
reset and layouts at 320, 390 and 1280 CSS pixels.

Settings uses plain profile text, a dark green foundation and restrained sage
accents. There are no profile illustrations, avatars or image banners.

## Remaining differences from Ratio-D

- Class reminders: Ratio-D checks for next-class notifications at 15 and 5 minutes.
  Anon currently notifies only when attendance or marks change.
- Notification delivery: Ratio-D can use a registered service worker; Anon uses
  the browser Notification constructor while open. This is not background push.
- Feedback: Ratio-D has rating/message submission inside the app; Anon links to
  GitHub issues.
- Appearance: Ratio-D offers complete theme/style presets; Anon has three accents.
- Profile artwork/avatar customization is intentionally excluded by user request.

References: reference/ratio-d/src/components/desktop/settings/Settings.tsx,
reference/ratio-d/src/context/AppContext.tsx, and
reference/ratio-d/src/utils/shared/notifs.ts.
