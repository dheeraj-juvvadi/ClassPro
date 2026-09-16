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
- Course details from the current report, including faculty and room when supplied.
- Recent change summaries retained locally for 48 hours (maximum 40 entries).
  Tracking begins when reports load; no historical changes are fabricated.
- Clear history, reset local preferences/history, privacy information, What's New,
  GitHub feedback link and sign-out.

Preferences and history are stored under a per-profile localStorage key. This is
browser storage, not encryption; no portal credentials or grades are saved there.
Signing out clears the visible Settings state. Resetting local preferences does
not end the server session. Feedback opens GitHub; Anon submits nothing itself.

Validation covers connection state visibility, name/theme updates, persistence,
change logging, reset and layouts at 320, 390 and 1280 CSS pixels.

Settings has its own composition: charcoal foundation, cream profile note with a
small original line-drawn flower, clay and muted olive connection tiles, and open
preference rows. The calendar banner is not reused. Sage is limited to status
accents rather than covering the surface. Existing Settings behavior is retained.
