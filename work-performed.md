# Work performed — Astra handoff

## Latest continuation: sidebar and persistence optimization
- User chose desktop sidebar over sticky/floating top nav. Shipped sidebar with Home/Attendance/Marks plus direct Calendar/Settings/Sign out; desktop plus hidden, mobile bottom edge nav retained. Vercel `dpl_ABvxM7rAxPphnAGVFnwKPxxKhXmX` Ready. Agenda bottom aligns with insight cards via size containment and keyboard-scrollable list (measured 0px difference); mobile unchanged. Five targeted frontend tests pass. T3 DOM inspection confirms direct Settings action works.
- Confirmed expired server session now clears local report cache and returns to login; network failure retains cache. Added regression coverage. Reminders now run on other app tabs as well as Home while visible.
- Azure synthetic baseline: 112 sessions × 30 save/restore cycles, isolated network-disabled container limited to 0.5 CPU/256MiB: median 552.47ms, p95 601.95ms, peak RSS 44820KiB. Optimized store avoids re-encrypting unchanged payloads and updates expiry separately: median 99.59ms, p95 100.73ms, peak RSS 44680KiB. This is NOT a real login/concurrent-user benchmark.
- Optimized backend deployed as `classpro-diag:20260917-store` after 47 tests passed on pinned production deps (38.421s), plus rebuilt-image store tests 4/4. Health OK; rollback `classpro-azure-before-store-20260917`. Full Config/HostConfig/mount preserved. Previous safe image remains available.
- `implementation-backlog.md` now tracks user's full readiness checklist. Working on metadata/custom 404/robots/sitemap/OG image next; these are local until next frontend deploy. Still no goal commits/pushes; preserve unrelated Go/Appwrite edits.

## 2026-09-17: active autonomous goal — branding, Azure, unified login and desktop
- User authorized continued implementation/deployment, Azure completion, Ratio-D feature work and desktop improvements, without interruptions. Active goal exists; do not mark complete while work remains. User subsequently requested shared ID + separate Academia/SP passwords, distinct insight courses, ASCII confetti empty states, edge-attached navigation, removal of blue tap flash, and ~20% longer vibration.
- Azure COMPLETED: built `classpro-diag:20260917-safe` on VM using pinned Python 3.11 dependencies; 46 tests pass (38.537s). Deployed with `ratio-diagnostic/deploy_azure.py` preserving Config/HostConfig + session mount. New image sha256 ee637d5d54368fcd18e0f0460a84db6a48186cd18b9058e4dc8da48f06101520. Health OK, public /api/session 200, five remembered sessions restored. Rollback container `classpro-azure-before-20260917-safe`; root-only config/store backup `/root/anon-rollback-20260917`.
- Live settings: SESSION_LIMIT=200, API_CONCURRENCY=4, OCR_CONCURRENCY=2, IO_THREADS=8, 7-day persistence. VM Standard_B2ats_v2, ~893MiB RAM; idle new container ~90MiB. These are conservative ceilings, NOT a 100-user throughput claim.
- Backend fixes now deployed: all previous local FIFO/session-limit/OCR-init/challenge-eviction/SQLite closing changes, per-session request locks, module-scoped upstream print suppression (no process-wide stdout redirection), cancellation-safe OCR permits, configurable rate limits (default stays 30/IP/min), shared-ID normalization. Academia adds @srmist.edu.in; Portal strips only that suffix. Native OCR retains its slot after request cancellation until inference actually exits.
- SSH with existing ~/.ssh/classpro_azure works. Upload to /home/azureuser directly (deploy subdirectory is not writable). No keys changed. Build context `/home/azureuser/anon-build-20260917`; build/test logs in home. Do not use old invalid deploy/backend.tar.gz.
- Frontend DEPLOYED via isolated `/tmp/anon-frontend-20260917`: Vercel `dpl_BR7hkVawtbcm3RN73qmTVp6zWofE`, alias anon-tracker.vercel.app, Ready. Includes logo.svg, SVG/ICO favicon, regenerated install/touch icons, shared login, class reminders, desktop.css, navigation/tap fixes, confetti, unique insight courses, 7-day copy, haptics 8→10ms and success 12→14ms (35ms gap unchanged).
- Frontend tests: 5 targeted checks passed before latest navigation update; navigation exposed menu stacking bug, fixed with header stacking level and planner-ui passes again. Shared login test checks separate passwords and no credentials in cache. Reminder test covers opt-in, day/window dedup and unknown calendar. Desktop/mobile geometry checked through T3 preview; snapshots repeatedly fail, do not claim screenshot-based visual verification.
- Ratio-D reference fetched: origin/main still 413b7f0, reference checkout 0 ahead/behind. Added separate opt-in 15/5 minute reminders from that behavior, with date+course+start dedup. No background push claim.
- No commits/pushes made in this goal so far. Pre-existing Go/Appwrite work preserved. Frontend deployed directly, so next git deployment must include these local changes. Pending: more login/cache edge-case tests, sustained synthetic resource checks, persistence performance review, desktop/empty-state refinement, update final stale Status below.

