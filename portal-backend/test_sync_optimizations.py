import asyncio
import os
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import httpx
import server
from core import portal_client
from provider_flow import refresh


class SyncOptimizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_cookie_expiry_is_checked_once_before_explicit_recovery(self):
        calls = []
        entry = {"providers": {"portal": {"username": "synthetic", "password": "test-only",
                 "cookies": {"JSESSIONID": "old"}, "report": {}}}}

        async def invoke(request, path, payload):
            calls.append(dict(payload))
            if len(calls) == 1:
                return httpx.Response(401), {}
            self.assertIs(payload["reauthenticate"], True)
            return httpx.Response(200), {"success": True, "cookies": {"JSESSIONID": "new"}}

        _, succeeded = await refresh(None, entry, invoke, lambda data, previous: {})
        self.assertTrue(succeeded)
        self.assertEqual(len(calls), 2)
        self.assertNotIn("password", calls[0])
        self.assertNotIn("reauthenticate", calls[0])
        self.assertEqual(calls[1]["password"], "test-only")

    async def test_verified_login_attendance_is_reused_only_for_that_report_load(self):
        calls = []
        html = "<table><tr><td>SYN001</td><td>Synthetic</td></tr></table>"

        async def respond(request):
            calls.append(request.url)
            return httpx.Response(200, text=html)

        with patch.object(portal_client, "_shared_transport", httpx.MockTransport(respond)):
            login = portal_client.PortalSession()
            login.captcha_page = "synthetic login form"
            login.domain_field_name, login.captcha_field_name = "domain", "challenge"
            try:
                result = await login.login("synthetic", "test-only", "CODE")
                self.assertTrue(result["ok"])
                self.assertEqual(login.authenticated_attendance, html)
                client = portal_client.PortalClient(result["cookies"])
                try:
                    client.seed_attendance(login.authenticated_attendance)
                    self.assertEqual(await client.get_attendance_html(), html)
                    self.assertEqual(await client.get_attendance_html(), html)
                    self.assertEqual(len(calls), 2, "only login POST and verification GET")
                finally:
                    await client.client.aclose()
                later = portal_client.PortalClient(result["cookies"])
                try:
                    await later.get_attendance_html()
                    self.assertEqual(len(calls), 3, "a later sync must fetch fresh data")
                finally:
                    await later.client.aclose()
            finally:
                await login.client.aclose()

    async def test_rejected_or_oversized_attendance_is_not_seeded(self):
        with patch.object(portal_client, "_shared_transport", httpx.MockTransport(
                lambda request: httpx.Response(200, text="fresh"))):
            for html in (None, "", '<form id="login_form">', "x" * (512 * 1024 + 1)):
                client = portal_client.PortalClient()
                try:
                    client.seed_attendance(html)
                    self.assertFalse(hasattr(client, "_attendance_task"))
                    self.assertEqual(await client.get_attendance_html(), "fresh")
                finally:
                    await client.client.aclose()

    async def test_portal_recovery_skips_the_second_expired_report_fanout(self):
        events = []

        class FakePortal:
            def __init__(self, cookies):
                self.cookies = cookies
                self.client = SimpleNamespace(aclose=AsyncMock(), cookies=httpx.Cookies(cookies))

            def seed_attendance(self, html):
                events.append("seed")

            async def get_attendance_html(self):
                events.append("attendance:" + self.cookies["JSESSIONID"])
                return "<table></table>"

            async def get_marks_data(self):
                events.append("marks")
                return []

            async def get_timetable_html(self):
                events.append("timetable")

            async def get_profile_html(self):
                events.append("profile")

            async def get_academic_history(self):
                events.append("history")
                return {"status": "unavailable"}

        async def login(*args):
            events.append("login")
            return {"ok": True, "cookies": {"JSESSIONID": "fresh"}}

        session = SimpleNamespace(client=SimpleNamespace(aclose=AsyncMock()),
            load_captcha=AsyncMock(), captcha_bytes=b"synthetic", login=login)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.upstream.app),
                                    base_url="http://portal-internal") as client:
            with patch.object(server.upstream, "PortalClient", FakePortal), \
                 patch.object(server.upstream, "PortalSession", return_value=session), \
                 patch.object(server.upstream, "solve_captcha_ocr_bytes", AsyncMock(return_value=(True, "CODE", 200))), \
                 patch.object(server.upstream.asyncio, "sleep", AsyncMock()):
                response = await client.post("/portal/refresh", json={"cookies": {"JSESSIONID": "old"},
                    "username": "synthetic", "password": "test-only", "reauthenticate": True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(events[0], "login")
        self.assertNotIn("attendance:old", events)
        self.assertEqual(events.count("attendance:fresh"), 1)
        self.assertEqual(events.count("marks"), 1)
        session.client.aclose.assert_awaited_once()

    async def test_academia_explicit_recovery_authenticates_before_reading_reports(self):
        events = []

        async def authenticate(*args):
            events.append("login")

        async def page(*args):
            events.append("report")
            return "<table></table>"

        fake = SimpleNamespace(authenticate=authenticate, get_profile_html=page,
            get_grid_html=page, get_attendance_html=page,
            session_handler=SimpleNamespace(client=SimpleNamespace(cookies=httpx.Cookies({"JSESSIONID": "new"}))))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.upstream.app),
                                    base_url="http://portal-internal") as client:
            with patch.object(server.upstream, "AcademiaClient", return_value=fake):
                response = await client.post("/refresh", json={"cookies": {"JSESSIONID": "old"},
                    "username": "synthetic", "password": "test-only", "reauthenticate": True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(events, ["login", "report", "report", "report", "report"])

    async def test_expired_attendance_cancels_slow_optional_reports_before_recovery(self):
        from core.portal_client import fetch_portal_reports
        running = asyncio.Event()
        stopped = []

        async def attendance():
            await running.wait()
            return None

        async def optional():
            running.set()
            try:
                await asyncio.Event().wait()
            finally:
                stopped.append(True)

        client = SimpleNamespace(get_attendance_html=attendance, get_marks_data=optional,
            get_timetable_html=optional, get_profile_html=optional, get_academic_history=optional)
        result = await asyncio.wait_for(fetch_portal_reports(client), .5)
        self.assertIsNone(result[0])
        self.assertEqual(len(stopped), 4, "all requests must stop before the client is reused")
