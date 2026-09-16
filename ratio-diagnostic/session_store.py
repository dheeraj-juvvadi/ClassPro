"""Encrypted remembered sessions; the key and database live outside the image."""
import hashlib
import json
import os
import sqlite3
import time
from pathlib import Path

REMEMBER_SECONDS = 48 * 60 * 60
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
        self.path = root / "sessions.sqlite3"
        with sqlite3.connect(self.path) as db:
            db.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires REAL, payload BLOB)")
        os.chmod(self.path, 0o600)

    def save(self, sessions):
        rows = []
        for token, entry in sessions.items():
            if not entry.get("remember", True) or not entry.get("providers"):
                continue
            expires = entry.get("last_seen", time.time()) + lifetime(entry)
            if expires <= time.time():
                continue
            payload = {"token": token, "entry": entry}
            rows.append((hashlib.sha256(token.encode()).hexdigest(), expires,
                         self.cipher.encrypt(json.dumps(payload).encode())))
        with sqlite3.connect(self.path) as db:
            db.execute("DELETE FROM sessions")
            db.executemany("INSERT INTO sessions VALUES (?, ?, ?)", rows)

    def load(self):
        from cryptography.fernet import InvalidToken
        sessions = {}
        with sqlite3.connect(self.path) as db:
            db.execute("DELETE FROM sessions WHERE expires <= ?", (time.time(),))
            rows = db.execute("SELECT payload FROM sessions").fetchall()
        for (encrypted,) in rows:
            try:
                payload = json.loads(self.cipher.decrypt(encrypted))
                entry = payload["entry"]
                entry["created"] = time.monotonic()
                entry["cached"] = 0
                entry.pop("digest", None)
                entry.pop("academia_digest", None)
                sessions[payload["token"]] = entry
            except (InvalidToken, ValueError, KeyError):
                continue
        return sessions
