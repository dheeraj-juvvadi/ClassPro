# Anon implementation backlog

Updated September 19, 2026. Shipped items below are supported by release checks
and work-performed.md; remaining performance limits are listed explicitly.

## Current work
- [x] Verify expired-session cache clearing and offline cache behavior.
- [x] Measure repeated synthetic persistence/resource usage on Azure; distinguish this from real login capacity.
- [x] Desktop/mobile interaction, aligned home widgets and empty states verified in browser checks (320–1440px).
- [x] Deploy capacity/burst revision 2c44f56; update work-performed.md with live verification.
- [ ] Observe real mixed-load latency, upstream queue drain time and CPU credits; synthetic capacity results are in docs/azure-capacity.md.

## Requested readiness checklist
- [x] Custom 404 page.
- [x] Meta title on every public page and meaningful titles for app sections.
- [x] Meta description on every public page.
- [x] Primary CTA above the fold, verified at mobile breakpoints.
- [x] Favicon set; shared floral app mark and install icons deployed.
- [x] robots.txt, excluding private/API paths as appropriate.
- [x] sitemap.xml listing public pages only.
- [x] Open Graph image and sharing metadata.
- [x] Alt text audited; decorative artwork uses empty alt or aria-hidden. Build checks enforce HTML alt attributes.
- [x] Mobile breakpoints checked across login, reports, dialogs and public pages.
- [x] Sticky mobile CTA; returns to normal flow while typing or consent is open.
- [x] Sign-in/sync loading states checked, including queued, unchanged, partial and offline results.
- [x] Inline form errors and retry states checked for sign-in and issue reports.
- [x] Thank-you page confirms an accepted issue report; direct visits do not claim success.
- [x] Privacy policy reflects actual credentials, cookies, reports, analytics and persistence.
- [x] Terms describe the service without inventing operator details.
- [x] Cookie/consent behavior and consent withdrawal verified.
- [x] Vercel Analytics and Speed Insights installed with optional consent.
- [x] Image compression audit recorded in docs/asset-performance.md; SVG/WebP artwork and generated install icons.

## Next refinement work
- [x] WOFF2 font compression released as 9037e75; Azure succeeded and live CSS verified.
- [x] Date-based attendance projections reconcile refreshes, date rollover and sign-out; released as 73b66d2.
- [x] Removed invisible background texture paths in 35a17e1; six raster comparisons have zero pixel differences. Azure succeeded.
- [x] Calculator uses a lightweight calendar component, automatic date ranges and per-class/partial-hour controls; 7a3a6fa deployed.
- [x] Calendar, Settings and Schedule have full-page navigation. Calendar illustration/subtitle removed as requested.
- [x] Optional schedule periods feed next-class/today widgets, reminders and projections; browser persistence verified.
- [x] Static dinosaur empty state replaces confetti.
- [x] Sync avoids the 15–30-second completion delay at low load and retains bounded queue behavior; Azure run 35417582940 succeeded.
- [x] Range dates toggle individually; bc78097 deployed.
- [x] Inline marks slider/grade targets replace the popup; bc5ce9d deployed.
- [x] Full timetable and optional-period choices reopen from browser cache offline.
- [ ] Verify motion, scrolling and battery behavior on a physical phone.
- [ ] Measure real SRM login/sync bursts with controlled accounts; retain resource headroom.

## Maintenance audit, September 19
- [x] Sharp/Python security updates released in 060877e; local image/OCR checks and production Docker tests pass.
- [x] Path-aware Azure checks, Vercel ignored builds, current pinned GitHub actions and artifact ignores released.
- [ ] Verify the first documentation-only push skips unnecessary production work.
- [ ] Review production client-error summaries; daily collection exists, review is not automated diagnosis.
- [ ] Decide whether to retain or retire the inactive Go/Appwrite adapters. Local Go tests pass; they are not the production backend.
- [ ] Remove unused public concept/legacy assets from deployment after checking references and rollout needs.
- [ ] Credential architecture follow-up only if requested: Ratio-D inspection is complete in docs/ratio-browser-credentials.md; Anon still uses server-side remembered sessions.

Do not present unchecked items as shipped. Public/legal copy must describe the actual service without inventing operator details or promises. Analytics, credentials and reports must not enter public metadata or the sitemap.
