import os
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

os.environ["APP_ORIGIN"] = "http://localhost:8089"
import httpx
import server
from observe import events, instrument
from core.portal_client import PortalSession


class DiagnosticTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        server.sessions.clear()
        server.rates.clear()
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
            response = await self.client.get("/api/reports")
            self.assertEqual(response.json()["marks"]["data"][0]["scored"], 9)
            self.assertNotIn("cookies", response.text)
            await self.client.delete("/api/session")
            self.assertFalse((await self.client.get("/api/session")).json()["authenticated"])

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
                await server.gate.acquire()
                server.rates["127.0.0.1"] = (server.time.monotonic(), 30)
                response = await self.client.get("/test-assets/style.css")
                self.assertEqual(response.status_code, 200)
                self.assertIn("text/css", response.headers["content-type"])
                response = await self.client.get("/api/session")
                self.assertEqual(response.status_code, 429)
                server.rates.clear()
                response = await self.client.get("/api/session")
                self.assertEqual(response.status_code, 503)
            finally:
                server.gate.release()
                server.app.router.routes.pop()

    async def test_real_upstream_asgi_route(self):
        response = await self.client.get("/health")
        self.assertEqual(response.json()["backend"], "ratio-diagnostic")
        response = await server.app.state.client.post("/portal/login", json={"username": "test"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "captcha required")

    async def test_observer_never_changes_response_or_exposes_secrets(self):
        session = instrument(PortalSession)()
        captured = []
        token = events.set(captured)
        try:
            body = '<script>const hint="invalid captcha";</script><div role="alert">Invalid credentials</div>'
            response = httpx.Response(200, text=body,
                                      request=httpx.Request("POST", "https://portal.test/LoginServlet"))
            await session.observe_response(response)
            self.assertEqual(response.text, body)
            self.assertEqual(captured[-1]["alert_classification"], "credentials_rejected")
            self.assertNotIn("hint", str(captured))
        finally:
            events.reset(token)
            await session.client.aclose()