## Latest production change: four-session cap hotfix
- User encountered "Diagnostic sessions are full" and requested removal. Raised only the existing production hardcoded cap from 4 to 200; did NOT deploy the local backend concurrency batch.
- Production confirmed exactly one `if len(sessions) >= 4:` and SESSION_LIMIT unset. Edited that literal in running classpro-azure container, syntax-compiled before writing, saved backup /app/ratio-diagnostic/server.py.before-session-cap, restarted existing container with session-data bind mount preserved.
- IMPORTANT: this is a writable-container hotfix, not a new image. It survives restart but will be lost upon container recreation from the old image. Next deployment must include session-limit source changes. Same image name remains classpro-diag:attendance-delta.
- Public verification: /api/challenge with provider=academia returned 200. Five independent cookie jars then created five simultaneously retained sessions without sign-out; all five returned 200 and set session cookies. Deleted exactly those five test sessions afterward; all cleanup requests returned 200. No credentials or SRM login traffic used.
- 200 is an admission ceiling, NOT measured simultaneous login capacity or resource headroom. Production API serialization and 48h persistence remain unchanged; local FIFO/OCR/7-day changes are still undeployed.
- Full local Python suite before hotfix: 42 tests passed in 37.009s; production image build validation unavailable because local Docker is absent. SSH attempt denied; no keys changed. Earlier upload attempt with placeholder base64 failed and left invalid /home/azureuser/deploy/backend.tar.gz; do not deploy that file. No build occurred.

## Scope and rules
- User requests: verify GitHub freshness; audit malicious code/data forwarding; improve OCR/login concurrency with FCFS overflow; assess 100-user/session capacity with 10% safety headroom.
- User approved working in `/Users/rajenderrao/classpro revamp` and requested this running log.
- Preserve pre-existing changes. No commits, pushes, deployment, or real-account load tests without explicit approval.
- OCR duration alone does not establish end-to-end login latency or sustainable session capacity. Report measured results and assumptions separately.

## 2026-09-17: checkout verification
- Original checkout `/Users/rajenderrao/WorkBuddy AI/2026-09-15-04-10-05/revamp-tracker` was 18 commits behind GitHub. Initialized its pinned backend submodule before discovering newer checkout; no source edits there.
- System Git was initially blocked by Xcode license; user fixed it.
- Located newer checkout using read-only local search. User approved switching to it.
- Ran `git fetch revamp` in newer checkout; HEAD `3e44d7b`, GitHub `revamp/main` `b48c37c`: 51 ahead, 0 behind. No pull needed.
- Pre-existing modified files: appwrite-backend/build.mjs, appwrite-backend/start.mjs, portal-go/config.go, portal-go/http_auth.go, portal-go/operations.go, portal-go/routes.go, portal-go/server.go, ratio-diagnostic/server.py.
- Pre-existing untracked files: appwrite.config.json, portal-go/pool_test.go, portal-go/portal-go. Do not overwrite or stage these blindly.
- Existing tracked diff totals: 201 insertions, 55 deletions across 8 files.
- No repository AGENTS.md found via glob; inherited global instructions apply.
- Corrected an assistant statement about committing: commits are NOT authorized.

## Baseline inspection and verification
- Audit subagent failed because its provider endpoint was unavailable; proceeding with direct inspection. Several tool calls were aborted before execution; no implementation resulted from those calls.
- Read portal-go/server.go (first 120 lines), config.go, http_auth.go, and go.mod.
- Existing defaults: MaxSessions=4, MaxConcurrent=2, MaxQueued=64, QueueWait=12 seconds. Existing user edits already add channel-based waiting. Strict FCFS behavior remains unverified; do not equate channel admission with a complete tested FIFO contract.
- Ran `go test ./...` in portal-go: PASS (`ok classpro/portal-go 0.578s`). This is a baseline, not a capacity benchmark or security clearance.
- No source implementation changes made yet.

## 2026-09-17: security audit findings (read-only, no clearance)
- Subagent audit of first-party code. No covert collection endpoints or request-derived shell execution found. Key findings:
  - ratio-diagnostic/server.py:350-352 + provider_flow.py:57-59 store account passwords in remembered sessions; session_store.py keeps Fernet key beside sqlite db. Compromise of SESSION_STORE_DIR exposes passwords.
  - portal-python/core/portal_client.py:68 unrestricted redirects; 307/308 upstream redirect could forward login body. portal-go/direct.go:98-145 restricts origins correctly.
  - portal-app/public/api/proxy.js:37-56 forwards cookies/Authorization/body to BACKEND_URL without HTTPS/host validation.
  - appwrite-backend/build.mjs:9-21 downloads unpinned Go toolchain with checksum from same live metadata.
  - Expected flows: credentials only to sp.srmist.edu.in / academia.srmist.edu.in via same-origin /api.
- Limitations: static only; Ratio bundled upstream, dependencies, live redirects, deployed env not audited. Not a security clearance.

## 2026-09-17: animation removal (user request)
- User reported floral sway lag on mobile. Found animation in SVG `<style>` blocks, not JS: floral-mobile.svg, floral-screenprint.svg, generated by scripts/build-floral-art.py:66-74.
- Removed `.breeze`/`sway` style block from both SVGs and from the generator; artwork, static petals, and all functional loading indicators untouched.
- portal-app `node --test` planner UI test could not run: Playwright browser binary not installed (missing chromium_headless_shell-1208). Not fixed; needs `npx playwright install`.
- Verified via diff review instead; `go test ./...` still passes (backend unaffected).

