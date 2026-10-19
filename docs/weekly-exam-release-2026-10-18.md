# Weekly endsem release verification

Verified October 18, 2026, at 05:44 UTC (11:14 IST).

Release: `8a1afaa006a3fa9d1681469c00834587757d7651`.

## Released behavior

- Endsem dates are fetched at most once every seven days per Portal account.
  The encrypted account cache persists the allowance across sessions, devices,
  logout, and backend restarts. Failed attempts also consume the week.
- Manual attendance/marks Sync and report retries no longer request exam dates.
  Saved exam warnings are excluded from the main Sync result.
- Exam API failures retain their route labels in client diagnostics. Actual
  upstream exam checks emit a bounded success/stale event.

## Production evidence

- Vercel production deployment `dpl_2k5iRqeFMK8X3QkX3SXhYmD5jRT5` is Ready and
  serves the `anon-tracker.vercel.app` alias.
- Public `app.js`, `exam-dates.js`, `settings.js`, and `service-worker.js` match
  the release checkout byte for byte. Browser startup loaded the new versioned
  assets without console errors or failed requests in the inspected snapshot.
- Azure container `anon-api` runs image `anon-api:git-8a1afaa006a3fa9d1681469c00834587757d7651`,
  started at 05:34:07 UTC. The live hashes of `server.py`, `weekly_exams.py`, and
  `client_logs.py` match the release. The persisted exam cache contains eight rows.
- Backend `/health` and public `/api/session` returned HTTP 200.
- Release validation passed: 157 frontend tests, 232 backend tests, and four
  deployment-scope tests. GitHub validation passed; the VM repeated all 232
  backend tests successfully before replacement.
- GitHub run `39100912061` failed only in deployment because SSH port 22 timed
  out. Azure Run Command completed the rollout using the existing build, test,
  and rollback script. The SSH automation restriction remains.

## Final log sample and limits

The current UTC day's client log contained 13 engagement/page-view events and
no error events. Backend events after rollout included two successful provider
requests and one completed refresh, with no counted failure events. This is a
bounded sample, not proof that every account sync succeeds.

No authenticated user sync was initiated during this verification. Existing
browser tabs need a reload to execute the new assets; installed apps can be
closed and reopened. The service worker waits for old windows to close before
activating its updated offline cache.
