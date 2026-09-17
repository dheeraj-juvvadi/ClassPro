"""Bounded operational events. Never accept arbitrary messages, URLs or payloads."""
import json
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import threading
import time

KINDS = {"runtime_error", "promise_error", "api_error", "asset_error", "page_view"}
PAGES = {"login", "home", "attendance", "marks", "settings", "privacy", "terms", "unknown"}
CODES = {"TypeError", "ReferenceError", "SyntaxError", "RangeError", "Error", "UnknownError",
         "NETWORK_ERROR", "TIMEOUT", "INVALID_RESPONSE", "HTTP_ERROR", "ASSET_FAILED"}
ROUTES = {"/api/session", "/api/challenge", "/api/login/client", "/api/reports"}
SOURCES = {"app.js", "home.js", "settings.js", "auth-client.js", "provider-connections.js",
           "academic-ui.js", "schedule-calendar.js", "class-reminders.js", "client-logs.js",
           "consent.js", "date-attendance.js", "date-projection.js", "unknown"}


def clean_event(value):
    if not isinstance(value, dict) or not isinstance(value.get("kind"), str) or value["kind"] not in KINDS:
        return None
    if value["kind"] == "page_view" and value.get("consent") is not True:
        return None
    page = value.get("page")
    result = {"kind": value["kind"], "page": page if isinstance(page, str) and page in PAGES else "unknown"}
    for field, allowed in [("code", CODES), ("route", ROUTES), ("source", SOURCES)]:
        if isinstance(value.get(field), str) and value[field] in allowed:
            result[field] = value[field]
    for field, maximum in [("status", 599), ("duration_ms", 180000), ("line", 100000), ("column", 10000)]:
        number = value.get(field)
        if type(number) is int and 0 <= number <= maximum:
            result[field] = number
    for field, pattern in [("release", r"[a-f0-9]{10,40}"), ("request_id", r"[a-f0-9]{24}")]:
        if isinstance(value.get(field), str) and re.fullmatch(pattern, value[field]):
            result[field] = value[field]
    if isinstance(value.get("viewport"), str) and value["viewport"] in {"mobile", "tablet", "desktop"}:
        result["viewport"] = value["viewport"]
    return result


class ClientLogStore:
    def __init__(self, directory):
        self.root = Path(directory)
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.window = 0
        self.count = 0
        self.prune()

    def prune(self):
        today = datetime.now(timezone.utc).date()
        for old in self.root.glob("????-??-??.jsonl"):
            try:
                if (today - datetime.strptime(old.stem, "%Y-%m-%d").date()).days >= 7:
                    old.unlink(missing_ok=True)
            except ValueError:
                continue

    def append(self, values):
        with self.lock:
            minute = int(time.time() // 60)
            if minute != self.window:
                self.window, self.count = minute, 0
            records = [event for value in values[:10] if (event := clean_event(value))]
            records = records[:max(0, 120 - self.count)]
            today = datetime.now(timezone.utc).date()
            path = self.root / f"{today.isoformat()}.jsonl"
            written = 0
            for event in records:
                event["received_at"] = int(time.time())
                line = (json.dumps(event, separators=(",", ":")) + "\n").encode()
                if path.exists() and path.stat().st_size + len(line) > 2_000_000:
                    break
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
                with os.fdopen(fd, "ab") as stream:
                    stream.write(line)
                written += 1
            self.count += written
            self.prune()
            return written

    def close(self):
        pass