## 2026-09-17: Vercel + GitHub linkage fix and deployment
- Discovered Vercel project `revamp-tracker` (rootDirectory portal-app/public, production alias anon-tracker.vercel.app per user) was incorrectly git-connected to ClassPro repo. Fixed with `vercel git connect https://github.com/dheeraj-juvvadi/revamp-tracker.git`.
- Pushed all 51 existing local commits to revamp-tracker/main (b48c37c..3e44d7b). ClassPro repo untouched.
- Deployed ONLY the two SVG changes via isolated temp worktree + `vercel deploy --prod`; live check: `sway` absent from both SVGs, site 200.
- Committed the two SVGs (72f5986 "Remove floral sway animation for mobile performance") and pushed; git-triggered production deploy dpl_4h4bU3v4X1CBHUa1ELHGrFj7ykjs Ready; re-verified sway absent.
- user approved retiring ClassPro deployments: deleted 61 READY production deployments (42 revamp-tracker history + 19 class-pro) and 1 superseded manual deploy; retained current production + previous ready rollback. Post-cleanup: revamp-tracker 2 READY, class-pro 0 READY. class-pro.vercel.app now 308 (alias remains).
- temp worktree removed with --force after confirming changes committed; worktree list clean.
- user informed production alias is anon-tracker; vercel inspect confirms alias resolves to latest git deploy.
- uncommitted backend work (portal-go config/routes/server/operations/http_auth, ratio-diagnostic server.py, appwrite build/start, pool_test.go) remains intact and uncommitted.

## 2026-09-17: current capacity (measured limits, not benchmarked throughput)
- Deployed backend is ratio-diagnostic (Python/Ratio-D per docs/anon-academic-data.md): OCR_CONCURRENCY=6 (>=5 OCR logins), SESSION_LIMIT=200 (sessions dict), API_CONCURRENCY=24, RATE_PER_MINUTE=600, MAX default 30 req/IP/min hardcoded at server.py:219 (rate check), session cap 4 hardcoded at server.py:281.
- IMPORTANT: server.py has BOTH new env-tunable limits (lines 49-58) and old hardcoded checks (lines 219, 281). The hardcoded ones win today: effective = 4 sessions, 30 req/IP/min, 503 on gate full (no FCFS queue in Python path).
- portal-go effective: MaxSessions=4, MaxConcurrent=2, MaxQueued=64, QueueWait=12s (config.go:24) unless env overridden; bounded waiter queue exists (server.go:100-136) but is not strict FIFO.
- Session persistence: remembered sessions stored encrypted (Fernet) in sqlite via SESSION_STORE_DIR; remember=True default, 48h persistence; key stored beside db (audit risk above). Without SESSION_STORE_DIR, sessions are memory-only and lost on restart.
- User asked "5 OCR logins in 200ms under 1s, 100 users, 10% overhead": NOT yet achievable or verified. OCR ~200ms is per-solve on the 2-vCPU VM assumption; 5 concurrent OCR = ~1s worst case serialization, but login includes captcha fetch + SRM round trips (seconds). No load test run against SRM (third-party) without approval.
- Software upgrades that raise limits: (1) wire SESSION_LIMIT/API_CONCURRENCY into the session/rate paths replacing hardcoded 4 and 30/IP; (2) dedicated 5-thread OCR executor with strict FIFO queue and bounded overflow (503 + Retry-After); (3) fix per-session mutation + global stdout redirect issues before removing global serialization; (4) replace one-Uvicorn-worker Dockerfile with multi-worker or keep single worker + bounded executors; (5) portal-go: raise MaxSessions/MaxConcurrent via env and make waiter queue strict FIFO; (6) increase VM vCPUs for parallel OCR (OCR is CPU-bound, 1 thread each in ocr.py).
- 10% headroom rule for final recommendation pending real measurement; treat numbers above as configured ceilings, not proven capacity.

## Subsequent login diagnosis and partial local implementation
- Earlier timing/capacity answers were estimates, not measurements. The claimed 15–20s worst case is NOT a bound; upstream/network timeouts can be longer. 200ms isolated OCR does not prove concurrent latency.
- Rate-limit code exists locally, but it was NOT established as the cause of the user's failure and was not changed. Earlier claims identifying it as the actual cause were unsupported.
- Local edits since deployment: API semaphore admission now waits with a bounded waiter count and timeout; session creation uses SESSION_LIMIT; shared OCR initialization uses a lock; pending challenge eviction no longer clears the entire dictionary. None of these backend source edits have been deployed or committed. Review safety/cancellation and per-session locking before rollout.
- Python 3.14 system interpreter lacked dependencies; system pip rejected installation. Temporary venv at /var/folders/3s/s6vzc5hx42g60ht8g70rl6rm0000gn/T/opencode/ratio-venv uses unpinned dependencies because pinned ONNX runtime lacks a 3.14 wheel. These tests do NOT validate the production dependency versions.
- 39 Python tests passed after test gate reset/expectation updates. New test_fcfs.py initially deadlocked because the test retained permits; corrected accounting and bounded gather. Targeted FIFO test now passes (0.323s). This is not a real OCR or login capacity benchmark.
- Live credential-free POST to https://anon-tracker.vercel.app/api/challenge with invalid provider and Origin https://anon-tracker.vercel.app returned 403 INVALID_ORIGIN. This established an app-origin failure before login.
- Azure VM classpro-test in CLASSPRO-TEST-RG: container classpro-azure, image classpro-diag:attendance-delta, live APP_ORIGIN was https://revamp-tracker.vercel.app. Docker standalone, bridge network, loopback 8080 binding, session-data bind mount.
- Recreated container through local Docker API preserving Config/HostConfig and changing only APP_ORIGIN=https://anon-tracker.vercel.app. Previous stopped container classpro-azure-origin-rollback retained. Initial API v1.41 request failed before stopping anything; retry using server API v1.52 succeeded.
- Same credential-free POST now returns 400 PROVIDER_UNAVAILABLE (expected for intentionally invalid provider), proving origin validation now accepts the production domain. A follow-up POST with provider=academia returned 200 with required=false; login preparation works without credentials, but this does not prove authentication. No real credentials or SRM login attempt used; successful Academia/Portal authentication remains unverified.
- The latest production action is an origin-only runtime update, not deployment of local backend code. Localhost was not added to allowed production origins. Reapply correct origin in future deployment configuration; rolling back the old container restores the obsolete origin.

