# Ratio public login/session evidence

Scope: public GET of [login](https://getratiod.lol/login) and its directly linked JavaScript assets only. No login, API requests, session replay, endpoint probing, or source maps. Findings describe shipped client expectations; **backend behavior is unverified**.

## Providers and separation

The login bundle [A] offers **academia** (default) and **student portal**. Academia adds `@srmist.edu.in` to bare usernames; Student Portal labels its identifier “NetID / Reg No”. Shared loading copy references Zoho, consistent with Academia, but does not identify Student Portal's underlying vendor. No ClassPro provider identification was found.

The shared client [B] separates `academia_cookies` / `ratio_credentials` from `portal_cookies` / `portal_credentials`. Student Portal refresh can populate attendance, marks, monthly data, schedule, courses, and profile. This is not evidence that Ratio strictly restricts Academia to timetable: its Academia refresh accepts attendance, marks, or timetable.

## Recovery contracts publicly shipped

- **Academia:** login uses `/login`. `/refresh` initially sends username and stored cookies. HTTP 401 with `detail.type = SESSION_EXPIRED` triggers a retry including the stored password, when available. A second 401 logs out locally. `INVALID_CREDENTIALS` also triggers local logout. These are client branches, not verified server responses.
- **Student Portal:** separate `/portal/login`, `/portal/captcha`, and `/portal/refresh` paths. CAPTCHA response fields include `image` and `session`, mapped to login's `cdigest`; client error type is `CAPTCHA_REQUIRED`. Refresh sends portal cookies and available portal credentials. No explicit session-limit/termination status was found in the inspected assets.
- HTTP 429 is grouped with 502/503/504 as a backend error; it is not explicitly treated as a session limit.

Shared loading copy says “kicking your other session out...” [A]. This is display text, not proof of automatic termination or attribution to Student Portal. No explicit termination request or session-limit contract was found. The user's termination report remains unverified.

## Source evidence

- [A: login bundle](https://getratiod.lol/_next/static/chunks/app/login/page-dae0d63491f62d11.js)
- [B: shared client bundle](https://getratiod.lol/_next/static/chunks/777-45943a82129b70ad.js)

No Ratio application repository/docs link was found in the page or inspected assets. A bundled core-js repository/license link is third-party dependency provenance only. Downloads: `/tmp/ratio-public-flow/`; no application code copied into this document.
