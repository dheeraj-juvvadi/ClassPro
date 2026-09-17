# Anon Azure backend

Production FastAPI service for Anon, retaining the historical directory name.
The upstream SRM client comes from projectakshith/ratio-d revision
413b7f0055a14794ea11cb858c05abab311f89b4; its AGPL license is retained.

## Runtime
- Dockerfile: ratio-diagnostic/Dockerfile; build context: repository root.
- APP_ORIGIN=https://anon-tracker.vercel.app; bind port 8080 to loopback.
- Preserve SESSION_STORE_DIR=/app/session-data as a host bind mount.
- Current production limits: 200 sessions, 4 API handlers, 2 OCR workers,
  8 IO threads. These are admission limits, not benchmarked login capacity.
- Remembered sessions expire after seven days of inactivity. Credentials and
  provider cookies remain server-side for silent reconnection; encrypted storage
  and its key reside on the VM. Logout deletes the active session.
- Same-session operations are serialized. OCR permits survive request cancellation
  until native inference finishes. Unchanged persisted payloads reuse ciphertext.
- Logs contain request IDs, fixed route names, duration, status and failure
  categories. Upstream prints and temporary cookie/network evidence are removed.
- GET /health is the local health endpoint; /api/session validates public routing.

## Release
Use scripts/release.mjs after staging a completed agenda. GitHub Actions validates
frontend and backend, then sends the exact commit to the VM through a restricted
SSH deployment key. The VM builds and tests before replacing production.
See docs/releasing.md for setup and rollback details.

## Tests
Install requirements.txt with Python 3.11, then run python -m unittest discover
from this directory. Tests use synthetic sessions and mocked upstream requests.
benchmark_sessions.py measures synthetic persistence only; it does not contact SRM.