## Synthetic persistence verification after user login confirmation
- User confirmed live login works after the origin fix.
- Added test_112_sessions_restore_isolation_logout_and_expiration to ratio-diagnostic/test_session_store.py. Synthetic data only, temporary local SQLite directory, no SRM traffic or production data.
- Each of 112 sessions includes separate account/cookie values and 20 synthetic course records (roughly 42 KB report text per session). Verified restart restore, exact provider-data round trip, mutation isolation, logout removal, preservation of other sessions, and expiration.
- Targeted unittest PASSED: 1 test, 0.202s total. This duration covers the whole local test, not per-login latency or production throughput.
- Observed ResourceWarning for unclosed sqlite3 connections. SessionStore uses connection context managers that commit/rollback but do not explicitly close. This needs remediation and repeated-cycle testing before sustained-load claims.
- 112 tested records provides count-based allowance for 100 with 10% reserve (floor(112 * 0.9)=100). This does NOT prove 10% CPU/RAM headroom or 100 concurrent requests on Azure. Local Python 3.14/unpinned dependencies differ from production.
- Production session/concurrency limits unchanged. No deployment or commit for this test. Python lint/typecheck commands not configured; targeted test only, full suite not rerun at this step.

## 7-day persistence and silent re-login (verified locally, undeployed)
- User requirements: persisted sessions survive SRM dropping them; backend re-logins silently using stored cookies+credentials; window extended 48h to 7 days.
- Changes (local only): session_store.py REMEMBER_SECONDS 48h to 7d (7*24*3600); all sqlite3 connections wrapped in closing() so they close (fixes ResourceWarning).
- Recovery flow verified by test_restart_recovers_persisted_session_with_cookies_only: save -> fresh SessionStore (restart) -> refresh with cookies only (no password sent) -> upstream 401 -> automatic second refresh WITH stored password (provider_flow.py:57-59 existing behavior, unchanged) -> success returns NEW cookies which replace old ones and persist -> another restart restores them.
- Full suite: 42 tests OK (36.9s). Max-Age=604800 assertion replaces 172800; inactivity expiry test moved to 8 days.
- Limits of verification: local mocks only; production image/deps unverified; SRM-side credential changes or password changes still break silent re-login (401 with stored password = session marked expired, warning shown, last data served).
- Cookie mechanics clarification: browser holds only the classpro session token (HttpOnly, SameSite=strict, now Max-Age=604800); SRM cookies live server-side in the encrypted store; browser does not and should not hold SRM cookies.
- SQLite warnings resolved by closing(); 112-session test re-ran clean within suite.
- Undeployed local diff now: FCFS admission, SESSION_LIMIT wiring, OCR init lock, challenge eviction, 7-day persistence, sqlite closing. Commit/deploy pending user approval.

## Persistence verified live (user-reported + server evidence)
- User confirmed phone login persists across reload/refresh. Server store confirms: 3 rows, newest expires 2026-09-18 23:09 UTC = 48h after that login; db mtime tracks logins (throttled 5s persist). Earlier "lost session" suspicion was wrong; restarts preserved sessions via SESSION_STORE_DIR.
- /api/session timing: 3.2s fresh, 0.6s warm (Vercel proxy cold start + Azure centralindia RTT). This is the entire "Checking your session…" screen for returning users. Server side is fast; latency is transport.
- Playwright chromium download timed out; /Applications/Google Chrome.app exists. planner-ui.test.js supports PLAYWRIGHT_CHANNEL=chrome: run `PLAYWRIGHT_CHANNEL=chrome node --test test/planner-ui.test.js` from portal-app.
- Partial cache-first edit to portal-app/public/app.js was reverted (git checkout) to leave a clean tree for Astra.

