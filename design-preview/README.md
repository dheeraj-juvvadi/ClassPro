# Anon design preview

Continuation of the v7 mockups from `classpro-login-centered-v7`,
`classpro-attendance-margin-v7`, and `classpro-marks-compact-v7`.
The original login artwork and the approved attendance direction are retained.

## Run

From the repository root:

```sh
node design-preview/build.mjs
node design-preview/serve.mjs
```

Open `http://127.0.0.1:4180`. Individual pages are at `/login/`, `/home/`,
`/attendance/`, `/marks/`, `/schedule/`, `/calendar/`, `/settings/`, and `/grades/`.

The current workspace reuses the original mockup dependencies through ignored
`node_modules` symlinks. For a fresh checkout, run `npm install` separately in
the `login`, `attendance`, and `marks` folders before building. The other pages
use plain HTML, CSS, and JavaScript. Set `PREVIEW_PORT` to change the server port.

## Scope

These screens use sample records. Login is a demonstration and sends no
credentials; settings affect only the current preview. The university-backed
application under `portal-app` remains a separate implementation.

Login opens with email and expands the same centered component for both
Academia and Student Portal passwords. Attendance places signed recovery hours
at the right edge and the recent percentage-point change beside attendance.
Marks keeps every assessment visible as a compact label/score pair.

The shared navigation connects Home, Attendance, and Marks. The + menu opens
Grade planning, Schedule, Academic calendar, Settings, and Sign in. CGPA and
Predict your grade live together on Grade planning, with one tool visible at a
time. The Marks screen contains only course marks and assessment scores.

## Component provenance

The existing login adapts Rare UI's FamilyDrawer, copyright Swami Malode;
see `login/LICENSE-Rare-UI.txt` and its provenance folder. Attendance and marks
adapt mdxcn components, copyright Keshav Bagaade; their MIT notices and source
manifests remain with each page. Original Inter and Anon artwork are reused.
