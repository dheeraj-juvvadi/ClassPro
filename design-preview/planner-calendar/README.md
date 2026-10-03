# Planner selection review

Production files were not edited. This is one responsive mockup; earlier
`?layout=month` and `?layout=split` URLs now both show the same design.

Run from the repository root:

```sh
node design-preview/planner-calendar/serve.mjs
PLAYWRIGHT_CHANNEL=chrome node design-preview/planner-calendar/capture.mjs
PLAYWRIGHT_CHANNEL=chrome node design-preview/planner-calendar/verify.mjs
```

Open http://127.0.0.1:4186/design-preview/planner-calendar/.

## Current review images

- `../screenshots/planner-sage-10-20-390-calendar.png`: full range, mobile crop.
- `../screenshots/planner-sage-exclude15-390-calendar.png`: 15 excluded, mobile crop.
- `../screenshots/planner-sage-10-20-1280-calendar.png`: full range, desktop crop.
- `../screenshots/planner-sage-exclude15-1280-calendar.png`: 15 excluded, desktop crop.
- Each prefix also has `.png` viewport and `-full.png` whole-page captures:
  `planner-sage-10-20-390`, `planner-sage-exclude15-390`,
  `planner-sage-10-20-1280`, `planner-sage-exclude15-1280`.

Latest explicit user direction: every selected cell uses the same sage green
`#b8c398`, dark numerals, and dark muted DO labels. A 1px white perimeter surrounds
each contiguous row segment, with 11px rounding only on its exposed left/right
edges. Interior cell borders are zero. Excluding 15 leaves a plain gap, caps 14
and 16, and restoring it merges the band. Week and month boundaries cap neatly.
Chrome checks assert the actual computed fills, text colors, border widths,
corner radii, and gap-free adjacency at 390 and 1280 for both states and restoration.

The component's underlying proportions follow the original ClassPro source at
`c574308^:frontend/components/ui/calendar.tsx`, used by
`frontend/app/academia/components/Attendance/Prediction/RangeCalendar.tsx`.
Its DayPicker classes use rounded selected endpoints and neutral range middles.
The Anon colors, 44px targets, day-order labels, and Cally behavior are retained.
The retired predictor used `mode="range"`. The Ratio `Predict.tsx` was also read;
it renders individual rounded cells itself rather than importing a calendar.
The older experimental connectors, rings, slashes, and dashed cutouts are removed.

## Verified behavior and source contract

First click anchors; second click fills the inclusive range in either direction.
Subsequent date taps exclude or restore directly. New range resets selection.
Calculate keeps the calendar visible and shows range, holidays, and subject hours.
Results update immediately when dates change. No percentages or projected records.

10–20 October: 11 dates, 6 holidays, 5 teaching days. Excluding 15 leaves four
teaching days: Operating Systems 2h, Data Structures 4h, Computer Networks 4h,
Discrete Mathematics 3h, Professional Ethics 2h. Restoring 15 restores its hours.

`fixture.json` copies September–November directly from the bundled calendar via
`portal-backend/academic_data.py:calendar_days`. Labels and day orders are read
through the existing `anonScheduleModel`. The current preview's fictional lessons
are reused from `design-preview/schedule/page.js`; a 50-minute sample period counts
as one class hour. This convention is stated on screen. Unconfirmed dates count
as neither holidays nor hours. No additional exam events or live data are used.

Cally is imported unchanged from production and retains native keyboard handling.
Chrome verification passed arrow/PageUp/PageDown, Leave/Attend/OD date eligibility,
44px controls, no horizontal overflow at 320/390/430/1280, reduced motion and no
page errors. Month motion is 160ms opacity/transform only. Selection does not animate
geometry. Screenshots were captured successfully; image inspection was unavailable
in the agent runtime, so visual approval is the next step.

Owned files: `index.html`, `page.css`, `page.js`, `fixture.json`, `serve.mjs`,
`capture.mjs`, `verify.mjs`, this README, and planner PNGs in `../screenshots/`.
No commits, pushes, deployments, build hashes, production math, or exam contracts changed.
