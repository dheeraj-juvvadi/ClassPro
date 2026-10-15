# Attendance changes

The small signed figure beside each recorded percentage shows the most recent
change to that course's attendance. A positive change is green, a negative change
is red, and a rounded zero is neutral. The visible badge uses only the signed
number, such as `+1.1` or `−1.2`. Its accessible description and tooltip explain
that the difference is measured in percentage points.

Each update is compared with that course's previous successful observation
within three days. Its badge lasts 24 hours from when the update was observed.
Unchanged syncs preserve both the signed change and its original expiry. A new
change to attended or conducted hours replaces the badge and starts a new
24-hour lifetime for that course, even when its percentage stays the same.

New subjects without history and failed report reads get no invented change.
Projected attendance does not inherit a recorded-history change. Samples remain
bounded to 200 observations. The most recent change is stored separately with
the encrypted session, so repeated syncs and server restarts do not erase it.
Existing sessions recover their last change from saved observations. Responses
expire against the current time; the browser also expires badges on a timer and
when the page becomes visible, including when displaying cached reports.

Required hours count future attended hours, which also increase conducted hours.
For 28/38, one future hour gives 29/39 (74.36%), and two give 30/40 (75%). A
correction to an existing absence keeps the total fixed; it is a separate OD
operation. Expanded attendance details show the projected fraction explicitly.
