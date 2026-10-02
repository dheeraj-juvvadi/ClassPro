# Endsem dates

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
The verified `11_2026` workaround is used only through December 31, 2026, until
the portal advertises that value itself. Other unadvertised periods are not
guessed. The same subject can appear in multiple exam sessions.

The October 2, 2026 live read found four November 2026 subjects with blank date
and session fields. These display as **Not published**. The dedicated timetable
returned **No subjects found**. No real student data is committed as a fixture.

## Refresh and fallback

Checks run on Student Portal login and during Anon's existing active-session
report refresh. A successful check is reused for six hours; failures are retried
after 15 minutes at the next report sync. There is no new background polling
service for inactive users. Requests use two concurrent period reads at most,
a 25-second overall deadline, and bounded response sizes.

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
