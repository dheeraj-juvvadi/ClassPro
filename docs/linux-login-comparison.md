# Linux production-build comparison — 2026-09-14

Source: committed release `2dc83d0`, built with the production Dockerfile for
linux/amd64. Local container: `classpro-linux-diag`, image
`classpro-diag:2dc83d0`, preview http://localhost:8085.

The container runs in an isolated Colima ARM Linux VM using Rosetta to execute
x86-64 binaries. Chrome for Testing 152.0.7977.82 and fasthttp are confirmed.
It uses UTC and the same submission mode as Render. Differences include local
egress, emulation, CPU/memory allocation, local HTTP frontend, and the static
preview mount. This is a same-source/configuration comparison, not proof of
identical image bytes or machine conditions.

The user submitted a manual CAPTCHA login at 18:12:09 UTC. SRM returned 302,
followed by the authenticated dashboard. Login completed in about 3.15 seconds.
The same JSESSIONID and all captured challenge cookies survived submission.
The portal emitted no captured console events. Reports returned 200 in about
1.05 seconds: five attendance courses and four marks courses, without report or
assessment-detail errors.

Earlier attempts in this local container included one explicit CAPTCHA rejection
and one immediate fasthttp transport failure. A diagnostic preparation request
overlapped user interaction and returned BUSY; those attempts are not a clean
comparison. The later manual login and report retrieval are independently
confirmed by the dashboard and authenticated report response.

Conclusion: Linux, Chrome 152, UTC, and fasthttp can authenticate together from
the user's network. Render-specific networking/session treatment and resource
or timing differences remain candidates. This does not prove an IP block.
Render returned an explicit visible credentials-related alert with no captured
console events on the corresponding release.

The Colima profile uses two CPUs and 3 GiB RAM; the container allows 1.5 GiB.
Observed post-login container memory was approximately 949 MiB under emulation.
That is not a native Render memory benchmark and does not match its 512 MiB tier.
Do not equate the successful local test with equivalent resource conditions.
