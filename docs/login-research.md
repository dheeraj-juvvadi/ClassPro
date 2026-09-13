# Login architecture evidence

The current backend browser opens the SRMIST login page and retrieves the real CAPTCHA. One bounded Tesseract-assisted login returned a generic login failure. This does not isolate the cause: recognition and login-field validation are both still unresolved. No fully automated login has been demonstrated. Authenticated report requests were previously verified in the user's shared browser.

## Public implementations inspected

- `devasheeshG/AttendenceManagerBackend/app/utils/attendance_manager.py`: exact KTR host `sp.srmist.edu.in`; `httpx.AsyncClient`, local Tesseract, cookie reuse within a client. Uses older `txtAN`/`txtSK`/`hdnCaptcha` fields and `/captchas`, unlike the currently observed form. Recursive CAPTCHA retries lack a clear bound. Evidence for the HTTP/OCR pattern, not current compatibility.
- `Akshat2711/academia_scrapper_api_fast/studentinfo_scrap.py` and `app.py`: Academia uses `requests.Session` and caller-carried serialized cookies; valid sessions avoid password authentication. Client setup still incurs overhead before loading saved state. Its separate `tools/studentportal_result.py` uses a fresh HTTP client and Tesseract for Student Portal, so its Academia reuse must not be attributed to the Student Portal implementation.
- `StoreVia/Srmap-Captcha-Solver/hybrid/api.py`: SRM AP model, ONNX Runtime CPU execution, one model loaded at startup, bounded queue (64) and inference timeout. Model file approximately 21 MB. Its uppercase/digit alphabet and image format differ from KTR's observed mixed-case challenge; not a drop-in model. README accuracy/speed claims were not independently benchmarked.
- `888krishnam/Auto-Captcha-Extension/src/index.js`: exact KTR login URL; uses Chrome LanguageModel image input to recognize CAPTCHA on the user's device. Not a Render backend implementation; includes a manual fallback and therefore does not prove perfect reliability.
- GradeX/Ratio public clients: prior findings in student-portal-migration.md and ratio-public-flow.md. Their private server implementations and hosting capacity remain unknown.

Primary source URLs:

https://github.com/devasheeshG/AttendenceManagerBackend/blob/main/app/utils/attendance_manager.py
https://github.com/Akshat2711/academia_scrapper_api_fast/blob/master/studentinfo_scrap.py
https://github.com/Akshat2711/academia_scrapper_api_fast/blob/master/tools/studentportal_result.py
https://github.com/StoreVia/Srmap-Captcha-Solver/blob/main/hybrid/api.py
https://github.com/888krishnam/Auto-Captcha-Extension/blob/main/src/index.js
https://render.com/docs/free

Render's official free-service documentation describes idle spin-down after 15 minutes, roughly a minute to spin back up, and ephemeral local storage. Thus browser/cookie state held only in process memory will not survive service restarts. A responsive experience needs persisted data and session design, not merely a fast CAPTCHA solver.

## Revised investigation order

1. Establish exact current login form behavior and identify why the one backend attempt failed, without repeated credential submissions.
2. Test a direct HTTP authentication prototype against that observed contract. Use a browser only if current security fields require it; do not forge guessed values.
3. Benchmark recognition separately on KTR-format challenges before choosing generic OCR or a specialized model. Do not infer cost/accuracy from model file size or author claims.
4. Persist per-account/provider sessions encrypted, reuse them until actual expiry, and coalesce concurrent login/refresh work. Keep credentials out of logs/source/client storage.
5. Serve cached reports with freshness metadata and refresh within bounded limits. Most report views should not require fresh login.
6. Measure cold-login latency, warm-report latency, recognition accuracy, retry rate, memory and peak concurrency on the intended instance. Daily user count alone does not establish capacity.
