"""Synthetic clients only: no credentials or requests reach SRM."""
import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import httpx
import server


class LoginAdmissionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        server.sessions.clear()
        server.rates.clear()
        server.cleaned_at = 0
        server.gate = asyncio.Semaphore(server.API_CONCURRENCY)
        server.waiters = server.admission_waiters = 0
        self.client = self.make_client()
        self.memory = patch.object(server, "can_admit", return_value=True)
        self.memory.start()
        self.addCleanup(self.memory.stop)
        self.store = patch.object(server, "session_store", None)
        self.store.start()
        self.addCleanup(self.store.stop)

    def make_client(self):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
                                base_url="http://localhost:8089",
                                headers={"Origin": server.origin})

    async def asyncTearDown(self):
        await self.client.aclose()
        self.assertEqual(server.admission_waiters, 0)
        self.assertEqual(server.waiters, 0)
        server.sessions.clear()
        server.rates.clear()

    def seed(self, token):
        server.sessions[token] = {"created": server.time.monotonic(),
                                  "last_seen": server.time.time(), "pending_provider": "academia"}

    async def test_fifty_shared_ip_users_boot_challenge_and_login_independently(self):
        active = peak = completed = 0

        async def invoke(request, path, payload):
            nonlocal active, peak, completed
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(.01)
            active -= 1
            completed += 1
            return httpx.Response(200), {"success": True, "cookies": {"session": "synthetic"},
                                         "attendance": [{"code": "CS1", "present": 9, "conducted": 10}]}

        async def student(index):
            async with self.make_client() as client:
                boot = await client.get("/api/session")
                challenge = await client.post("/api/challenge", json={"provider": "academia"})
                login = await client.post("/api/login/client", json={"provider": "academia",
                                         "account": f"synthetic-{index}", "password": "test-only"})
                return boot.status_code, challenge.status_code, login.status_code

        with patch.object(server, "invoke", side_effect=invoke):
            results = await asyncio.gather(*(student(i) for i in range(50)))
        self.assertTrue(all(result == (200, 200, 200) for result in results), results)
        self.assertEqual(completed, 50)
        self.assertLessEqual(peak, server.API_CONCURRENCY)
        self.assertEqual(len(server.sessions), 50)

    async def test_pending_session_has_own_rate_bucket_and_rotation_retains_it(self):
        await self.client.post("/api/challenge", json={"provider": "academia"})
        token = self.client.cookies.get(server.cookie_name)
        server.rates["start:127.0.0.1"] = (server.time.monotonic(), server.SESSION_STARTS_PER_MINUTE)
        self.assertEqual((await self.client.post("/api/challenge", json={"provider": "academia"})).status_code, 200)
        server.rates["session:" + token] = (server.time.monotonic(), 10)
        data = {"success": True, "cookies": {"session": "synthetic"}, "attendance": [{"code": "CS1"}]}
        with patch.object(server, "invoke", new_callable=AsyncMock, return_value=(httpx.Response(200), data)):
            response = await self.client.post("/api/login/client", json={"account": "synthetic", "password": "test-only"})
        self.assertEqual(response.status_code, 200)
        rotated = self.client.cookies.get(server.cookie_name)
        self.assertNotEqual(token, rotated)
        self.assertNotIn("session:" + token, server.rates)
        self.assertEqual(server.rates["session:" + rotated][1], 11)

    async def test_duplicate_session_waiters_do_not_take_worker_slots(self):
        self.seed("busy-student")
        lock = server.session_locks.setdefault("busy-student", asyncio.Lock())
        await lock.acquire()
        duplicates = [asyncio.create_task(self.client.post("/api/challenge",
                      json={"provider": "academia"}, headers={"cookie": f"{server.cookie_name}=busy-student"}))
                      for _ in range(server.API_CONCURRENCY)]
        try:
            async with asyncio.timeout(1):
                while server.admission_waiters < server.API_CONCURRENCY:
                    await asyncio.sleep(.001)
            self.assertEqual(server.gate._value, server.API_CONCURRENCY)
            independent = await asyncio.wait_for(self.client.post("/api/challenge",
                                                json={"provider": "academia"}), .5)
            self.assertEqual(independent.status_code, 200)
        finally:
            lock.release()
            await asyncio.gather(*duplicates)

    async def test_lock_timeout_and_cancellation_release_admission_counts(self):
        self.seed("busy-student")
        lock = server.session_locks.setdefault("busy-student", asyncio.Lock())
        await lock.acquire()
        headers = {"cookie": f"{server.cookie_name}=busy-student"}
        try:
            with patch.object(server, "QUEUE_WAIT", .015), patch.object(server, "invoke", new_callable=AsyncMock) as work:
                response = await self.client.post("/api/challenge", json={"provider": "academia"}, headers=headers)
                self.assertEqual(response.status_code, 503)
                self.assertTrue(response.json()["error"]["retryable"])
                self.assertEqual(response.headers["Retry-After"], "2")
                work.assert_not_awaited()
            task = asyncio.create_task(self.client.post("/api/challenge", json={"provider": "academia"}, headers=headers))
            async with asyncio.timeout(1):
                while server.admission_waiters == 0:
                    await asyncio.sleep(.001)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertEqual(server.gate._value, server.API_CONCURRENCY)
        finally:
            lock.release()

    async def test_memory_is_rechecked_after_wait_and_no_upstream_work_starts(self):
        with patch.object(server, "can_admit", side_effect=[True, False]), patch.object(server, "invoke", new_callable=AsyncMock) as work:
            response = await self.client.post("/api/challenge", json={"provider": "portal"})
        self.assertEqual(response.status_code, 503)
        self.assertTrue(response.json()["error"]["retryable"])
        self.assertEqual(response.headers["Retry-After"], "15")
        self.assertEqual(len(server.sessions), 0)
        work.assert_not_awaited()
        self.assertEqual(server.gate._value, server.API_CONCURRENCY)

    async def test_waiting_cap_includes_session_lock_waiters(self):
        with patch.object(server, "admission_waiters", server.API_QUEUE):
            response = await self.client.post("/api/challenge", json={"provider": "academia"})
            self.assertEqual(response.status_code, 503)
            self.assertTrue(response.json()["error"]["retryable"])
            self.assertEqual((await self.client.get("/api/session")).status_code, 200)

    async def test_bootstrap_and_new_session_limits_are_separate_and_bounded(self):
        with patch.object(server, "BOOTSTRAP_PER_MINUTE", 2), patch.object(server, "SESSION_STARTS_PER_MINUTE", 1):
            self.assertEqual((await self.client.get("/api/session")).status_code, 200)
            self.assertEqual((await self.client.get("/api/session")).status_code, 200)
            blocked = await self.client.get("/api/session")
            self.assertEqual(blocked.status_code, 429)
            self.assertTrue(blocked.json()["error"]["retryable"])
            self.assertEqual((await self.client.post("/api/challenge", json={"provider": "academia"})).status_code, 200)
            self.client.cookies.clear()
            blocked = await self.client.post("/api/challenge", json={"provider": "academia"})
            self.assertEqual(blocked.status_code, 429)
            self.assertTrue(blocked.json()["error"]["retryable"])
            self.assertEqual(len(server.sessions), 1)

    async def test_pending_limit_expiry_and_authenticated_sessions_remain_usable(self):
        self.seed("unfinished")
        server.sessions["unfinished"]["created"] -= server.PENDING_SESSION_SECONDS + 1
        self.seed("connected")
        server.sessions["connected"].update({"providers": {"academia": {}}, "remember": True})
        server.sessions["connected"]["created"] -= 10000
        with patch.object(server, "PENDING_SESSION_LIMIT", 1):
            response = await self.client.post("/api/challenge", json={"provider": "academia"})
            self.assertEqual(response.status_code, 200)
            self.assertNotIn("unfinished", server.sessions)
            self.assertIn("connected", server.sessions)
            self.client.cookies.clear()
            blocked = await self.client.post("/api/challenge", json={"provider": "academia"})
            self.assertEqual(blocked.status_code, 503)
            self.assertEqual(blocked.json()["error"]["code"], "CAPACITY")
            self.assertTrue(blocked.json()["error"]["retryable"])
            status = await self.client.get("/api/session", headers={"cookie": f"{server.cookie_name}=connected"})
            self.assertTrue(status.json()["authenticated"])

    async def test_failed_upstream_challenge_reuses_pending_session_without_auto_retry(self):
        with patch.object(server, "invoke", new_callable=AsyncMock, return_value=(httpx.Response(502), {})) as work:
            first = await self.client.post("/api/challenge", json={"provider": "portal"})
            token = self.client.cookies.get(server.cookie_name)
            second = await self.client.post("/api/challenge", json={"provider": "portal"})
        self.assertTrue(token)
        self.assertEqual((first.status_code, second.status_code), (502, 502))
        self.assertNotIn("retryable", first.json()["error"])
        self.assertEqual(self.client.cookies.get(server.cookie_name), token)
        self.assertEqual(len(server.sessions), 1)
        self.assertEqual(work.await_count, 2)

    async def test_abandoned_reconnection_challenge_expires_without_dropping_account(self):
        from types import SimpleNamespace
        self.seed("connected")
        entry = server.sessions["connected"]
        entry.update({"providers": {"academia": {}}, "digest": "stale-code",
                      "challenge_at": server.time.monotonic() - server.PENDING_SESSION_SECONDS - 1})
        client = SimpleNamespace(aclose=AsyncMock())
        server.upstream._portal_captcha_sessions["stale-code"] = SimpleNamespace(client=client)
        response = await self.client.get("/api/session", headers={"cookie": f"{server.cookie_name}=connected"})
        self.assertTrue(response.json()["authenticated"])
        self.assertNotIn("stale-code", server.upstream._portal_captcha_sessions)
        self.assertNotIn("digest", entry)
        client.aclose.assert_awaited_once()
