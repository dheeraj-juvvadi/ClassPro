import asyncio
import os
import time
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import httpx
import server


class CompletionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        server.sessions.clear()
        server.rates.clear()
        self.lifecycle = server.lifespan(server.app)
        await self.lifecycle.__aenter__()
        self.entry = {"created": time.monotonic(), "last_seen": time.time(),
            "providers": {"portal": {"cookies": {"JSESSIONID": "synthetic"}, "report": {}}},
            "report": {"updatedAt": "saved"}}
        server.sessions["synthetic"] = self.entry
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
            base_url="http://localhost:8089", headers={"cookie": "anon_session=synthetic"})

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.lifecycle.__aexit__(None, None, None)

    async def test_cache_followup_returns_completion_without_starting_another_job(self):
        finish = asyncio.Event()

        async def refresh(*args):
            await finish.wait()
            return {"updatedAt": "fresh"}, True

        with patch.object(server, "refresh_providers", side_effect=refresh) as work:
            response = await self.client.get("/api/reports?force=1")
            self.assertTrue(response.json()["sync"]["waitForCompletion"])
            followup = asyncio.create_task(self.client.get("/api/reports?cache=only&wait=1"))
            try:
                for _ in range(100):
                    if server.refresh_response_waiters:
                        break
                    await asyncio.sleep(.001)
                self.assertEqual(server.refresh_response_waiters, 1)
                self.assertFalse(followup.done())
                cached = await self.client.get("/api/reports?cache=only")
                self.assertEqual(cached.json()["updatedAt"], "saved")
                finish.set()
                response = await asyncio.wait_for(followup, .5)
                self.assertEqual(response.json()["updatedAt"], "fresh")
                self.assertNotIn("pending", response.json()["sync"])
                work.assert_awaited_once()
            finally:
                finish.set()
                await asyncio.gather(followup, return_exceptions=True)
        self.assertEqual(server.refresh_response_waiters, 0)

    async def test_disconnected_waiter_does_not_cancel_refresh(self):
        finish = asyncio.Event()

        async def refresh(*args):
            await finish.wait()
            return {"updatedAt": "fresh"}, True

        with patch.object(server, "refresh_providers", side_effect=refresh):
            await self.client.get("/api/reports?force=1")
            request = asyncio.create_task(self.client.get("/api/reports?cache=only&wait=1"))
            try:
                for _ in range(100):
                    if server.refresh_response_waiters:
                        break
                    await asyncio.sleep(.001)
                request.cancel()
                await asyncio.gather(request, return_exceptions=True)
                self.assertFalse(server.app.state.refresh_queue.jobs["synthetic"].cancelled())
                finish.set()
                await asyncio.wait_for(server.app.state.refresh_queue.queue.join(), .5)
                result = await self.client.get("/api/reports?cache=only")
                self.assertEqual(result.json()["updatedAt"], "fresh")
            finally:
                finish.set()
        self.assertEqual(server.refresh_response_waiters, 0)

    async def test_exams_are_not_fetched_on_login_or_general_sync(self):
        async def invoke(request, path, payload):
            return httpx.Response(200), {"success": True, "cookies": {"JSESSIONID": "new"},
                "attendance": [{"code": "SYN001", "conducted": 10, "absent": 1}]}

        self.entry.update(digest="synthetic", pending_provider="portal")
        with patch.object(server, "refresh_exams", new_callable=AsyncMock) as exams, \
             patch("portal_exams.PortalClient", side_effect=AssertionError("retired exam fetch")), \
             patch.object(server, "invoke", side_effect=invoke):
            response = await self.client.post("/api/login/client", headers={"Origin": server.origin},
                json={"provider": "portal", "account": "synthetic", "password": "test-only"})
            self.assertEqual(response.status_code, 200)
            token = next(iter(server.sessions))
            response = await self.client.get("/api/reports?force=1&wait=1", headers={"cookie": f"anon_session={token}"})
            self.assertEqual(response.status_code, 200)
            self.assertNotIn("exams", response.json())
            exams.assert_not_awaited()

    async def test_exam_waiters_do_not_occupy_workers_or_block_cached_reports(self):
        lock = server.session_locks.setdefault("synthetic", asyncio.Lock())
        await lock.acquire()
        try:
            with patch.object(server, "QUEUE_WAIT", .05), \
                 patch.object(server, "refresh_exams", new_callable=AsyncMock) as fetch:
                pending = asyncio.create_task(self.client.get("/api/exams"))
                async with asyncio.timeout(1):
                    while not server.admission_waiters:
                        await asyncio.sleep(.001)
                self.assertEqual(server.gate._value, server.API_CONCURRENCY)
                cached = await self.client.get("/api/reports?cache=only")
                self.assertEqual(cached.status_code, 200)
                self.assertEqual((await pending).status_code, 503)
                fetch.assert_not_awaited()
        finally:
            lock.release()

    async def test_logout_during_completion_wait_does_not_return_private_report(self):
        finish = asyncio.Event()

        async def refresh(*args):
            await finish.wait()
            return {"profile": {"name": "private-synthetic"}}, True

        with patch.object(server, "refresh_providers", side_effect=refresh):
            await self.client.get("/api/reports?force=1")
            waiting = asyncio.create_task(self.client.get("/api/reports?cache=only&wait=1"))
            try:
                for _ in range(100):
                    if server.refresh_response_waiters:
                        break
                    await asyncio.sleep(.001)
                server.sessions.pop("synthetic")
                finish.set()
                response = await asyncio.wait_for(waiting, .5)
                self.assertEqual(response.status_code, 401)
                self.assertNotIn("private-synthetic", response.text)
            finally:
                finish.set()
                await asyncio.gather(waiting, return_exceptions=True)

    async def test_completion_wait_limit_keeps_cache_reads_immediate(self):
        finish = asyncio.Event()

        async def refresh(*args):
            await finish.wait()
            return {}, True

        with patch.object(server, "refresh_providers", side_effect=refresh):
            await self.client.get("/api/reports?force=1")
            try:
                with patch.object(server, "refresh_response_waiters", server.REFRESH_CONCURRENCY):
                    response = await asyncio.wait_for(
                        self.client.get("/api/reports?cache=only&wait=1"), .5)
                self.assertTrue(response.json()["sync"]["pending"])
                self.assertFalse(response.json()["sync"]["waitForCompletion"])
            finally:
                finish.set()
