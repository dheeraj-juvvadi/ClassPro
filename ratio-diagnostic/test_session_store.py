import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from session_store import SessionStore, lifetime, REMEMBER_SECONDS


class SessionStoreTests(unittest.TestCase):
    def test_unchanged_payload_reuses_ciphertext_but_persists_activity_and_mutations(self):
        import sqlite3
        from contextlib import closing
        with tempfile.TemporaryDirectory() as directory:
            store = SessionStore(directory)
            entry = self.entry()
            store.save({"token": entry})
            def ciphertext():
                with closing(sqlite3.connect(store.path)) as db:
                    return db.execute("SELECT payload FROM sessions").fetchone()[0]
            original = ciphertext()
            entry["last_seen"] += 20
            store.save({"token": entry})
            self.assertEqual(ciphertext(), original)
            restored = SessionStore(directory).load()["token"]
            self.assertAlmostEqual(restored["last_seen"], entry["last_seen"], places=5)
            entry["providers"]["portal"]["cookies"]["session"] = "renewed-cookie"
            store.save({"token": entry})
            self.assertNotEqual(ciphertext(), original)
            self.assertEqual(SessionStore(directory).load()["token"]["providers"]["portal"]["cookies"]["session"], "renewed-cookie")
            entry["remember"] = False
            store.save({"token": entry})
            self.assertEqual(store.load(), {})

    def test_incremental_save_preserves_others_and_rotates_atomically(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SessionStore(directory)
            first, second = self.entry(), self.entry()
            store.save({"old": first, "other": second})
            first["providers"]["portal"]["cookies"]["session"] = "rotated"
            store.save_changes({"new": first}, removed=["old"])
            loaded = store.load()
            self.assertEqual(set(loaded), {"new", "other"})
            self.assertEqual(loaded["other"]["providers"], second["providers"])
            self.assertEqual(loaded["new"]["providers"], first["providers"])
            store.save_changes({}, removed=["new"])
            self.assertEqual(set(store.load()), {"other"})
            second["remember"] = False
            store.save_changes({"other": second})
            self.assertEqual(store.load(), {})

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

    def test_112_sessions_restore_isolation_logout_and_expiration(self):
        count = 112
        with tempfile.TemporaryDirectory() as directory:
            sessions = {}
            for index in range(count):
                entry = self.entry()
                entry["providers"]["portal"].update({
                    "username": f"synthetic-student-{index}",
                    "password": f"synthetic-password-{index}",
                    "cookies": {"session": f"synthetic-cookie-{index}"},
                    "report": {"courses": [
                        {"code": f"COURSE-{course}", "student": index,
                         "details": "synthetic-report-data-" * 100}
                        for course in range(20)
                    ]},
                })
                sessions[f"synthetic-token-{index}"] = entry
            store = SessionStore(directory)
            store.save(sessions)
            restored = SessionStore(directory).load()
            self.assertEqual(len(restored), count)
            for token, entry in sessions.items():
                self.assertEqual(restored[token]["providers"], entry["providers"])
            restored["synthetic-token-0"]["providers"]["portal"]["cookies"]["session"] = "changed"
            self.assertEqual(restored["synthetic-token-1"]["providers"]["portal"]["cookies"],
                             {"session": "synthetic-cookie-1"})
            del restored["synthetic-token-0"]
            store.save(restored)
            reloaded = SessionStore(directory).load()
            self.assertEqual(len(reloaded), count - 1)
            self.assertNotIn("synthetic-token-0", reloaded)
            for token in reloaded:
                self.assertEqual(reloaded[token]["providers"], sessions[token]["providers"])
            with patch("session_store.time.time", return_value=time.time() + REMEMBER_SECONDS + 1):
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
