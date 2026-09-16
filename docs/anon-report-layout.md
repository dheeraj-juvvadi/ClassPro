# Attendance and Marks layout refinement

`portal-app/public/report-layout.css` loads after `academic.css`. Source attribution
is retained in `portal-app/public/opensourceui-LICENSE.txt` and below.

## Layout

- Attendance/Marks main shells extend to the available viewport edges, with
  the existing rounded top corners, background, border color and vertical spacing.
- Header typography, illustration and theme remain upstream. The report heading
  retains its former 702px desktop content width, centered independently of the
  expanded main shell. Mobile uses 25px main padding plus its 1px border, matching
  the previous 13px outer margin + 12px padding + 1px border.
- Marks uses full-width native disclosure rows: flexible title/code/count left,
  score right, and a fixed trailing plus/minus column. Only adjacent course rows
  have separators. The list, row perimeter and assessment inset borders are removed.
- Titles wrap, scores use tabular figures, assessments have explicit spacing,
  keyboard focus is visible, and no animation or framework runtime was added.

## Source adaptations

Fetched September 16, 2026:

1. OpenSourceUI `MusicPlaylistCard`, by Bidyut Kundu:
   https://github.com/bidyut10/opensourceui/blob/main/components/audio/music-playlist-card.tsx
   Adapted its `w-full` row, `min-w-0 flex-1` title/metadata grouping, trailing
   value, peer separators and local hover surface into a three-column CSS grid
   on existing `details`/`summary`. Native disclosure handles interaction.
   MIT notice is retained in `portal-app/public/opensourceui-LICENSE.txt`.
2. React Bits `AnimatedList`, by David Haz:
   https://github.com/DavidHDev/react-bits/blob/main/src/content/Components/AnimatedList/AnimatedList.css
   Adapted `.item`'s 16px inset and 8px radius into desktop summary spacing and
   its interaction surface. Static styling only; document scrolling and native
   disclosures replace animated list selection, fixed scroll bounds and fades.
   License fetched from https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md;
   reproduced below and already retained in `portal-app/licenses/react-bits.txt`.

## Verification

Used isolated headless Chrome against `http://localhost:5173/?preview=home`,
with sample preview data. No user browser tab was accessed and no images were read.

- Attendance baseline versus injected override at 320, 390, 700, 768 and 1440px:
  exact equality for heading, title and site-header x/y/width/font-size.
  Heading x/width respectively: 26/268, 26/338, 26/648, 33/702, 369/702px.
- Main x = 0 and width = viewport at every checked size; no horizontal overflow.
- Marks at 320, 390, 768 and 1440px: summary width equals list width, score begins
  after the title column, list and first course perimeter borders are 0px,
  and no horizontal overflow.
- Keyboard Enter opens and closes the first assessment disclosure.
- Integrating agent independently confirmed a 1222px Marks list at 1280px,
  with the header preserved at x=289px / width=702px, and no 390px overflow.
- All 129 frontend tests pass. Scoped `git diff --check` passed.

## React Bits license

MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

### Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**

### No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Continuous app surface

`app-surface.css` removes the outer main/report shell borders and rounded edges
across Home, Attendance and Marks. The existing floral art fades into the common
dark background instead of ending at a hard clip. Header content and report title
alignment are preserved. Course-level separators remain useful within lists;
the bottom navigation retains its separate fixed, floating surface.

`menu-control.css` isolates the options summary from the generic disclosure-grid
styles. The plus sits at the center of its 44px target with no fill or box shadow.
