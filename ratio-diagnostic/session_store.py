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
        rows = []
        expirations = []
        fingerprints = {}
        now = time.time()
        for token, entry in sessions.items():
            if not entry.get("remember", True) or not entry.get("providers"):
                continue
            expires = entry.get("last_seen", now) + lifetime(entry)
            if expires <= now:
                continue
            # Activity changes only the expiry column; report/cookie/credential
            # mutations still replace the encrypted payload atomically.
            stable = {key: value for key, value in entry.items()
                      if key not in {"last_seen", "created", "cached"}}
            payload = json.dumps({"token": token, "entry": stable}, separators=(",", ":")).encode()
            identifier = hashlib.sha256(token.encode()).hexdigest()
            fingerprint = hashlib.sha256(payload).digest()
            fingerprints[identifier] = fingerprint
            if self._fingerprints.get(identifier) != fingerprint:
                rows.append((identifier, expires, self.cipher.encrypt(payload)))
            else:
                expirations.append((expires, identifier))
        with closing(sqlite3.connect(self.path)) as db, db:
            existing = {row[0] for row in db.execute("SELECT id FROM sessions")}
            db.executemany("DELETE FROM sessions WHERE id = ?", [(key,) for key in existing - fingerprints.keys()])
            db.executemany("INSERT INTO sessions VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires, payload=excluded.payload", rows)
            db.executemany("UPDATE sessions SET expires = ? WHERE id = ? AND expires != ?",
                           [(expires, key, expires) for expires, key in expirations])
        self._fingerprints = fingerprints

    def load(self):
        from cryptography.fernet import InvalidToken
        sessions = {}
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("DELETE FROM sessions WHERE expires <= ?", (time.time(),))
            rows = db.execute("SELECT payload, expires FROM sessions").fetchall()
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
