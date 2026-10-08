# Endsem dates

The Home shortcut stays visible until Endsem dates is first opened. That choice
is remembered on this browser across reloads. The + menu and desktop sidebar
keep the page available afterward.

`+ → View your endsem dates` reads the signed-in student's Student Portal data.
It makes only read requests; it never submits a Scribe application, payment,
document upload, or attendance change.

## Sources and discovery

The dedicated `StudentExamTimeTable.jsp` report supplies official dates when
available. `Scribe.jsp` supplies the `txtExamMonthYear` options; each value has
the form `month_year`. Anon requests the corresponding subject table from
`ScribeInner.jsp` with `iden=1`, `hdnExamMonth`, and `hdnExamYear`.

Discovery follows advertised sessions from the previous month through the next
12 months, with a maximum of six periods per check. It supports November and
December 2026, April and May 2027, and later year transitions without a release.
The portal now advertises November 2026. The old `11_2026` fallback has been
removed: only advertised option values are requested, without changing a 2025
option or inventing another session. The same subject can appear in multiple exam sessions.

The October 2, 2026 live read found four November 2026 subjects with blank date
and session fields. These display as **Not published**. The dedicated timetable
returned **No subjects found**. No real student data is committed as a fixture.

## Refresh and fallback

Opening Endsem dates makes a read request to `/api/exams`; its Sync button
requests `/api/exams?force=1`. The main Sync and Settings Sync buttons also
refresh exams once attendance/marks finish, including queued recovery. They
stay busy until that exam check completes and report partial failures. Login
and scheduled background sync do not request exams. Overlapping exam reads
share one browser request. A successful exam check is reused for six hours; failed checks
are reused for 15 minutes. Manual exam refresh bypasses that cache after a
60-second cooldown. The existing API admission limit and session lock bound
concurrent work, with two concurrent period reads, a 25-second overall deadline,
and bounded response sizes. Signed-out requests cannot read exam data.
Exam requests wait for their session lock before taking an API worker slot,
so repeated opens cannot occupy workers while waiting on the same student.
If Student Portal expires, saved dates remain visible as cached with a reconnect
message. Signing out clears the page and its saved report data.

Successful responses replace that period's previous result, including explicitly
blank or empty tables. A failed request or unknown layout retains the last
successful period and marks it cached. Official rows take priority within the
matching subject/session. The UI shows last-check time, source, unpublished
states, and a short disclaimer:

> Scribe Request dates are provisional, not official, and may change. Confirm
> with the official timetable or hall ticket.

Exam dates also mark the academic calendar. They do not create teaching dates,
day orders, holidays, or counted attendance hours.

## Verification

Synthetic parser and HTTP tests cover discovery, future sessions, year rollover,
blank/invalid dates, source priority, cache isolation, partial failure, cancellation,
connection cleanup, response limits, and read-only requests. Browser checks cover
session filtering, unpublished/cached states, calendar markers, safe text,
responsive layout, and sign-out clearing.
