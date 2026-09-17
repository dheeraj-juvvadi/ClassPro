# Anon implementation backlog

Updated September 17, 2026. User requested this checklist while directing continued work on the current session/cache and Azure checks.

## Current work
- [x] Verify expired-session cache clearing and offline cache behavior.
- [x] Measure repeated synthetic persistence/resource usage on Azure; distinguish this from real login capacity.
- [ ] Complete desktop/mobile interaction and empty-state verification.
- [ ] Deploy subsequent verified fixes and keep work-performed.md current.

## Requested readiness checklist
- [ ] Custom 404 page.
- [ ] Meta title on every public page and meaningful titles for app sections.
- [ ] Meta description on every public page.
- [ ] Primary CTA above the fold, verified at mobile breakpoints.
- [x] Favicon set; shared floral app mark and install icons deployed.
- [ ] robots.txt, excluding private/API paths as appropriate.
- [ ] sitemap.xml listing public pages only.
- [ ] Open Graph image and sharing metadata.
- [ ] Audit alt text on every image; decorative artwork uses empty alt or aria-hidden.
- [ ] Mobile breakpoint audit across login, reports, dialogs and public pages.
- [ ] Sticky mobile CTA where useful, without obscuring form fields or navigation.
- [ ] Loading-state audit; existing sign-in/sync states need full verification.
- [ ] Form-error audit; shared sign-in errors are inline, more edge cases pending.
- [ ] Thank-you page tied to an actual completed action.
- [ ] Privacy policy based on actual credential, report, analytics and persistence behavior.
- [ ] Terms and conditions aligned with the service and operator details.
- [ ] Cookie/consent behavior based on actual storage and analytics behavior.
- [x] Vercel Analytics and Speed Insights installed; consent behavior still to review.
- [ ] Image compression audit; new logo/favicons are SVG and generated PNG, large artwork still to inspect.

Do not present unchecked items as shipped. Public/legal copy must describe the actual service without inventing operator details or promises. Analytics, credentials and reports must not enter public metadata or the sitemap.
