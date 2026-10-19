import json
import os
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from client_logs import ClientLogStore, clean_event


class ClientLogTests(unittest.TestCase):
    def test_exam_failures_keep_route_and_page_without_sensitive_fields(self):
        event = clean_event({"kind": "api_error", "page": "exams", "route": "/api/exams",
                             "source": "exam-dates.js", "code": "HTTP_ERROR", "status": 502,
                             "cookies": "private", "query": "private"})
        self.assertEqual(event, {"kind": "api_error", "page": "exams", "route": "/api/exams",
                                 "source": "exam-dates.js", "code": "HTTP_ERROR", "status": 502})

    def test_allowlist_discards_sensitive_fields_and_arbitrary_values(self):
        event = clean_event({"kind": "api_error", "page": "marks", "code": "HTTP_ERROR",
            "route": "/api/reports", "status": 502, "release": "a" * 10,
            "password": "private", "cookies": "private", "message": "private",
            "stack": "private", "url": "https://example.com/?password=private"})
        self.assertNotIn("private", json.dumps(event))
        self.assertEqual(event["status"], 502)
        self.assertEqual(clean_event({"kind": "runtime_error", "page": [], "source": {}}),
                         {"kind": "runtime_error", "page": "unknown"})
        self.assertIsNone(clean_event({"kind": []}))
        self.assertIsNone(clean_event({"kind": "page_view", "page": "home"}))

    def test_user_reports_accept_only_fixed_categories_and_drop_free_text(self):
        event = clean_event({"kind": "user_report", "page": "marks", "code": "MARKS_PROBLEM",
                             "message": "private", "account": "private", "source": "marks-target.js"})
        self.assertEqual(event, {"kind": "user_report", "page": "marks", "code": "MARKS_PROBLEM", "source": "marks-target.js"})
        for code in [None, [], {}, "private", "HTTP_ERROR"]:
            self.assertIsNone(clean_event({"kind": "user_report", "code": code}))

    def test_disk_permissions_rate_bound_and_retention(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ClientLogStore(directory)
            old = Path(directory) / f"{(datetime.now(timezone.utc).date() - timedelta(days=7)).isoformat()}.jsonl"
            old.write_text('old')
            for _ in range(13):
                store.append([{"kind": "api_error", "code": "HTTP_ERROR"}] * 10)
            files = list(Path(directory).glob('*.jsonl'))
            self.assertEqual(len(files), 1)
            self.assertEqual(len(files[0].read_text().splitlines()), 120)
            self.assertEqual(os.stat(files[0]).st_mode & 0o777, 0o600)
            self.assertFalse(old.exists())
            store.close()

    def test_daily_file_is_size_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ClientLogStore(directory)
            path = Path(directory) / f"{datetime.now(timezone.utc).date().isoformat()}.jsonl"
            path.write_bytes(b'x' * 2_000_000)
            self.assertEqual(store.append([{"kind": "runtime_error"}]), 0)
            self.assertEqual(path.stat().st_size, 2_000_000)

    def test_engagement_requires_consent_and_bounded_duration(self):
        self.assertIsNone(clean_event({"kind":"page_engagement","active_ms":1000}))
        event=clean_event({"kind":"page_engagement","consent":True,"page":"marks","active_ms":12000,"account":"private"})
        self.assertEqual(event,{"kind":"page_engagement","page":"marks","active_ms":12000})
        event=clean_event({"kind":"page_engagement","consent":True,"active_ms":99999999})
        self.assertNotIn("active_ms",event)
