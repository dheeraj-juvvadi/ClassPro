# Attendance planner and schedule preferences

The main planner is a quiet two-step flow: choose Leave, Attend or OD correction
and a From/Through range, then review one final percentage per subject. Expand a
subject for recorded attendance, before/after checkpoints and counted hours.
Historical OD shows Recorded/After OD correction instead of a future forecast.
A compact text/icon Close action dismisses the estimate; it does not save records.

Customize days reveals Cally 0.9.2 calendar components, vendored with MIT
attribution in portal-app/licenses. The module is 38,355 bytes / about 12 KB gzip,
loaded only on customization and available offline. No runtime CDN is used.

Native ranges replace an earlier plan when the dates or mode change. Reviewing
an unchanged range preserves removed days and per-class edits. The requested
endpoints remain fixed even if an endpoint is removed: unselected future classes
inside the range count as attended. Newly verified teaching dates adopt the
range action on refresh, but intentionally removed dates stay removed.

In the advanced calendar, selecting start and end dates includes teaching dates.
Reverse selections work. Holidays, missing calendar entries and past non-OD
dates are excluded. A single first date is immediately usable. Additional ranges
are additive, and already customized classes are retained when the day action
matches. Each day in the list opens its class editor.

Clicking a selected date removes only that day, including its class overrides.
For example, selecting 15–18 and then clicking 16 keeps 15, 17 and 18 selected.
Clicking 16 again restores that date with the current action. Removing a date
cancels any unfinished range; existing selections and other class edits remain.

All classes start selected for the chosen action. Students can unselect a class,
choose Attend/Miss/OD, or enter counted attended hours within a class block.
There is no time-of-day cutoff preset. Past dates permit OD corrections only;
corrections are capped at recorded absences and never add conducted hours.
For native future plans, verified teaching dates from today through the day
before the range count as attended unless explicitly customized. Only selected
Leave classes count as missed; Attend adds their present and conducted hours.
For October 15–25 leave, October 1–14 attendance is included before subtracting
selected leave hours. Each checkpoint is calculated from the recorded baseline,
not from another prediction's returned present value. Today's existing scheduled
hours are included because reports supply no attendance-as-of timestamp.

Unknown calendar dates never manufacture hours. Any incomplete final forecast
is shown as —; a verified before-range checkpoint can still be shown. Reversed
ranges and traversals over 400 calendar days are rejected. Native OD accepts
only dates before today, ignores selections outside its range, and never adds
intervening or future attendance. No official report is modified by a scenario.

Plans are kept for the current visit and cleared on sign-out. Report refreshes
recalculate open plans, retain valid dates and discard changed class identifiers.
Date rollover removes past non-OD selections. Ongoing native ranges remain
reviewable, using the refreshed baseline with no invented historical before
checkpoint. Expired future ranges return to date selection on either clock or
report refresh; historical OD plans remain reviewable. Removed dates/class
overrides are described in the status text. Class identifiers include code, time, hours, batch
and allocation so a changed timetable does not silently reuse an old override.

Schedule, Calendar and Settings have their own hash routes, page titles and
normal app navigation. Calendar shows a selected day's classes with an entry
into the day planner. Its heading has no illustration or subtitle.

Schedule includes all reported periods initially. Students may exclude optional
periods; the selection applies to matching day orders. Preferences are scoped to
the reported profile and stored in this browser. New/changed periods default to
included. Choices drive next-class/today widgets, reminders, the calendar,
projections and recovery-date estimates. They do not change recorded attendance.

Verification covers ranges, partial hours, OD caps, refresh/rollover, keyboard
navigation, offline calendar loading, 320–1440px layout, full-page navigation,
optional-period persistence, and local sign-out clearing. Physical-device frame
rate/battery use and live SRM login latency are not established by these checks.
# Schedule choice and calculator return

The calculator's **Use schedule** switch defaults on and counts the included
periods from Schedule. **Edit schedule** opens that app page. Its **Back to
calculator** link and browser Back restore the open calculator with its selected
dates, action, class edits and switch setting. Schedule changes recalculate the
included hours without clearing the draft.

With **Use schedule** off, users enter whole hours per subject across the selected
dates. This works without a timetable and assumes no intervening classes. Leave
adds to conducted hours, Attend adds to attended and conducted hours, and OD
corrects existing absences without increasing conducted hours. Manual hours are
kept when switching modes or visiting Schedule; sign-out clears the draft.

An optional compact attendance-card preview is available with
`?attendance=tickets#attendance`. Add `preview=home` to use sample data without
signing in. The preview uses separate muted sage tickets and omits the target
rail. It does not change the default attendance layout.
