# Anon centered login v7

Scratch-only visual prototype derived from `/tmp/classpro-login-native-v6`.
Run `npm run dev` here for http://127.0.0.1:8181/login/. Vite base is `/login/`.
The parent owns integrated preview builds, shared navigation, and browser QA.
Dependencies reuse the existing v6 node_modules; public assets are separate copies.

## Interaction

Compact email + Continue → both passwords expand in the same centered
FamilySurface → compact Signing in… → Preview complete, no credentials sent →
Open home preview (`/home/`). Email validation is native `required type=email`;
it does not verify an account or domain. A valid email submit opens the password
stage directly, with no artificial Continuing state or timer and no bottom drawer.

The password stage firmly asks for both Academia and Student Portal passwords
to use the complete app. Both fields are required. Custom submit validation
shows a separate inline message for each empty field, sets its `aria-invalid`
and `aria-describedby`, and focuses the first missing password. Updating a
password clears only that field's error. Passwords are tested against the empty
string, so literal whitespace is preserved and accepted. Inputs are never trimmed,
normalized, serialized, logged, stored, or sent. Both password reveal controls
are independent. Values and the remember checkbox persist only in React memory
until reload; “Remember for 7 days” is a non-persistent preview control.
Change returns to email. Signing can
be cancelled back to passwords. Its settled demo hold is 900ms, with
state/unmount timer cleanup. No backend, fetch, XHR, analytics, or API exists.

## Actual component provenance and changes

This surface is adapted from [Rare UI](https://rareui.com)'s FamilyDrawer,
copyright (c) 2026 Swami Malode. The source/commit reference is preserved in
`provenance/SOURCE-v6.txt`, with the exact v6 source in
`provenance/family-drawer-v6.tsx`. Retained license is `LICENSE-Rare-UI.txt`.
Its attribution clause explicitly permits a README link; none is placed in UI.

`family-surface.tsx` retains the real component's `react-use-measure` bounds,
previous-height/delta timing idea, Motion height animation, and keyed
AnimatePresence content replacement. This is an adaptation, not an unchanged
Rare UI component or a new CSS card presented as one.

Changes: remove Vaul Root/Portal/Overlay/Content, open/close trigger, drag,
bottom anchoring, handle, close icon, wallet demo views, and scale transforms.
The in-page surface is flex-centered in the visual viewport. AnimatePresence
uses wait mode: outgoing content fades and becomes inert before resizing;
the next view is measured while hidden, and fades in only after the shell
reaches its destination. Text, artwork and controls are not scaled. Resizing
retargets/cancels Motion controls, and stale completions are ignored.

Reduced motion uses zero geometric/fade duration and a static dotted status
indicator. Focus moves only after the new content is fully visible. Initial
email avoids autofocus; later steps, cancel, and change restore useful
focus. Status updates are polite; all action targets are at least 44px.

## Geometry and small screens

All states share exact viewport center, including during morphs. On short
screens, the surface height is capped and its contents scroll; focus uses
preventScroll. VisualViewport resize/offset updates handle keyboard viewport
changes and are cleaned up. Under 580px height, symmetric 56px clearances
keep the logo clear. Under 800px the decorative greeting is omitted rather
than overlapped or backed by a scrim. The original floral SVG remains visible.
On-device IME/browser chrome behavior and integrated viewport/reachability
checks remain with the parent's browser QA.

## Assets and verification

Logo, Inter font, and both floral backgrounds use root URLs under
`/assets/{filename}`. The shared preview owns that asset directory; the
standalone Vite command needs the same root asset mount for full artwork.
The copied `public/` originals and component provenance remain intact.

TSX, CSS, and Vite config syntax checks pass with the installed esbuild, and
all four shared asset files exist. A no-emit TypeScript check cannot pass with
the copied dependencies: `@types/react` and `@types/react-dom` are missing,
and the unchanged `family-surface.tsx` reports a JSX `key` type error.
No build or browser automation was run here.

Parent QA should cover native email validation, empty/one/both
passwords, per-field error announcements and focus, literal whitespace,
independent reveals, Change, signing cancellation, reduced motion, short
viewports, root assets, `/home/`, and zero credential storage/network activity.
