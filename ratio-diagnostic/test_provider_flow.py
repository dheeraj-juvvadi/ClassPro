import unittest
from unittest.mock import patch
import httpx
from test_server import DiagnosticTests
from provider_flow import combined, same_student


class ProviderFlowTests(DiagnosticTests):
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
