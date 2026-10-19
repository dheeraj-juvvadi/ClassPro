"""Account-wide seven-day exam cache; claim before making an upstream request."""
import copy
import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import datetime

WEEK = 7 * 24 * 60 * 60


def account_key(portal, token):
    username = str(portal.get("username") or "").strip().casefold()
    if username.endswith("@srmist.edu.in"):
        username = username[:-len("@srmist.edu.in")]
    # Legacy sessions may lack a username; never share their data with others.
    value = "portal:" + username if username else "session:" + token
    return hashlib.sha256(value.encode()).hexdigest()


def previous_deadline(report, now):
    try:
        attempted = datetime.fromisoformat((report or {}).get("lastAttemptAt", "")).timestamp()
        return min(attempted, now) + WEEK
    except (ValueError, TypeError, OverflowError):
        return 0


class ExamCache:
    def __init__(self, store=None):
        self.store = store
        self.memory = {}
        if store:
            with closing(sqlite3.connect(store.path)) as db, db:
                db.execute("CREATE TABLE IF NOT EXISTS exam_cache "
                           "(id TEXT PRIMARY KEY, next_at REAL, payload BLOB)")
                db.execute("CREATE INDEX IF NOT EXISTS exam_cache_deadline ON exam_cache(next_at)")

    def prune(self, now):
        if self.store:
            with closing(sqlite3.connect(self.store.path)) as db, db:
                db.execute("DELETE FROM exam_cache WHERE next_at < ?", (now - WEEK,))
        else:
            for key, (deadline, _) in list(self.memory.items()):
                if deadline < now - WEEK:
                    self.memory.pop(key, None)

    def _encode(self, report):
        return self.store.cipher.encrypt(json.dumps(report).encode())

    def _decode(self, payload):
        return json.loads(self.store.cipher.decrypt(payload))

    def reserve(self, key, previous, now, allow_fetch=True):
        """Return (saved report, next check, claimed). The claim is durable."""
        if self.store:
            with closing(sqlite3.connect(self.store.path)) as db, db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT next_at,payload FROM exam_cache WHERE id=?", (key,)).fetchone()
                report, next_at, claimed = self._reserve(row, previous, now, allow_fetch)
                db.execute("INSERT INTO exam_cache VALUES (?,?,?) ON CONFLICT(id) DO UPDATE "
                           "SET next_at=excluded.next_at,payload=excluded.payload",
                           (key, next_at, self._encode(report)))
                # Do not retain account reports indefinitely after inactivity.
                db.execute("DELETE FROM exam_cache WHERE next_at < ?", (now - WEEK,))
                return report, next_at, claimed
        row = self.memory.get(key)
        report, next_at, claimed = self._reserve(row, previous, now, allow_fetch)
        self.memory[key] = (next_at, copy.deepcopy(report))
        for old_key, (deadline, _) in list(self.memory.items()):
            if deadline < now - WEEK:
                self.memory.pop(old_key, None)
        return report, next_at, claimed

    def _reserve(self, row, previous, now, allow_fetch):
        next_at, report = (row[0], self._decode(row[1]) if self.store else copy.deepcopy(row[1])) if row else (0, previous)
        migrated = previous_deadline(previous, now)
        if migrated > next_at:
            next_at, report = migrated, previous
        claimed = allow_fetch and now >= next_at
        if claimed:
            next_at = now + WEEK
        return copy.deepcopy(report), next_at, claimed

    def finish(self, key, next_at, report):
        if self.store:
            with closing(sqlite3.connect(self.store.path)) as db, db:
                db.execute("UPDATE exam_cache SET payload=? WHERE id=? AND next_at=?",
                           (self._encode(report), key, next_at))
        elif self.memory.get(key, (None,))[0] == next_at:
            self.memory[key] = (next_at, copy.deepcopy(report))
