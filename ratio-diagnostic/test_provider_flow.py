import unittest
from unittest.mock import patch
import httpx
from test_server import DiagnosticTests
from provider_flow import combined, same_student
from provider_flow import refresh


class ProviderFlowTests(DiagnosticTests):
    async def test_academia_login_returns_captcha_challenge(self):
        import server
        from unittest.mock import AsyncMock
        challenge = '{"type":"CAPTCHA_REQUIRED","cdigest":"synthetic","image":"https://academia.srmist.edu.in/captcha"}'
        with patch.object(server.upstream.AcademiaClient, "authenticate", AsyncMock(side_effect=Exception(challenge))):
            response = await server.app.state.client.post("/login", json={"username": "synthetic", "password": "synthetic"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"]["type"], "CAPTCHA_REQUIRED")

    async def test_academia_then_portal_preserves_timetable_and_separate_cookies(self):
        calls = []

        async def invoke(request, path, payload):
            calls.append((path, payload))
            if path == "/portal/captcha":
                return httpx.Response(200), {"session": "digest", "captcha_image": "data:image/png;base64,test"}
            academia = path in {"/login", "/refresh"}
            data = {"success": True, "cookies": {"session": "academia" if academia else "portal"},
                    "profile": {"regNo": "STUDENT1"},
                    "attendance": [{"code": "CS1", "title": "Course", "conducted": 20,
                                    "absent": 2 if academia else 3}]}
            if academia:
                data.update({"schedule": {"Day 1": {"08:00 - 08:50": {"code": "CS1", "course": "Course"}}},
                             "courses": {"A": {"code": "CS1", "faculty": "Faculty"}}})
            return httpx.Response(200), data

        import server
        with patch("server.invoke", side_effect=invoke):
            result = await self.client.post("/api/challenge", json={"provider": "academia"})
            self.assertFalse(result.json()["required"])
            result = await self.client.post("/api/login/client", json={"provider": "academia", "account": "student", "password": "synthetic"})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(calls[-1][1]["username"], "student@srmist.edu.in")
            await self.client.post("/api/challenge", json={"provider": "portal"})
            result = await self.client.post("/api/login/client", json={"provider": "portal", "account": "student", "password": "synthetic2"})
            self.assertEqual(result.status_code, 200)
            entry = next(iter(server.sessions.values()))
            entry["cached"] = 0
            result = (await self.client.get("/api/reports")).json()
            self.assertEqual(result["scheduleProvider"], "academia")
            self.assertEqual(result["schedule"]["entries"][0]["title"], "Course")
            self.assertEqual(result["attendance"]["data"][0]["present"], 17)
            self.assertEqual(calls[-2][0], "/portal/refresh")
            self.assertEqual(calls[-1][0], "/refresh")
            self.assertEqual(calls[-1][1]["cookies"], {"session": "academia"})
            self.assertNotIn("synthetic", str(result))

    def test_cross_student_connection_rejected(self):
        states = {"academia": {"report": {"profile": {"regNo": "ONE"}}}}
        self.assertFalse(same_student(states, "portal", {"profile": {"regNo": "TWO"}}, "student"))

    async def test_expiry_retries_credentials_and_keeps_other_provider_report(self):
        calls = []
        entry = {"providers": {
            "academia": {"username": "student", "password": "private", "cookies": {},
                         "report": {"schedule": {"entries": [{"code": "CS1"}]}}},
            "portal": {"username": "student", "password": "private", "cookies": {},
                       "report": {"attendance": {"data": [{"code": "CS1", "present": 10}]}}}}}

        async def invoke(request, path, payload):
            calls.append((path, dict(payload)))
            if path == "/portal/refresh":
                return httpx.Response(503), {}
            if "password" not in payload:
                return httpx.Response(401), {}
            return httpx.Response(200), {"success": True, "cookies": {"new": "cookie"}}

        result, success = await refresh(None, entry, invoke, lambda data, previous: previous)
        self.assertTrue(success)
        self.assertEqual(calls[-1][1]["password"], "private")
        self.assertEqual(result["attendance"]["data"][0]["present"], 10)
        self.assertEqual(result["scheduleProvider"], "academia")
        self.assertTrue(result["warnings"])
        self.assertNotIn("private", str(result))
