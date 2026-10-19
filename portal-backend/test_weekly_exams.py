import asyncio
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import server
from session_store import SessionStore
from test_sync_retry import Fixture, START, stamp
from weekly_exams import ExamCache, WEEK, account_key


class WeeklyExamTests(Fixture):
    def session(self, token="weekly", username="student", previous=None):
        entry = {"created": 0, "last_seen": START, "remember": True,
                 "providers": {"portal": {"username": username, "cookies": {"s": "synthetic"},
                                            "report": {"exams": previous} if previous else {}}},
                 "report": {}}
        server.sessions[token] = entry
        self.client.cookies.set(server.cookie_name, token)
        return entry

    async def test_force_and_retry_do_not_bypass_week_even_after_failure(self):
        self.session()
        result = {"entries": [], "stale": True, "lastAttemptAt": stamp(START)}
        with self.clock() as clock, patch.object(server, "refresh_exams", return_value=result) as fetch:
            first = (await self.client.get("/api/exams?force=1")).json()
            self.assertIsNone(first["retry"])
            self.assertEqual(first["exams"]["nextCheckAt"], (START + WEEK) * 1000)
            clock.side_effect = lambda: START + WEEK - 1
            for query in ["", "?force=1", "?retry=old-id"]:
                cached = (await self.client.get("/api/exams" + query)).json()
                self.assertIsNone(cached["retry"])
            self.assertEqual(fetch.await_count, 1)
            clock.side_effect = lambda: START + WEEK
            await self.client.get("/api/exams?force=1")
            self.assertEqual(fetch.await_count, 2)

    async def test_recent_existing_dates_migrate_without_upstream_request(self):
        previous = {"entries": [{"code": "C1", "date": "2026-11-26"}],
                    "stale": True, "lastAttemptAt": stamp(START - 120)}
        entry = self.session(previous=previous)
        entry["exam_retry"] = {"id": "old", "pending": True}
        with self.clock(), patch.object(server, "refresh_exams", new_callable=AsyncMock) as fetch:
            result = (await self.client.get("/api/exams?force=1")).json()
        fetch.assert_not_awaited()
        self.assertEqual(result["exams"]["entries"], previous["entries"])
        self.assertEqual(result["nextCheckAt"], (START - 120 + WEEK) * 1000)
        self.assertNotIn("exam_retry", entry)

    async def test_two_sessions_for_same_user_share_one_inflight_fetch(self):
        self.session("first", "Student@srmist.edu.in")
        self.session("second", "student")
        entered, release = asyncio.Event(), asyncio.Event()

        async def fetch(*args, **kwargs):
            entered.set()
            await release.wait()
            return {"entries": [{"code": "C1"}], "stale": False, "lastAttemptAt": stamp(START)}

        with self.clock(), patch.object(server, "refresh_exams", side_effect=fetch) as work:
            first = asyncio.create_task(self.client.get("/api/exams", headers={"cookie": "anon_session=first"}))
            await entered.wait()
            second = await self.client.get("/api/exams?force=1", headers={"cookie": "anon_session=second"})
            self.assertIsNone(second.json()["exams"])
            release.set()
            await first
            cached = (await self.client.get("/api/exams", headers={"cookie": "anon_session=second"})).json()
        self.assertEqual(work.await_count, 1)
        self.assertEqual(cached["exams"]["entries"], [{"code": "C1"}])

    async def test_retired_retry_id_never_starts_fetch(self):
        self.session()
        with self.clock(), patch.object(server, "refresh_exams", new_callable=AsyncMock) as fetch:
            result = (await self.client.get("/api/exams?retry=old")).json()
        fetch.assert_not_awaited()
        self.assertIsNone(result["retry"])

    async def test_unexpected_failure_consumes_week_and_keeps_saved_dates(self):
        saved = {"entries": [{"code": "C1"}], "checkedAt": stamp(START - WEEK),
                 "lastAttemptAt": stamp(START - WEEK)}
        self.session(previous=saved)
        with self.clock(), patch.object(server, "refresh_exams", side_effect=RuntimeError) as fetch:
            result = (await self.client.get("/api/exams")).json()
            await self.client.get("/api/exams?force=1")
        self.assertEqual(fetch.await_count, 1)
        self.assertTrue(result["exams"]["stale"])
        self.assertEqual(result["exams"]["entries"][0]["code"], "C1")


class WeeklyCacheTests(unittest.TestCase):
    def test_restart_logout_and_user_isolation(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SessionStore(directory)
            cache = ExamCache(store)
            first = account_key({"username": "Private-Student@srmist.edu.in"}, "session-one")
            same = account_key({"username": "private-student"}, "session-two")
            other = account_key({"username": "other-student"}, "session-three")
            self.assertEqual(first, same)
            report = {"entries": [{"title": "Private course"}]}
            _, deadline, claimed = cache.reserve(first, None, START)
            self.assertTrue(claimed)
            cache.finish(first, deadline, report)
            store.save({})  # Logout removes sessions, but not the weekly cap.
            restored = ExamCache(SessionStore(directory))
            saved, next_at, claimed = restored.reserve(same, None, START + 60)
            self.assertEqual(saved, report)
            self.assertEqual(next_at, START + WEEK)
            self.assertFalse(claimed)
            self.assertTrue(restored.reserve(other, None, START + 60)[2])
            self.assertNotIn(b"Private course", store.path.read_bytes())
            self.assertNotIn(b"private-student", store.path.read_bytes())

    def test_crash_after_claim_cannot_repeat_fetch(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = ExamCache(SessionStore(directory))
            self.assertTrue(cache.reserve("key", None, START)[2])
            restored = ExamCache(SessionStore(directory))
            self.assertFalse(restored.reserve("key", None, START + 60)[2])
            self.assertTrue(restored.reserve("key", None, START + WEEK)[2])

    def test_inactive_account_cache_is_pruned(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = ExamCache(SessionStore(directory))
            _, deadline, _ = cache.reserve("key", None, START)
            cache.finish("key", deadline, {"entries": [{"code": "C1"}]})
            cache.prune(START + 2 * WEEK + 1)
            saved, _, claimed = cache.reserve("key", None, START + 2 * WEEK + 1, False)
            self.assertIsNone(saved)
            self.assertFalse(claimed)
