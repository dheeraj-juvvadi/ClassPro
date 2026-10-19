import asyncio
import io
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import test_server
from session_store import SessionStore
import server
import sync_retry

START = 1800000000.0


def stamp(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat()


class Fixture(unittest.IsolatedAsyncioTestCase):
    """Reuse the diagnostic request fixture without rerunning its tests."""
    asyncSetUp = test_server.DiagnosticTests.asyncSetUp
    asyncTearDown = test_server.DiagnosticTests.asyncTearDown

    def clock(self, now=START):
        return patch.object(server.time, "time", side_effect=lambda: now)


class RetryStateTests(unittest.TestCase):
    def test_arm_due_consume_settle_and_view(self):
        state = sync_retry.arm(["academia", "portal", "portal"], START)
        self.assertEqual(state["sources"], ["academia", "portal"])
        self.assertFalse(sync_retry.due(state, START + 59))
        self.assertTrue(sync_retry.due(state, START + 60))
        self.assertIsNone(sync_retry.arm([], START))
        view = sync_retry.view(state)
        self.assertTrue(view["pending"])
        self.assertEqual(view["at"], (START + 60) * 1000)
        self.assertFalse(view["exhausted"])
        sync_retry.consume(state)
        self.assertFalse(sync_retry.due(state, START + 600))
        self.assertFalse(sync_retry.view(state)["pending"])
        settled = sync_retry.settle(state, ["portal"])
        self.assertTrue(settled["exhausted"])
        self.assertEqual(sync_retry.view(settled)["sources"], ["portal"])
        self.assertIsNone(sync_retry.settle(state, []))

    def test_allowance_survives_encrypted_session_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SessionStore(directory)
            state = sync_retry.arm(["portal"], START)
            store.save({"token-1": {"remember": True, "last_seen": START, "providers": {
                "portal": {"cookies": {"session": "synthetic"}, "report": {}}},
                "sync_retry": state, "exam_retry": sync_retry.arm(["exams"], START)}})
            restored = SessionStore(directory).load()["token-1"]
            self.assertEqual(restored["sync_retry"], state)
            self.assertEqual(sync_retry.view(restored["exam_retry"])["sources"], ["exams"])


class ReportRetryTests(Fixture):
    def agent(self, failing):
        calls = []

        async def refresh(request, entry, invoke, report, exam=None, sources=None, failures=None):
            names = list(sources) if sources is not None else ["portal", "academia"]
            calls.append(names)
            for name in names:
                if failures is not None:
                    failures[name] = name not in failing
            return {"attendance": {"data": []}}, any(name not in failing for name in names)
        return refresh, calls

    def session(self):
        entry = {"created": 0, "last_seen": START, "remember": False,
                 "providers": {"portal": {"cookies": {"s": "1"}, "report": {}, "username": "student"},
                               "academia": {"cookies": {"s": "2"}, "report": {}, "username": "student"}},
                 "report": {}}
        server.sessions["retry-user"] = entry
        self.client.cookies.set(server.cookie_name, "retry-user")
        return entry

    async def test_partial_failure_arms_one_retry_and_no_exam_metadata(self):
        failed = {"portal"}
        refresh, calls = self.agent(failed)
        entry = self.session()
        with self.clock() as clock, patch.object(server, "refresh_providers", side_effect=refresh):
            first = (await self.client.get("/api/reports?force=1&wait=1")).json()
            retry = first["sync"]["retry"]
            self.assertTrue(retry["pending"] and not retry["exhausted"])
            self.assertEqual(retry["sources"], ["portal"])
            self.assertEqual(retry["at"], (START + 60) * 1000)
            self.assertEqual(retry["id"], entry["sync_retry"]["id"])
            self.assertTrue(any("Portal could not refresh" in w for w in first["warnings"]))
            self.assertFalse(any("Academia" in w for w in first["warnings"]))
            self.assertIsNone(first["sync"]["examRetry"])
            self.assertTrue(entry["sync_failed"])
            self.assertEqual(len(calls), 1)
            clock.side_effect = lambda: START + 59
            early = (await self.client.get(f"/api/reports?retry={retry['id']}&wait=1")).json()
            self.assertEqual(len(calls), 1)
            self.assertTrue(early["sync"]["retry"]["pending"])
            failed.clear()
            clock.side_effect = lambda: START + 60
            recovered = (await self.client.get(f"/api/reports?retry={retry['id']}&wait=1")).json()
            self.assertEqual(calls[-1], ["portal"])
            self.assertIsNone(recovered["sync"]["retry"])
            self.assertIsNone(recovered["sync"]["examRetry"])
            self.assertFalse(recovered.get("warnings"))
            self.assertFalse(entry["sync_failed"])
            await self.client.get(f"/api/reports?retry={retry['id']}&cache=only")
            self.assertEqual(len(calls), 2)

    async def test_second_failure_exhausts_and_never_rearms(self):
        failed = {"portal"}
        refresh, calls = self.agent(failed)
        self.session()
        with self.clock() as clock, patch.object(server, "refresh_providers", side_effect=refresh):
            retry = (await self.client.get("/api/reports?force=1&wait=1")).json()["sync"]["retry"]
            clock.side_effect = lambda: START + 60
            exhausted = (await self.client.get(f"/api/reports?retry={retry['id']}&wait=1")).json()
            state = exhausted["sync"]["retry"]
            self.assertFalse(state["pending"])
            self.assertTrue(state["exhausted"])
            self.assertEqual(state["sources"], ["portal"])
            self.assertEqual(state["id"], retry["id"])
            self.assertTrue(any("Portal could not refresh" in w for w in exhausted["warnings"]))
            clock.side_effect = lambda: START + 300
            again = (await self.client.get(f"/api/reports?retry={retry['id']}&wait=1")).json()
            self.assertEqual(len(calls), 2)
            self.assertTrue(again["sync"]["retry"]["exhausted"])

    async def test_new_admitted_attempt_resets_cycle_but_early_force_does_not(self):
        failed = {"portal"}
        refresh, calls = self.agent(failed)
        self.session()
        with self.clock() as clock, patch.object(server, "refresh_providers", side_effect=refresh):
            first = (await self.client.get("/api/reports?force=1&wait=1")).json()["sync"]["retry"]
            clock.side_effect = lambda: START + 10
            early = (await self.client.get("/api/reports?force=1&wait=1")).json()["sync"]["retry"]
            self.assertEqual(len(calls), 1)
            self.assertEqual(early["id"], first["id"])
            self.assertEqual(early["at"], first["at"])
            clock.side_effect = lambda: START + 60
            fresh = (await self.client.get("/api/reports?force=1&wait=1")).json()["sync"]["retry"]
            self.assertEqual(len(calls), 2)
            self.assertIsNotNone(fresh)
            self.assertNotEqual(fresh["id"], first["id"])
            self.assertEqual(fresh["at"], (START + 120) * 1000)
            stale = (await self.client.get(f"/api/reports?retry={first['id']}&wait=1")).json()["sync"]["retry"]
            self.assertEqual(stale["id"], fresh["id"])
            self.assertEqual(len(calls), 2)

    async def test_sibling_success_is_preserved_and_not_refetched(self):
        failed = {"portal"}
        calls = []

        async def invoke(request, path, payload):
            calls.append(path)
            if path == "/portal/refresh" and "portal" in failed:
                raise httpx.ConnectError("synthetic transport failure")
            return httpx.Response(200), {"success": True, "cookies": {"s": path},
                                        "attendance": [{"code": "C1", "present": 1, "conducted": 2}]}
        entry = self.session()
        with self.clock() as clock, patch.object(server, "invoke", side_effect=invoke):
            first = (await self.client.get("/api/reports?force=1&wait=1")).json()
            retry = first["sync"]["retry"]
            self.assertEqual(retry["sources"], ["portal"])
            self.assertIn("attendance", entry["providers"]["academia"]["report"])
            self.assertEqual(first["attendance"]["data"][0]["code"], "C1")
            self.assertEqual(calls.count("/refresh"), 1)
            failed.clear()
            clock.side_effect = lambda: START + 60
            recovered = (await self.client.get(f"/api/reports?retry={retry['id']}&wait=1")).json()
            self.assertIsNone(recovered["sync"]["retry"])
            self.assertEqual(calls.count("/refresh"), 1)
            self.assertEqual(calls.count("/portal/refresh"), 2)

    async def test_login_prunes_only_the_healed_retry_source(self):
        state = sync_retry.arm(["academia", "portal"], START)
        entry = {"created": 0, "last_seen": START, "remember": True,
                 "providers": {"portal": {"cookies": {"s": "1"}, "report": {}, "username": "student@srmist.edu.in"},
                               "academia": {"cookies": {"s": "2"}, "report": {}, "username": "student@srmist.edu.in"}},
                 "report": {}, "digest": "synthetic", "pending_provider": "portal", "sync_retry": state}
        before = json.loads(json.dumps(state))
        server.sessions["retry-user"] = entry
        self.client.cookies.set(server.cookie_name, "retry-user")

        async def invoke(request, path, payload):
            return httpx.Response(200), {"success": True, "cookies": {"fresh": "1"},
                                         "attendance": [{"code": "C1", "present": 1, "conducted": 2}]}
        with self.clock(), patch.object(server, "invoke", side_effect=invoke):
            healed = await self.client.post("/api/login/client", json={
                "provider": "portal", "account": "student", "password": "synthetic"})
        self.assertEqual(healed.status_code, 200)
        entry = next(iter(server.sessions.values()))
        self.assertEqual(entry["sync_retry"]["sources"], ["academia"])
        self.assertEqual(entry["sync_retry"]["id"], before["id"])
        self.assertEqual(entry["sync_retry"]["at"], before["at"])
        self.assertFalse(entry["sync_retry"]["consumed"])
        entry["pending_provider"] = "academia"
        with self.clock(), patch.object(server, "invoke", side_effect=invoke):
            healed = await self.client.post("/api/login/client", json={
                "provider": "academia", "account": "student", "password": "synthetic"})
        self.assertEqual(healed.status_code, 200)
        self.assertIsNone(next(iter(server.sessions.values())).get("sync_retry"))


class RefreshJobTests(Fixture):
    def entry(self):
        return {"created": 0, "last_seen": START, "remember": False,
                "providers": {"portal": {"cookies": {"s": "1"}, "report": {}},
                              "academia": {"cookies": {"s": "2"}, "report": {}}},
                "report": {}}

    def request(self, retry_id=None, age=0, diagnostic_id="synthetic-job"):
        return SimpleNamespace(state=SimpleNamespace(
            queued_at=server.time.monotonic() - age, diagnostic_id=diagnostic_id, retry_id=retry_id))

    async def test_claim_is_consumed_and_persisted_before_upstream(self):
        entry = self.entry()
        retry = sync_retry.arm(["portal"], START - 60)
        entry["sync_retry"] = retry
        server.sessions["job"] = entry
        seen, saved = [], []
        store = SimpleNamespace(save_changes=lambda changed, removed=(): saved.append(
            json.loads(json.dumps(changed["job"].get("sync_retry")))))

        async def refresh(request, e, invoke, rep, exam=None, sources=None, failures=None):
            seen.append((list(sources), e["sync_retry"]["consumed"], saved[-1]["consumed"]))
            failures["portal"] = True
            return {"attendance": {"data": []}}, True
        with self.clock(), patch.object(server, "session_store", store), \
             patch.object(server, "refresh_providers", side_effect=refresh):
            result = await server.refresh_job("job", entry, self.request(retry["id"]))
        self.assertTrue(result)
        self.assertEqual(seen, [(["portal"], True, True)])
        self.assertIsNone(entry.get("sync_retry"))

    async def test_stale_retry_id_is_rejected_under_lock_without_claim(self):
        entry = self.entry()
        entry["sync_attempted_at"] = START - 120
        entry["sync_retry"] = sync_retry.arm(["portal"], START - 60)
        server.sessions["job"] = entry
        with self.clock(), patch.object(server, "refresh_providers", new_callable=AsyncMock) as refresh:
            result = await server.refresh_job("job", entry, self.request("deadbeef"))
            refresh.assert_not_awaited()
        self.assertFalse(result)
        self.assertFalse(entry["sync_retry"]["consumed"])
        self.assertTrue(sync_retry.view(entry["sync_retry"])["pending"])
        self.assertEqual(entry["sync_attempted_at"], START - 120)

    async def test_timeout_retries_unfinished_sources_and_keeps_completed_data(self):
        for completed in (True, False):
            with self.subTest(completed=completed):
                entry = self.entry()
                server.sessions["job"] = entry

                async def refresh(request, e, invoke, rep, exam=None, sources=None, failures=None):
                    failures["academia"] = completed
                    if completed:
                        e["providers"]["academia"]["report"] = {"schedule": {"entries": [{"code": "C1"}]}}
                    raise TimeoutError

                with self.clock(), patch.object(server, "refresh_providers", side_effect=refresh):
                    result = await server.refresh_job("job", entry, self.request())
                self.assertEqual(result, completed)
                self.assertEqual(entry["sync_retry"]["sources"], ["portal"] if completed else ["academia", "portal"])
                if completed:
                    self.assertEqual(entry["report"]["schedule"]["entries"], [{"code": "C1"}])

    async def test_duplicate_retry_jobs_only_refresh_once(self):
        entry = self.entry()
        retry = sync_retry.arm(["portal"], START - 60)
        entry["sync_retry"] = retry
        server.sessions["job"] = entry
        entered, release = asyncio.Event(), asyncio.Event()

        async def refresh(request, e, invoke, rep, exam=None, sources=None, failures=None):
            entered.set()
            await release.wait()
            failures["portal"] = False
            return {}, False

        with self.clock(), patch.object(server, "refresh_providers", side_effect=refresh) as fetch:
            first = asyncio.create_task(server.refresh_job("job", entry, self.request(retry["id"])))
            await entered.wait()
            second = asyncio.create_task(server.refresh_job("job", entry, self.request(retry["id"])))
            release.set()
            await asyncio.gather(first, second)
        self.assertEqual(fetch.await_count, 1)
        self.assertTrue(entry["sync_retry"]["exhausted"])

    async def test_retry_deadline_starts_after_failure_finishes(self):
        entry = self.entry()
        server.sessions["job"] = entry
        with self.clock() as clock:
            async def refresh(request, e, invoke, rep, exam=None, sources=None, failures=None):
                failures.update({"portal": False, "academia": True})
                clock.side_effect = lambda: START + 9
                return {}, True
            with patch.object(server, "refresh_providers", side_effect=refresh):
                await server.refresh_job("job", entry, self.request())
        self.assertEqual(entry["sync_retry"]["at"], START + 69)

    async def test_partial_outcome_is_flagged_and_logged(self):
        entry = self.entry()
        server.sessions["job"] = entry
        output = io.StringIO()

        async def refresh(request, e, invoke, rep, exam=None, sources=None, failures=None):
            failures.update({"portal": False, "academia": True})
            return {"attendance": {"data": []}}, True
        with self.clock(), patch.object(server, "refresh_providers", side_effect=refresh), \
             patch.object(server, "can_admit", return_value=True), patch("sys.stdout", output):
            result = await server.refresh_job("job", entry, self.request())
        self.assertTrue(result)
        self.assertTrue(entry["sync_failed"])
        self.assertEqual(entry["sync_retry"]["sources"], ["portal"])
        self.assertEqual(json.loads(output.getvalue())["outcome"], "partial")

    async def test_queue_timeout_arms_then_postpones_same_allowance(self):
        entry = self.entry()
        server.sessions["job"] = entry
        with self.clock(), patch("sys.stdout", io.StringIO()):
            first = await server.refresh_job("job", entry, self.request(age=server.REFRESH_QUEUE_WAIT + 1))
        self.assertFalse(first)
        retry = entry["sync_retry"]
        self.assertEqual(retry["sources"], ["academia", "portal"])
        self.assertEqual(retry["at"], START + server.REFRESH_COOLDOWN)
        with self.clock(START + 120), patch("sys.stdout", io.StringIO()):
            second = await server.refresh_job("job", entry, self.request(retry["id"], age=server.REFRESH_QUEUE_WAIT + 1))
        self.assertFalse(second)
        self.assertEqual(entry["sync_retry"]["id"], retry["id"])
        self.assertFalse(entry["sync_retry"]["consumed"])
        self.assertEqual(entry["sync_retry"]["at"], START + 120 + server.REFRESH_COOLDOWN)
