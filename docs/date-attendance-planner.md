# Attendance planner and schedule preferences

The planner uses Cally 0.9.2 calendar components, vendored with MIT attribution
in portal-app/licenses. The module is 38,355 bytes / about 12 KB gzip, loaded on
first opening and available in the public offline shell. No runtime CDN is used.

Selecting a start and end date includes confirmed teaching dates in between.
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
Intervening teaching dates before a future missed class count as attended, as
stated in the calculator. No official report is modified by a scenario.

Plans are kept for the current visit and cleared on sign-out. Report refreshes
recalculate open plans, retain valid dates and discard changed class identifiers.
Date rollover removes past non-OD selections. Removed dates/class overrides are
described in the status text. Class identifiers include code, time, hours, batch
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
