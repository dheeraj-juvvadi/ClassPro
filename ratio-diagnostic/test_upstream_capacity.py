"""Exercise the real embedded routes with fake SRM clients and no network."""
import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import httpx
import server
from core import portal_client


class EmbeddedCapacityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.upstream = server.upstream
        self.upstream._portal_captcha_sessions.clear()
        self.upstream._portal_captcha_inflight = 0
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.upstream.app),
                                        base_url="http://ratio-internal")

    async def asyncTearDown(self):
        await self.client.aclose()
        self.upstream._portal_captcha_sessions.clear()
        self.assertEqual(self.upstream._portal_captcha_inflight, 0)

    async def test_fifty_real_captcha_routes_preserve_every_issued_challenge(self):
        created = []

        class FakeSession:
            def __init__(self):
                self.client = SimpleNamespace(aclose=AsyncMock())
                created.append(self)

            async def load_captcha(self):
                await asyncio.sleep(.001)
                return {"captcha_image": "data:image/png;base64,c3ludGhldGlj"}

        with patch.object(self.upstream, "PortalSession", FakeSession):
            responses = await asyncio.gather(*(self.client.post("/portal/captcha", json={}) for _ in range(50)))
        self.assertEqual([r.status_code for r in responses], [200] * 50)
        self.assertEqual(len(self.upstream._portal_captcha_sessions), 50)
        self.assertEqual({r.json()["session"] for r in responses}, set(self.upstream._portal_captcha_sessions))
        self.assertTrue(all(s.client.aclose.await_count == 0 for s in created))

    async def test_captcha_reservations_bound_inflight_loads_without_eviction(self):
        entered, finish = asyncio.Event(), asyncio.Event()
        created = []

        class FakeSession:
            def __init__(self):
                self.client = SimpleNamespace(aclose=AsyncMock())
                created.append(self)

            async def load_captcha(self):
                entered.set()
                await finish.wait()
                return {"captcha_image": "data:image/png;base64,c3ludGhldGlj"}

        with patch.object(self.upstream, "PORTAL_CAPTCHA_LIMIT", 1), patch.object(self.upstream, "PortalSession", FakeSession):
            first = asyncio.create_task(self.client.post("/portal/captcha", json={}))
            try:
                await asyncio.wait_for(entered.wait(), 1)
                second = await self.client.post("/portal/captcha", json={})
                self.assertEqual(second.status_code, 503)
                self.assertEqual(second.json()["detail"], {"type": "CAPTCHA_CAPACITY"})
                self.assertEqual(len(created), 1)
            finally:
                finish.set()
                response = await first
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.upstream._portal_captcha_sessions), 1)
        created[0].client.aclose.assert_not_awaited()

    async def test_failed_captcha_load_releases_reservation_and_client(self):
        created = []

        class FailedSession:
            def __init__(self):
                self.client = SimpleNamespace(aclose=AsyncMock())
                created.append(self)

            async def load_captcha(self):
                raise httpx.ConnectError("synthetic failure")

        with patch.object(self.upstream, "PortalSession", FailedSession):
            response = await self.client.post("/portal/captcha", json={})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(len(self.upstream._portal_captcha_sessions), 0)
        created[0].client.aclose.assert_awaited_once()

    async def test_fifty_embedded_logins_reach_srm_adapter_without_shared_ip_limit(self):
        calls = []

        class FakeAcademia:
            def __init__(self, username, password, cookies):
                self.username = username

            async def authenticate(self, *args):
                calls.append(self.username)
                raise httpx.ConnectError("synthetic stop before external request")

        with patch.object(self.upstream, "AcademiaClient", FakeAcademia):
            responses = await asyncio.gather(*(self.client.post("/login",
                          json={"username": f"synthetic-{i}", "password": "test-only"}) for i in range(50)))
        self.assertEqual(len(calls), 50)
        self.assertEqual([r.status_code for r in responses], [503] * 50)


class SharedPoolTests(unittest.IsolatedAsyncioTestCase):
    async def test_closing_one_client_preserves_other_cookie_jar_and_shared_pool(self):
        class Transport(httpx.AsyncBaseTransport):
            def __init__(self):
                self.closed = 0
                self.cookies = []

            async def handle_async_request(self, request):
                if self.closed:
                    raise RuntimeError("pool closed")
                self.cookies.append(request.headers.get("cookie", ""))
                return httpx.Response(200, text="synthetic", request=request)

            async def aclose(self):
                self.closed += 1

        pool = Transport()
        with patch.object(portal_client, "_shared_transport", pool):
            first = portal_client.PortalClient({"JSESSIONID": "student-one"})
            second = portal_client.PortalClient({"JSESSIONID": "student-two"})
            await first.client.get("https://synthetic.invalid/")
            await first.client.aclose()
            self.assertEqual(pool.closed, 0)
            await second.client.get("https://synthetic.invalid/")
            await second.client.aclose()
            self.assertEqual(pool.cookies, ["JSESSIONID=student-one", "JSESSIONID=student-two"])
            self.assertEqual(pool.closed, 0)
            await portal_client.close_shared_transport()
            self.assertEqual(pool.closed, 1)
