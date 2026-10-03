# Anon attendance: margin first (v7)

Isolated React/Vite UI mockup with synthetic records and no university connection. Run `npm run dev`, then open `http://127.0.0.1:8183/attendance/`. Vite uses `/attendance/` as its base. Source artwork/font URLs remain `/assets/...`; the preview's copies live in `public/assets`. This workspace currently reuses a temporary dependency directory.

## Reading the screen

The approved charcoal/sage, Inter and floral styling is retained. Compact rows use a remaining-space title column and a content-sized margin column pinned to the far right. Recovery hours have a red minus sign (for example, `−5h`); other values indicate hours that can be missed while staying at or above 75%, or zero hours to spare. The attended/held baseline sits below the title, followed by the subtle target rail.

The signed green/red change sits beside the attendance percentage and measures percentage points (`pp`) since the previous synthetic sync. The percentage and its change stay together when the baseline wraps on narrow screens, including the intended 320px layout. Missing history has no fabricated delta; missing attendance has no fabricated percentage or margin.

The hour-based Leave/Attend planner is isolated and never alters records. Recovery assumes every upcoming hour is attended; hours that can be missed are rounded down. OD impact remains unknown because these fixtures have no verified OD policy. This preview does not replace the date-range planner, calendar rules or historical OD behavior.

## Navigation and access

The bottom navigation uses real `/home/`, `/attendance/` and `/marks/` links, with Attendance marked as the current page. The existing native about dialog exposes `/schedule/`, `/calendar/` and `/settings/` links. Sibling routes are provided by the parent's shared preview host. Links and controls retain visible keyboard focus; navigation, dialog links and planner controls have at least 44px targets. Reduced motion and bottom safe-area spacing are retained.

## Sources

Actual mdxcn GraphBullet plus GraphFrame/GraphMotion, pinned at `2928126ba146ebbae9c2351deca27d27bb40e744`. MIT copyright Keshav Bagaade; license retained in `LICENSE.mdxcn`, with provenance in `source-manifest.json`. Upstream component source and artwork are unchanged; the external style layer adapts the source-rendered ticks into continuous target rails and applies Anon typography/layout.

## Validation for this change

TypeScript/TSX syntax checks passed for the app, planner, attendance data and Vite config. CSS parsing and static checks passed for right-aligned margins, an unbroken percentage/change pair, six navigation destinations, root asset references, focus styles and reduced motion. Data checks passed for 20,300 integer-hour margin/recovery cases and 192 Leave/Attend projections, including missing history, a one-hour recovery and unknown OD.

Builds, shared navigation integration and browser QA belong to the parent; they were not rerun in this pass. Final 320/390/430px rendering and native dialog keyboard/focus behavior require the parent's verification after these changes. No production files or commits were made.
