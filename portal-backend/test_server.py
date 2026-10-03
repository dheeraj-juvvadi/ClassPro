import os
import unittest
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

os.environ["APP_ORIGIN"] = "http://localhost:8089"
import httpx
import server


class DiagnosticTests(unittest.IsolatedAsyncioTestCase):
    async def test_session_and_backend_key_migrate_without_signout(self):
        entry = {"created": server.time.monotonic(), "last_seen": server.time.time(),
                 "remember": True, "providers": {"portal": {"report": {}}}}
        server.sessions["existing-user"] = entry
        with patch.object(server, "legacy_cookie_name", "previous_session"), \
             patch.object(server, "legacy_backend_header", "x-previous-key"), \
             patch.object(server, "required_token", "test-key"):
            response = await self.client.get("/api/session", headers={
                "cookie": "previous_session=existing-user", "x-previous-key": "test-key"})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["authenticated"])
            self.assertEqual(self.client.cookies.get(server.cookie_name), "existing-user")
            self.assertTrue(any("previous_session=\"\"" in value and "Max-Age=0" in value
                                for value in response.headers.get_list("set-cookie")))
            response = await self.client.get("/api/session", headers={"x-anon-key": "test-key"})
            self.assertTrue(response.json()["authenticated"])
            rejected = await self.client.get("/api/session", headers={"x-anon-key": "wrong"})
            self.assertEqual(rejected.status_code, 401)
            response = await self.client.delete("/api/session", headers={"x-anon-key": "test-key"})
            self.assertEqual(response.status_code, 200)
            self.assertNotIn("existing-user", server.sessions)

    async def test_client_events_are_bounded_private_and_do_not_touch_sessions(self):
        from client_logs import ClientLogStore
        with tempfile.TemporaryDirectory() as directory:
            store = ClientLogStore(directory)
            with patch.object(server.app.state, "client_logs", store):
                rejected = await self.client.post('/api/client-events', json={'events': []}, headers={'Origin': 'https://evil.test'})
                self.assertEqual(rejected.status_code, 403)
                malformed = await self.client.post('/api/client-events', json={'events': [{}] * 11})
                self.assertEqual(malformed.status_code, 400)
                server.rates['127.0.0.1'] = (server.time.monotonic(), server.RATE_PER_MINUTE)
                response = await self.client.post('/api/client-events', json={'events': [{
                    'kind': 'api_error', 'route': '/api/reports', 'status': 502,
                    'password': 'synthetic-secret', 'message': 'synthetic-secret'}]})
                self.assertEqual(response.status_code, 202)
                self.assertEqual(response.json()['accepted'], 1)
                self.assertNotIn('set-cookie', response.headers)
                self.assertEqual(len(server.sessions), 0)
                self.assertNotIn('synthetic-secret', next(Path(directory).glob('*.jsonl')).read_text())

    async def asyncSetUp(self):
        self.exam_patch = patch("server.refresh_exams", new_callable=AsyncMock,
                                return_value={"status": "pending", "entries": [], "stale": False})
        self.exam_patch.start()
        self.addCleanup(self.exam_patch.stop)
        server.sessions.clear()
        server.rates.clear()
        server.gate = server.asyncio.Semaphore(server.API_CONCURRENCY)
        server.waiters = 0
        server.admission_waiters = 0
        self.lifespan = server.lifespan(server.app)
        await self.lifespan.__aenter__()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
                                        base_url="http://localhost:8089",
                                        headers={"Origin": "http://localhost:8089"})

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.lifespan.__aexit__(None, None, None)

    async def test_login_report_logout_contract(self):
        async def invoke(request, path, payload):
            if path == "/portal/captcha":
                return httpx.Response(200), {"session": "digest", "captcha_image": "data:image/png;base64,test"}
            self.assertEqual(payload["password"], " unchanged+& ")
            self.assertEqual(payload["cdigest"], "digest")
            return httpx.Response(200), {"success": True, "cookies": {"JSESSIONID": "secret"},
                                         "attendance": [{"code": "COURSE1", "present": 9, "conducted": 10}],
                                         "marks": [{"courseCode": "COURSE1", "totalMarkGot": 9,
                                                    "totalMaxMarks": 10, "assessments": []}]}
        with patch("server.invoke", side_effect=invoke):
            response = await self.client.post("/api/challenge", json={"provider": "portal"})
            self.assertEqual(response.status_code, 200)
            before = self.client.cookies.get(server.cookie_name)
            response = await self.client.post("/api/login/client", json={"account": "user", "password": " unchanged+& "})
            self.assertTrue(response.json()["authenticated"])
            self.assertNotEqual(before, self.client.cookies.get(server.cookie_name))
            self.assertNotIn("secret", response.text)
            if server.session_store:
                self.assertEqual(set(server.session_store.load()), {self.client.cookies.get(server.cookie_name)})
            response = await self.client.get("/api/reports")
            self.assertEqual(response.json()["marks"]["data"][0]["scored"], 9)
            self.assertNotIn("cookies", response.text)
            await self.client.delete("/api/session")
            self.assertFalse((await self.client.get("/api/session")).json()["authenticated"])

    async def test_persistence_follows_rotated_token_and_logout(self):
        from session_store import SessionStore
        with tempfile.TemporaryDirectory() as directory:
            store = SessionStore(directory)
            with patch.object(server, "session_store", store):
                await self.test_login_report_logout_contract()
                self.assertEqual(store.load(), {})

    async def test_queued_refresh_deduplicates_and_cached_reads_stay_available(self):
        import asyncio
        from unittest.mock import AsyncMock
        entry = {"created": server.time.monotonic(), "last_seen": server.time.time(),
                 "providers": {"portal": {"report": {}}}, "report": {}}
        server.sessions["burst-user"] = entry
        self.client.cookies.set(server.cookie_name, "burst-user")
        started, finish = asyncio.Event(), asyncio.Event()
        async def refresh(*args):
            started.set()
            await finish.wait()
            return {"updatedAt": "synthetic"}, True
        with patch.object(server, "refresh_providers", side_effect=refresh) as work:
            try:
                first = await self.client.get("/api/reports?force=1")
                self.assertTrue(first.json()["sync"]["pending"])
                await asyncio.wait_for(started.wait(), 1)
                second = await self.client.get("/api/reports?force=1")
                self.assertTrue(second.json()["sync"]["pending"])
                self.assertTrue((await self.client.get("/api/session")).json()["authenticated"])
                self.assertEqual(work.call_count, 1)
                exam_refresh = work.call_args.args[4]
                self.assertIs(exam_refresh.func, server.refresh_exams)
                self.assertEqual(exam_refresh.keywords, {"force": True})
            finally:
                finish.set()
                await server.app.state.refresh_queue.queue.join()
            result = await self.client.get("/api/reports?cache=only")
            self.assertNotIn("pending", result.json()["sync"])
            self.assertEqual(result.json()["updatedAt"], "synthetic")

    async def test_memory_pressure_blocks_new_work_but_preserves_session_reads(self):
        with patch.object(server, "can_admit", return_value=False):
            response = await self.client.post("/api/challenge", json={"provider": "academia"})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(len(server.sessions), 0)
            self.assertEqual((await self.client.get("/api/session")).status_code, 200)

    async def test_fast_sync_response_returns_finished_records_without_poll_delay(self):
        entry = {"created": server.time.monotonic(), "last_seen": server.time.time(),
                 "providers": {"portal": {"report": {}}}, "report": {}}
        server.sessions["quick-sync"] = entry
        self.client.cookies.set(server.cookie_name, "quick-sync")
        async def refresh(*args):
            await server.asyncio.sleep(0.02)
            return {"updatedAt": "fresh"}, True
        with patch.object(server, "refresh_providers", side_effect=refresh) as work:
            response = await self.client.get('/api/reports?force=1&wait=1')
        self.assertEqual(response.json()['updatedAt'], 'fresh')
        self.assertNotIn('pending', response.json()['sync'])
        self.assertEqual(work.call_count, 1)
        self.assertEqual(server.refresh_response_waiters, 0)

    async def test_brief_wait_timeout_keeps_shared_refresh_running(self):
        entry = {"created": server.time.monotonic(), "last_seen": server.time.time(),
                 "providers": {"portal": {"report": {}}}, "report": {}}
        server.sessions["slow-sync"] = entry
        self.client.cookies.set(server.cookie_name, "slow-sync")
        finish = server.asyncio.Event()
        async def refresh(*args):
            await finish.wait()
            return {"updatedAt": "finished"}, True
        with patch.object(server, "refresh_providers", side_effect=refresh) as work, patch.object(server, "REFRESH_RESPONSE_WAIT", 0.02):
            try:
                response = await self.client.get('/api/reports?force=1&wait=1')
                self.assertTrue(response.json()['sync']['pending'])
                self.assertLessEqual(response.json()['sync']['nextAt'] - server.time.time() * 1000, 350)
                job = server.app.state.refresh_queue.jobs['slow-sync']
                self.assertFalse(job.done())
                self.assertEqual(server.refresh_response_waiters, 0)
                await self.client.get('/api/reports?cache=only')
                self.assertEqual(work.call_count, 1)
            finally:
                finish.set()
                await server.app.state.refresh_queue.queue.join()
            result = await self.client.get('/api/reports?cache=only')
            self.assertEqual(result.json()['updatedAt'], 'finished')

    async def test_boundary(self):
        response = await self.client.post("/api/challenge", json={}, headers={"origin": "https://evil.test"})
        self.assertEqual(response.status_code, 403)
        response = await self.client.post("/api/challenge", content=b"x" * 8193,
                                          headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 413)

    async def test_static_assets_bypass_api_gate_and_rate_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "style.css").write_text("body { color: white; }")
            server.app.mount("/test-assets", server.StaticFiles(directory=directory))
            try:
                for _ in range(server.API_CONCURRENCY):
                    await server.gate.acquire()
                server.rates["bootstrap:127.0.0.1"] = (server.time.monotonic(), server.BOOTSTRAP_PER_MINUTE)
                response = await self.client.get("/test-assets/style.css")
                self.assertEqual(response.status_code, 200)
                self.assertIn("text/css", response.headers["content-type"])
                response = await self.client.get("/api/session")
                self.assertEqual(response.status_code, 429)
                server.rates.clear()
                response = await self.client.get("/api/session")
                self.assertEqual(response.status_code, 200)
                server.waiters = server.API_QUEUE
                response = await self.client.get("/api/session")
                self.assertEqual(response.status_code, 200)
                server.waiters = 0
            finally:
                for _ in range(server.API_CONCURRENCY):
                    server.gate.release()
                server.app.router.routes.pop()

    async def test_real_upstream_asgi_route(self):
        response = await self.client.get("/health")
        self.assertEqual(response.json()["backend"], "anon")
        response = await server.app.state.client.post("/portal/login", json={"username": "test"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "captcha required")