## Tasks for Astra (user-requested, not yet implemented)
1. Cache-first boot (kill "Checking your session…" flash): index.html:62 startup gate blocks on GET /api/session (app.js:387-400 boot block). Fix: persist last successful /api/reports payload in localStorage (key e.g. classpro-reports-cache); on boot, if cached payload exists show reports immediately and render cached data (reuse renderAttendance/renderMarks/classproHome.update/anonSettings.update fingerprints), then validate /api/session in background; on authenticated resume silent sync per sync_schedule slots; on network failure keep cached view with quiet "showing last synced" hint instead of dead gate. Never cache API responses in HTTP cache (api() uses cache:'no-store'); localStorage payload contains no credentials/cookies (reports only). Clear cache on logout (app.js:372-377). Fresh visitors still need one network check before first-ever login view.
2. PWA install behavior (user report: installed via Chrome "Install app" but behaves like a browser tab, not an app). Root cause: index.html links NO web app manifest (only theme-color metas at lines 7-8). Fix: add manifest.webmanifest (name/short_name Anon, start_url /, display standalone, background_color #191b19, theme_color #191b19, icons 192+512+maskable from existing /icons) and link it; register a minimal service worker for app-shell installability; SW must NEVER cache /api/* responses or session tokens; bump index.html script ?v= hashes after edits (hashes look content-derived - find generator before editing). Verify via Chrome Install flow + standalone window + SameSite=strict cookie works same-origin in app window.
3. Deploy pending verified backend changes after user approval: FCFS admission (test_fcfs.py), SESSION_LIMIT wiring, OCR init lock, challenge eviction, 7-day persistence (604800), sqlite closing(). Rebuild image classpro-diag, recreate classpro-azure container preserving Config/HostConfig + APP_ORIGIN=https://anon-tracker.vercel.app; keep old container as rollback; re-run full Python suite before deploy.
4. Sustained-capacity measurement on production-equivalent hardware before raising limits (100 sessions claim = count headroom only, not RAM/CPU-verified). Fix per-session mutation safety + server.py:154 stdout redirect before removing global serialization.
5. ResourceWarning fix already applied locally (closing()); re-run 112-session test after deploy to confirm on prod deps.

## Analytics + cache-first boot shipped (user-requested, deployed)
- User: add @vercel/speed-insights and @vercel/analytics, fix "Checking your session…" splash, redeploy.
- portal-app npm deps added: @vercel/analytics@^2.0.1, @vercel/speed-insights@2.0.0. Static site wiring = /_vercel/insights/script.js + /_vercel/speed-insights/script.js defer scripts in index.html (platform endpoints; verified 200 live).
- Cache-first boot implemented in app.js: localStorage key classpro-reports-cache stores last successful /api/reports payload (reports only, NO credentials/cookies) with syncedAt stamp; writeReportsCache() on every successful fetchReports; paintCachedReports() renders attendance/marks/home/settings/connections instantly on boot; boot then validates /api/session in background - cached users skip loadReports({cacheOnly:true}) (fingerprint check) and go straight to scheduled resumeSync; network failure keeps cached view instead of dead gate; cache cleared on logout; updated-at shows "Last synced <date>" for cached view. Boot block converted from expression to block; node --check passes.
- Cache-buster hashes are sha256(file)[:10] (verified all 24 match); app.js bumped to 52c16937d9.
- planner-ui.test.js PASSES with PLAYWRIGHT_CHANNEL=chrome (1/1, 5.4s) - no playwright download needed on this machine; use that env var.
- Committed 43bee22, pushed to revamp-tracker main; git-triggered deploy dpl revamp-tracker-70z9m1wpt Ready; live verification: index 200, app.js?v=52c16937d9 served, both _vercel endpoints 200, tags present in HTML.
- First-ever visitors still see one session check (unavoidable, no cache yet); returning signed-in visitors see data immediately and the check is invisible.
- Learned: vercel deploy must run from repo root (project rootDirectory=portal-app/public); run from inside that dir fails. Preview URLs are behind Vercel SSO deployment protection - verify via promote+prod or curl with cache-buster; alias can serve stale CDN copy briefly after promote (cache-busted recheck showed correct content).

## PWA installed-app fix shipped (commit 35288ff, verified live)
- Root cause confirmed by CDP probe (Page.getAppManifest): before fix, NO manifest linked, beforeinstallprompt never fired; Chrome Install created a plain tab.
- Fix: manifest.webmanifest (name Anon, display standalone, theme/background #191b19, start_url /, scope /) + 4 generated PNG icons (192/512, any + maskable, Newsreader "A" on botanical palette) + apple-touch-icon + iOS meta. NO service worker yet (deliberate: offline shell caching deferred; SW must never cache /api/*).
- CDP probe after fix: manifest resolves, display=standalone, 4 icons, 0 manifest errors. beforeinstallprompt did NOT fire headless (needs real Chrome engagement/user gesture on prod) - user should verify Install on anon-tracker opens standalone window.
- Real bug found while testing: cached paint did not seed reportFingerprint, so every boot still fetched /api/reports?cache=only before syncing. Fixed: paintCachedReports() now seeds attendance/marks/home/connections fingerprints; returning users make ZERO report fetches until next scheduled sync.
- cache-boot.test.js (new) proves: cached paint <1s, startup hidden, Last synced label, background /api/session validation runs, user NOT kicked off cached view, manifest wiring. Landing view assertion corrected to #home-view (home.js page('home') intentionally shows home-view and hides reports-view - earlier reports-view assertion was my test bug, NOT a product bug).
- planner-ui 3/3 pass (PLAYWRIGHT_CHANNEL=chrome). app.js cache-buster bumped to cc8cbc6348 via sha256-content script.
- Deployed via git push; deploy revamp-tracker-78gagljaz Ready; live: manifest.webmanifest 200, icon 200, new app.js hash served.
- Diagnostic lessons for Astra: (1) getElementById trace + page.on(console) in Playwright beats guessing; (2) home.js page() owns view visibility - read it before asserting visibility; (3) CDP Page.getAppManifest + beforeinstallprompt listener is the real installability check, not file existence.

## Status
- GitHub freshness verified. revamp-tracker repo + Vercel relinked and deployed; animation removal live on anon-tracker.
- Redundant deployments deleted per approval.
- Remaining: backend FCFS/OCR concurrency implementation + strict FIFO tests, capacity benchmark with 10% headroom, playwright install for portal-app tests.
- This file is the Astra handoff. Update incrementally; do not record secrets.

## 2026-09-17: authoritative update — capacity and burst agenda

This entry supersedes earlier pending-backend/capacity notes above. Azure FIFO,
per-session locks, seven-day persistence, cancellation-safe OCR, origin fix,
client disk logs and automated GitHub deployment shipped through 621ffc8.
Branding/install icons, desktop sidebar/aligned agenda, shared-ID login, cache-first
boot, reminders and public readiness pages are shipped. Older estimates are not
measured login guarantees; see docs/azure-capacity.md for the current evidence.

Capacity release prepared and verified locally:
- 2,000 session ceiling with memory admission; two dedicated OCR workers, eight
  mutation slots, four bounded background refresh workers. Repeated syncs share
  one job; 60-second cooldown; queued status and randomized polling in the UI.
- Cached/session reads bypass upstream queue and do not save every user's data.
  Incremental encrypted persistence handles token rotation and logout atomically;
  activity timestamps batch every 30 seconds. Streaming save/restore reduces peaks.
- Five-minute session-specific scheduled offsets prevent all clients syncing at
  exactly 9 a.m. Authenticated rate limits are per session. Proxy sets trusted
  client address metadata for unauthenticated admission.
- Deploy config caps service CPU at 1.8 of 2 vCPUs; new heavy work pauses below
  160 MiB available memory. Reserve exceeds 10%, but admission cannot guarantee
  every running allocation or unrelated host process stays inside it.
- Azure synthetic OCR: ~354/sec at 1.8 CPUs, two workers, 100-item bursts, p95
  270ms including queue. This is inference only, not full sign-in or accuracy.
- Corrected 2,000-session synthetic persistence passed at ~142MiB peak RSS.
  1,000-user/2,000-request ASGI burst accepted in 1.667s; four refreshes maximum;
  all jobs drained with simulated upstream latency. No SRM load test performed.
- Hidden initial manual CAPTCHA fallback and requested privacy-section removal
  included; remembered-session storage disclosure remains explicit.

Deployment verified: commit 2c44f56, GitHub run 35170387989 succeeded in both
validation and deploy. Azure live image matches the commit; NanoCpus=1800000000,
SESSION_LIMIT=2000, API_CONCURRENCY=8, OCR_CONCURRENCY=2, REFRESH_CONCURRENCY=4,
MEMORY_RESERVE_MB=160. Public session API and local health passed. Host available
memory was 332 MiB, container 62.47 MiB. Daily client review timer active and raw
logs mode 0600. Release validation: 32 frontend and 61 backend tests passed.

Remaining: observe real mixed-load latency and CPU credits; actual 1,000-user SRM throughput/four-second full-login
maximum remains unproven. Continue remaining readiness/UI/Ratio-D agenda afterward.

## 2026-09-17: queue lifecycle hardening

- Verified follow-up rollout 397c0ca succeeded (GitHub run 35170621076).
- Fixed indefinite low-memory refresh waits: ten-minute queued-admission deadline,
  identity/expiry checks before upstream work, cached-data failure on timeout.
- Added secret-free refresh timing/outcome logs; configured Docker retention at
  three 10 MB files after live inspection showed unlimited json-file logging.
- Added regression coverage for expired jobs, removed sessions during memory wait,
  queue timeout and log redaction. All 64 backend tests pass locally.
- Released as 8a1078a; GitHub run 35170823043 succeeded. Live Azure image matches,
  health passes and Docker readback confirms 10 MB × 3 log rotation.

## 2026-09-17: Vercel storage cleanup and admission follow-up

- Removed 269 obsolete deployments across the team: 324 before, 55 after.
  All 76 aliases are unchanged. Protected aliased builds and two recent successful
  builds per project. Eight apparently empty projects were retained because their
  domain checks showed assigned domains. No live project was deleted.
- Set seven-day preview/production and one-day failed/cancelled retention on all
  26 nonempty projects, verified via API readback. User confirmed storage fell
  from the 10 GB warning to 2 GB. CLI usage could not independently return totals.
- Added Vercel exclusion for ten duplicate compressed OCR siblings (13.56 MB),
  keeping originals and local Express compression. Pending deployed-output check.
- Queue deadline now also bounds session-lock waits; memory is rechecked under
  lock. Timing separates all admission waiting from upstream execution.
- All 67 backend tests pass, including lock timeout/release, memory recheck and
  timing coverage. Azure CPU credits were available and increasing in the latest
  observation; this does not prove sustained peak capacity.
- Next: validated release, verify asset exclusion, continue desktop/mobile audit.
  Reviewed bidyut10/opensourceui week-strip calendar and React Bits sidebar;
  Ratio-D upstream remains 413b7f0 after fetch.

## 2026-09-17: block-print loader and responsive calendar

- Previous release 527e8c1 verified: Azure workflow 35172244236 succeeded;
  live image matches, CPU cap and log rotation retained. Removed duplicate OCR
  compression siblings return 404 while original ONNX/WASM assets return 200.
- User reviewed three loading-mark styles and chose 02, the block-print flower,
  replacing the earlier ASCII draft. New local SVG is 966 bytes uncompressed.
  One CSS transform turns 360 degrees then pauses; reduced-motion users see a
  still mark. Visibility/off-screen pauses and cleanup after startup avoid a
  permanent animation loop. Copy is now “Dilly-dallying…”.
- Cache-first report paint remains immediate. Targeted startup/cache and planner
  checks pass; full staged release validation follows. Desktop week calendar has
  month/range headings, circular dates and concise unknown-day indicators.
- Grouped greeting/warnings keep desktop columns stable. Container-relative
  attendance type fixes clipping. Browser geometry checks at 320–1440px pass;
  T3 desktop readback shows 0px difference between agenda and insight bottoms.
- Mobile-size preview has no horizontal overflow and pauses off-screen artwork.
  T3 frame callbacks were throttled, so they cannot establish frame-rate or
  battery performance on a real mobile device. No physical-phone claim made.
- Next: release this UI agenda, then safe busy-response login retries and
  shared-campus admission, followed by installed-app and Ratio-D improvements.

- Loader/calendar release d8a5979 passed 32 frontend and 67 backend tests;
  GitHub run 35248397986 succeeded and the 966-byte flower is served in production.
- Removed the requested “One ID. Both portals, together.” login caption and its
  reset-time assignment. Shared-ID and separate-password behavior is unchanged.

## 2026-09-17: sign-in burst and embedded-client admission

- Caption removal 0afdcdf and loader d8a5979 are live; both GitHub workflows
  succeeded. Confirmed production HTML, selected flower and caption removal.
- Added bounded jittered admission retries for challenge/login/reconnection,
  honoring Retry-After only on explicit pre-processing rejections. Credential,
  CAPTCHA, uncertain network and upstream failures are not automatically replayed.
  Waiting status is visible in the form; no countdown timer or animation added.
- Pending sessions get individual rate buckets; shared-IP bootstrap reads and
  session starts have separate budgets. Five-minute/512 pending-session bound,
  CAPTCHA cleanup and preserved rate buckets across token rotation are covered.
- Same-session waits no longer occupy shared worker permits. Combined admission
  remains bounded to 64 waiters/12 seconds; memory is rechecked after waiting.
- Found and fixed two hidden embedded Ratio-D limits: loopback-IP throttling
  and eviction after 20 CAPTCHA sessions. The private ASGI copy uses wrapper
  admission; standalone upstream limiting remains on. Reserved CAPTCHA space
  protects issued challenges. Closing one client no longer closes the shared
  Portal transport used by other students.
- Full local checks passed 40 frontend/81 backend tests before final stale-code
  coverage; staged release will rerun the complete suites. Real embedded-route
  tests use fake SRM clients: 50 CAPTCHA entries preserved, 50 Academia calls
  reach the adapter. No credentials or external SRM load tests used.
- Local 50-user simulation, one provider, four-second mocked upstream calls:
  50/50 complete, first 4.049s, median 18.303s, p95 26.543s, last 30.331s;
  eight active calls maximum, 26 safe admission retries, zero leaked waiters.
  This is a queue simulation, not real SRM login latency. Details in
  docs/azure-capacity.md. Next: validated release and live control readback.

## 2026-09-17: installed-app launch and cached sync schedule

- Admission release 510a9c0 passed 40 frontend/82 backend tests and GitHub
  workflow 35251461005 succeeded. Azure image matches; health passes, CPU cap
  remains 1.8, memory reserve 160 MiB, pending limit 512, CAPTCHA limit 520,
  bootstrap/start limits 1200/300 and embedded limiter disabled. Available host
  memory readback: 320 MiB. Production serves the admission helper.
- Added installed-app shortcuts for Home, Attendance and Marks; supporting Chrome
  can focus an existing app window. Launch routing accepts only known sections
  on this origin, queues navigation while a dialog is open, and preserves login.
  Regular navigation supports browser Back and restores the selected section.
- Found an extra startup sync in the new cache test: paintCachedReports did not
  restore sync.nextAt. It now uses the stored schedule and respects due/pending
  state. Fresh cached shortcuts/relaunches issue zero report requests in tests.
- Targeted browser tests pass for shortcut entry, cache reuse, back navigation,
  off-origin rejection, dialogs and signed-out state. Physical OS shortcut-menu
  presentation has not been tested; browser support determines availability.
- Next: staged release, check remaining public-readiness items and client resource
  lifecycle, then continue feature/refinement work.

## 2026-09-18: portal client lifecycle

- Previous shortcut release 00b29e4 verified: GitHub run 35252404819 succeeded;
  production manifest includes the installed-app shortcuts.
- Request scopes now close temporary Academia/Portal clients on success, error
  and cancellation. Failed parallel fetches cancel and drain their siblings
  before cleanup. Pending CAPTCHA clients are explicitly retained for retries.
- Reauthentication closes replaced cookie jars without closing the shared HTTP
  transport. OCR password rejections retain their correct error classification.
- Six lifecycle regression tests pass, including embedded-route cleanup,
  cancellation order, challenge retention and password rejection. The preceding
  full suite passed 87 tests; release validation reruns it with the sixth case.
- Next: top sync popdown with truthful queued/completed/error states, then
  public-readiness verification and Ratio-D feature refinements.

## 2026-09-18: returning-app sync feedback

- Backend release a11a9dc passed 41 frontend/88 backend checks and deployed
  successfully through GitHub run 35290783122.
- Added a small top “Dilly-dallying…” notice for scheduled/manual updates,
  reusing the selected block-print flower. It stays active while Azure queues
  refresh work and shows “Synced” only when the server sync timestamp advances.
  Unchanged data says “Up to date”; offline, partial and failed syncs retain
  cached reports and use distinct, honest feedback.
- No extra polling: the existing jittered sync schedule drives queue checks.
  Flower motion stops when finished/hidden, pauses in background and respects
  reduced motion. The SVG is 966 bytes (415 gzip); sync controller ~1.2 KB gzip.
- Returning-app, queue, offline recovery, partial failure and unchanged-cache
  browser checks pass. Mobile 390px and desktop 1280px DOM geometry checks show
  no overflow and correct placement. Physical-phone frame rate remains untested.
- Removed “Leaving already?” from the entire greeting pool as requested.
- Next: validated release and live asset verification, then reconcile the
  readiness checklist and implement the next useful Ratio-D feature.

## 2026-09-18: marks target planner

- Sync notice/greeting release d26f626 passed 42 frontend/88 backend checks;
  GitHub run 35291530328 succeeded. Live JavaScript confirms both changes.
- Refetched Ratio-D; origin/main remains 413b7f0. Reviewed its marks-target
  workflow and implemented an Anon planner inside each course's assessment view.
- Students choose their marking scheme, target total and expected remaining
  internals. Supports theory/practical 60/40, internal-only and custom weights.
  No course scheme or official grade is inferred. Invalid/missing marks and
  impossible targets have explicit states; exam pass minimums remain separate.
- Calculations run locally without network requests. Scenarios last for this
  visit, clear on sign-out, and reconcile with new report values while open.
- Targeted math and browser checks pass: boundary/rounding cases, keyboard
  focus, scheme changes, session clearing and 320–1280px dialog overflow.
  Release validation includes the added mark-update coverage.
- Next: release and live verification, then public readiness and offline shell.

## 2026-09-18: offline app reopening

- Marks planner release 3c1a050 passed 45 frontend/88 backend checks; GitHub
  run 35292201631 succeeded and the planner script is served in production.
- Added a versioned offline app shell: public pages/scripts/styles/fonts/icons
  only, about 2 MiB uncompressed. APIs, OCR assets, analytics, external URLs and
  arbitrary query pages are excluded. Report data remains in its existing
  localStorage cache. Cached reopen shows an explicit offline notice.
- Installation waits for an idle visible page and completed sign-in, limits
  downloads to three, and reuses versioned HTTP assets. New workers wait for old
  windows to close; failed installs drain work and remove incomplete caches.
- Build now verifies generated asset hashes and shell contents. Frontend edits
  require `npm run build:offline` before staging/release; docs updated.
- Three targeted checks pass, including a real offline browser reload, local
  sign-out cache clearing, API exclusions and install/activation lifecycle.
- Next: full staged release, live shell verification and remaining readiness
  checklist (thank-you flow, public metadata, mobile CTA and imagery audit).

## 2026-09-18: public readiness and issue reporting

- Offline release 3f31e0c passed 48 frontend/88 backend checks; GitHub run
  35292770682 succeeded. Production serves the generated service worker.
- Added Report a problem from sign-in and Settings, with fixed issue categories
  stored in the existing bounded client log. No free text, credentials, reports
  or contact details are collected. Backend independently allowlists categories.
- Thank-you page confirms only an accepted write; offline/dropped writes retain
  a retryable form. Direct thank-you visits do not claim a report was submitted.
- All public pages have sharing metadata. Sitemap includes the issue form;
  confirmation/404 pages are noindex. Asset hashes now update across all public
  pages, and their offline versions are included in the same bounded shell.
- Mobile sign-in CTA is sticky on short screens, returns to normal flow while
  typing/consent is open, and fits 390x844 above the fold. Checks at 320x568 pass.
- Consent withdrawal, truthful report submission, privacy filtering and public
  page overflow checks pass. Docs now reflect seven-day sessions and sync slots.
- Next: staged release, final checklist reconciliation and image/font payload
  optimization. Physical-device frame-rate/battery and real SRM burst latency
  remain unmeasured; no four-second full-login guarantee is claimed.

## 2026-09-18: smaller editorial font and readiness reconciliation

- Public-readiness release fae7f4f deployed successfully through GitHub run
  35293908279; the live thank-you page includes the confirmed-report flow.
- Converted Newsreader to WOFF2: 451,664 → 214,960 bytes, 52.4% smaller.
  Glyph order, Unicode map and variable-axis bounds/defaults are unchanged.
  Original TTF remains the source; conversion tooling is optional and separate
  from runtime dependencies. Browser confirms the WOFF2 loads at all weights.
- Regenerated the offline shell: 69 public assets, 1.78 MiB. Static build and
  asset checks pass. Documented artwork costs and reconciled the requested
  readiness checklist with verified releases; physical-device checks and real
  SRM burst measurements remain open.
- Next: staged release validation, then correct date-planner refresh behavior
  and investigate background rendering without changing the selected style.
