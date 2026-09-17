"""Encrypted remembered sessions; the key and database live outside the image."""
import hashlib
import json
import os
import sqlite3
import time
from contextlib import closing
from pathlib import Path

REMEMBER_SECONDS = 7 * 24 * 60 * 60
SESSION_SECONDS = 30 * 60


def lifetime(entry):
    return REMEMBER_SECONDS if entry.get("remember", True) else SESSION_SECONDS


class SessionStore:
    def __init__(self, directory):
        from cryptography.fernet import Fernet
        root = Path(directory)
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        key = root / "session.key"
        try:
            fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "wb") as stream:
                stream.write(Fernet.generate_key())
        self.cipher = Fernet(key.read_bytes())
        self._fingerprints = {}
        self.path = root / "sessions.sqlite3"
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires REAL, payload BLOB)")
        os.chmod(self.path, 0o600)

    def save(self, sessions):
        self._save(sessions, replace=True)

    def save_changes(self, sessions, removed=()):
        """Persist only touched sessions; never scan or serialize other users."""
        self._save(sessions, removed=removed, replace=False)

    def _save(self, sessions, removed=(), replace=False):
        fingerprints = {}
        deleted = {hashlib.sha256(token.encode()).hexdigest() for token in removed}
        now = time.time()
        # One transaction, one encrypted row at a time: bulk snapshots do not
        # retain a second copy of every student's encrypted report in memory.
        with closing(sqlite3.connect(self.path)) as db, db:
            for token, entry in sessions.items():
                identifier = hashlib.sha256(token.encode()).hexdigest()
                expires = entry.get("last_seen", now) + lifetime(entry)
                if not entry.get("remember", True) or not entry.get("providers") or expires <= now:
                    deleted.add(identifier)
                    continue
                stable = {key: value for key, value in entry.items()
                          if key not in {"last_seen", "created", "cached"}}
                payload = json.dumps({"token": token, "entry": stable}, separators=(",", ":")).encode()
                fingerprint = hashlib.sha256(payload).digest()
                fingerprints[identifier] = fingerprint
                if self._fingerprints.get(identifier) != fingerprint:
                    db.execute("INSERT INTO sessions VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires, payload=excluded.payload",
                               (identifier, expires, self.cipher.encrypt(payload)))
                else:
                    db.execute("UPDATE sessions SET expires = ? WHERE id = ? AND expires != ?",
                               (expires, identifier, expires))
            if replace:
                existing = {row[0] for row in db.execute("SELECT id FROM sessions")}
                deleted.update(existing - fingerprints.keys())
            db.executemany("DELETE FROM sessions WHERE id = ?", [(key,) for key in deleted])
        if replace:
            self._fingerprints = fingerprints
        else:
            for key in deleted:
                self._fingerprints.pop(key, None)
            self._fingerprints.update(fingerprints)

    def touch(self, sessions):
        """Batch activity expiry updates without reserializing cached reports."""
        rows = [(entry.get("last_seen", time.time()) + lifetime(entry),
                 hashlib.sha256(token.encode()).hexdigest())
                for token, entry in sessions.items()
                if entry.get("remember", True) and entry.get("providers")]
        with closing(sqlite3.connect(self.path)) as db, db:
            db.executemany("UPDATE sessions SET expires = ? WHERE id = ?", rows)

    def load(self):
        from cryptography.fernet import InvalidToken
        sessions = {}
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("DELETE FROM sessions WHERE expires <= ?", (time.time(),))
            rows = db.execute("SELECT payload, expires FROM sessions")
            for encrypted, expires in rows:
                try:
                    payload = json.loads(self.cipher.decrypt(encrypted))
                    entry = payload["entry"]
                    entry["last_seen"] = expires - lifetime(entry)
                    entry["created"] = time.monotonic()
                    entry["cached"] = 0
                    entry.pop("digest", None)
                    entry.pop("academia_digest", None)
                    sessions[payload["token"]] = entry
                except (InvalidToken, ValueError, KeyError):
                    continue
        return sessions
