# Optional schedule report

`reports.schedule` is optional. Home accepts it as the second argument to
`anonHome.update(reports.attendance, reports.schedule)`.

- `timezone`: required IANA timezone, normally `Asia/Kolkata`.
- `entries`: array of timetable periods. Each has `code`, `title`, `room`,
  `start`, `end`, and exactly one of `day` or `dayOrder`.
- `start`, `end`: 24-hour `HH:mm`, end strictly after start, same day.
- `day`: integer weekday, Sunday 0 through Saturday 6.
- `dayOrder`: nonempty string ID; do not convert dates into guessed rotations.
- `allocation`, `batch`: optional nonempty string labels on each entry.
  Unlabeled entries are common to every selection.
- `calendar`: array of explicit dated records with `date` (`YYYY-MM-DD`),
  `kind` (`teaching` or `holiday`), optional string `dayOrder` and `label`.
  Duplicate dates are invalid. Holidays suppress all periods for that date.

Use `calendar: []` until authoritative calendar data is verified. Entries remain
viewable in Schedule, but no dated class is inferred. Missing calendar dates are
unknown, including weekends. A future class after a gap is “Next known class.”
Weekday entries also require explicit teaching dates in reported mode.
Day-order entries match only an explicitly supplied calendar day order.

Invalid reports fall back to the clearly labeled device-local manual weekly
plan and display a schedule-unavailable status. Reports never overwrite it.
Missing optional metadata is not inferred. Room is currently required; omit
the schedule report until required fields are known, or supply a clearly marked
unavailable room label from the adapter rather than a fabricated room.

Adjacent periods merge only when course, title, room, allocation and batch match.
The calculator treats elapsed whole hours as a user-adjustable scenario using
the existing attendance math. Partial hours require manual counted-hour input.
Neither planning nor filtering changes academic records.

