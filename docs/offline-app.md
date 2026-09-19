# Offline app shell

After an online visit, the app installs a service worker during idle time. It
waits while sign-in is busy or the page is hidden. The generated shell contains
only public HTML, scripts, styles, artwork, fonts and install icons: about 2 MiB
uncompressed, capped by the build at 4 MiB and 100 files. Installation uses three
concurrent downloads and reuses HTTP cache for versioned assets.

Session/login/report APIs, analytics, OCR models, external URLs and arbitrary
query-string pages are excluded. No credentials or academic reports enter Cache
Storage. Existing report localStorage remains the source for offline records.
Without previously saved reports, sign-in requires a connection.

The report cache includes the full timetable and academic calendar. Optional
period selections are stored separately under profile-scoped schedule keys.
Offline browser tests load Schedule, verify its saved periods, change a local
selection and reopen the attendance planner without contacting SRM.

Navigation prefers the network with a three-second fallback to the installed
shell when offline or the host fails. Known static assets use the versioned
cache. Invalid public routes retain the server's 404 behavior. A new worker
waits for old app windows to close; it never force-refreshes an active form.
Activation removes only older `anon-shell-` caches. Failed installation drains
its downloads and deletes its incomplete cache, retaining the prior worker.

When changing frontend assets, run `npm run build:offline` in portal-app and
stage index.html/service-worker.js alongside the source edits. It updates asset
hashes and generates a content-versioned worker. `npm run build` verifies these
generated files match exactly; the release script cannot push a stale shell.

Browser tests cover a real offline reload, cached attendance, signed-out state,
API exclusions, installation failure cleanup and old-cache pruning. Browser
storage eviction can remove offline assets; this is not a durable backup.
