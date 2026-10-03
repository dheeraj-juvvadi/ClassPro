import unittest
from unittest.mock import patch
import httpx
from test_server import DiagnosticTests
from provider_flow import combined, same_student
from provider_flow import refresh


class ProviderFlowTests(DiagnosticTests):
    def test_credits_survive_provider_merge_with_blank_portal_metadata(self):
        entry = {"providers": {
            "academia": {"report": {"courses": {"CS1": {"credits": "4", "title": "Course"}}}},
            "portal": {"report": {"courses": {"CS1": {"credits": "", "room": "R1"}},
                                    "marks": {"data": [{"code": "CS1", "scored": 42, "total": 60}]}}},
        }}
        result = combined(entry)
        self.assertEqual(result["marks"]["data"][0]["credits"], "4")
        self.assertEqual(result["courses"]["CS1"]["room"], "R1")
        self.assertEqual(entry["providers"]["academia"]["report"]["courses"]["CS1"], {"credits": "4", "title": "Course"})

    async def test_remembered_session_survives_hours_and_refreshes_cookie(self):
        import server
        import time
        server.sessions["remembered"] = {"created": time.monotonic() - 6 * 3600,
            "last_seen": time.time() - 6 * 3600, "remember": True,
            "providers": {"portal": {"cookies": {"session": "synthetic"}}}}
        self.client.cookies.set(server.cookie_name, "remembered")
        response = await self.client.get("/api/session")
        self.assertTrue(response.json()["authenticated"])
        self.assertIn("Max-Age=604800", response.headers["set-cookie"])
        server.sessions["remembered"]["last_seen"] = time.time() - 8 * 24 * 3600
        response = await self.client.get("/api/session")
        self.assertFalse(response.json()["authenticated"])

    async def test_unremembered_session_expires_after_inactivity(self):
        import server
        import time
        server.sessions["temporary"] = {"created": time.monotonic(), "remember": False,
            "last_seen": time.time() - 1900, "providers": {"portal": {"cookies": {}}}}
        self.client.cookies.set(server.cookie_name, "temporary")
        self.assertFalse((await self.client.get("/api/session")).json()["authenticated"])

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
            entry["synced_at"] = 0
            calls.clear()
            await self.client.get("/api/reports?force=1")
            await server.asyncio.wait_for(server.app.state.refresh_queue.queue.join(), 1)
            result = (await self.client.get("/api/reports?cache=only")).json()
            self.assertEqual(result["scheduleProvider"], "academia")
            self.assertEqual(result["schedule"]["entries"][0]["title"], "Course")
            self.assertEqual(result["attendance"]["data"][0]["present"], 17)
            self.assertEqual(len(calls), 2)
            refreshes = dict(calls)
            self.assertEqual(refreshes["/portal/refresh"]["cookies"], {"session": "portal"})
            self.assertEqual(refreshes["/refresh"]["cookies"], {"session": "academia"})
            self.assertNotIn("synthetic", str(result))

    def test_cross_student_connection_rejected(self):
        states = {"academia": {"report": {"profile": {"regNo": "ONE"}}}}
        self.assertFalse(same_student(states, "portal", {"profile": {"regNo": "TWO"}}, "student"))

    async def test_restart_recovers_persisted_session_with_cookies_only(self):
        import tempfile
        import time
        from session_store import SessionStore

        with tempfile.TemporaryDirectory() as directory:
            store = SessionStore(directory)
            entry = {"remember": True, "last_seen": time.time(), "created": time.monotonic(),
                     "providers": {"portal": {"username": "student", "password": "private",
                                              "cookies": {"session": "cookie-1"},
                                              "report": {"attendance": {"data": [
                                                  {"code": "CS1", "present": 9}]}}}}}
            store.save({"token-1": entry})
            restored = SessionStore(directory).load()
            self.assertIn("token-1", restored)
            calls = []

            async def invoke(request, path, payload):
                calls.append((path, dict(payload)))
                if "password" not in payload:
                    return httpx.Response(401), {}
                return httpx.Response(200), {"success": True, "cookies": {"session": "cookie-2"}}

            state = restored["token-1"]["providers"]["portal"]
            result, succeeded = await refresh(None, restored["token-1"], invoke, lambda data, previous: previous or data)
            self.assertFalse(state["expired"])
            self.assertEqual(state["cookies"], {"session": "cookie-2"})
            self.assertEqual(calls[0][1].get("cookies"), {"session": "cookie-1"})
            self.assertNotIn("password", calls[0][1])
            self.assertEqual(calls[1][1].get("cookies"), {"session": "cookie-1"})
            self.assertEqual(calls[1][1].get("password"), "private")
            self.assertTrue(succeeded)
            self.assertEqual(result["connections"]["portal"]["connected"], True)
            self.assertNotIn("private", str(result))
            store.save(restored)
            self.assertEqual(set(SessionStore(directory).load()), {"token-1"})

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
