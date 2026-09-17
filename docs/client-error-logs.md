# Client error review

On the Azure VM:

- `/var/log/anon/client/YYYY-MM-DD.jsonl`: structured browser events, UTC dates.
- `/var/log/anon/reports/latest.json`: grouped daily summary, updated at 00:15 UTC.
- `sudo systemctl start anon-client-review.service`: refresh the summary now.
- `sudo cat /var/log/anon/reports/latest.json`: read counts by page, error, source and release.
- `sudo docker exec classpro-azure python review_client_logs.py --directory /app/client-logs --days 7`: seven-day review.

These paths are host bind mounts and survive container replacement. They are not
served over HTTP. Files use mode 0600 and the directories are restricted. Raw daily
files are capped at 2 MB each and deleted after seven UTC calendar days. A daily
timer also prunes them when there are no new events. Summaries overwrite one file.

The browser sends runtime error type/script location, failed asset categories,
and API route/status/duration/request ID. It does not send exception messages,
stack traces, form fields, passwords, provider cookies, account identifiers or
report contents. The server independently allowlists every stored field. Events
are untrusted client reports, not proof of a backend incident.

Optional page-view counts require analytics consent; operational errors do not.
Each page load sends at most 30 events, with batches of at most ten. The server
accepts at most 120 events per minute globally and two concurrent file writes.
Network failures, full logs and rate limits can drop events; this is best-effort
diagnostics, not an audit trail. No automatic messages are sent to anyone.

Use the request ID to correlate API failures with container operational logs.
Script locations and versioned assets help reproduce frontend errors. The daily
timer produces a report; it does not automatically diagnose or fix errors.
