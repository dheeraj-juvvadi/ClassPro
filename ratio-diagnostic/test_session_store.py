import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from session_store import SessionStore, lifetime, REMEMBER_SECONDS


class SessionStoreTests(unittest.TestCase):
    def entry(self, remember=True):
        return {"remember": remember, "last_seen": time.time(), "created": time.monotonic(),
                "providers": {"portal": {"username": "private-student", "password": "private-password",
                                          "cookies": {"session": "private-cookie"}}}, "cached": 123}

    def test_encrypted_restart_restore_and_logout(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SessionStore(directory)
            store.save({"private-token": self.entry()})
            disk = Path(directory, "sessions.sqlite3").read_bytes()
            for secret in [b"private-token", b"private-password", b"private-cookie", b"private-student"]:
                self.assertNotIn(secret, disk)
            loaded = SessionStore(directory).load()
            self.assertEqual(loaded["private-token"]["providers"]["portal"]["password"], "private-password")
            self.assertEqual(loaded["private-token"]["cached"], 0)
            store.save({})
            self.assertEqual(store.load(), {})

    def test_two_days_inactivity_and_nonremembered_sessions(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SessionStore(directory)
            entry = self.entry()
            store.save({"remembered": entry, "temporary": self.entry(False)})
            with patch("session_store.time.time", return_value=entry["last_seen"] + 24 * 3600):
                self.assertIn("remembered", store.load())
                self.assertNotIn("temporary", store.load())
            with patch("session_store.time.time", return_value=entry["last_seen"] + REMEMBER_SECONDS + 1):
                self.assertEqual(store.load(), {})
            self.assertEqual(lifetime(entry), REMEMBER_SECONDS)
