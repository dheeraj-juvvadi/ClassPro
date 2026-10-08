# Attendance changes

The small signed figure beside each recorded percentage compares it with a
successful earlier reading. A positive change is green, a negative change is
red, and a rounded zero is neutral. Units are percentage points (pp).

The backend prefers the existing 24-hour baseline, when a saved observation
exists 24–26 hours before the current reading. Otherwise it uses the previous
successful observation within three days. The accessible description and
tooltip distinguish “past 24 hours” from “since previous sync.”

New subjects without history and failed report reads get no invented change.
Projected attendance does not inherit a recorded-history change. Samples remain
bounded to 200 observations and persist with the encrypted session. Rapid
unchanged reads coalesce, while actual changes retain their prior observation.
