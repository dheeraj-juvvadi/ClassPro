# Anon marks: inline assessment groups

Isolated React/Vite mockup v7, scoped to `design-preview/marks`. No production files or API calls. Run `npm run dev` for port 8182 and open `/marks/`. Vite uses base `/marks/`; existing artwork and font references remain `/assets/`. Dependencies/assets reuse the preceding temporary studies; this is not a standalone distributable package. The parent workspace handles builds, shared navigation integration and browser QA.

## Design

All named assessments remain visible below each course as natural-width inline label/score pairs. Labels are 13px, scores 17px and maxima 13px. Ordinary pairs have a 32px minimum height, a 6px internal gap and an 18px gap between pairs, with no assessment backgrounds or borders. Groups wrap as space requires; long and unbroken labels wrap inside their pair while the score stays together. There are no fixed column counts or fixed item heights. Course headings and released totals retain their hierarchy. No selectors, plus controls, accordions or aggregate score across incomparable courses.

Totals include only released scores and their corresponding maxima. Pending is not zero. Synthetic fixtures cover variable labels, lab assessments, zero scores and pending assessments. Grade planning is outside this specific visual study, not a removed production feature.

Bottom navigation uses real `/home/`, `/attendance/` and `/marks/` links. Activating the current page scrolls to the top; modified clicks retain normal link behavior. The existing native info dialog provides understated `/schedule/`, `/calendar/` and `/settings/` links with a brief sample-data disclaimer. Interactive controls are at least 44px; focus outlines, native dialog keyboard behavior, safe-area spacing and reduced-motion support remain in place.

## Source

Actual mdxcn GraphSpec and GraphFrame at commit `2928126ba146ebbae9c2351deca27d27bb40e744`; MIT copyright Keshav Bagaade, notice retained in LICENSE.mdxcn. Source provenance/hashes in source-manifest.json preserve the inherited v6 source record. GraphSpec value type is widened to ReactNode to render accessible score parts. The renderer produces the semantic definition-list rows. Frame, responsive inline grouping, typography and navigation are styled externally. Upstream source copies, fixture data, provenance manifest and original Anon asset files are unchanged. The dialog license link resolves within `/marks/`.

## Checks

Run `npm run typecheck` locally. Browser QA and builds belong to the parent workspace. This copied folder has no `verify.cjs` or `verification.json`; its inherited `npm test` script does not establish validation for this revision.

Parent QA should cover all 15 assessments, released totals, pending versus zero, 320–1440px widths, `?stress=1` long/unbroken labels, enlarged text, native dialog focus/Escape, route links, current-page scrolling and reduced motion. Current targets are 16–18px assessment scores (implemented at 17px), 13px labels and 44px interactive controls; obsolete block-height and fixed-column assertions no longer apply.
