import os
import unittest
from unittest.mock import patch

os.environ["APP_ORIGIN"] = "http://localhost:8089"
import httpx
import server


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

    async def test_real_upstream_asgi_route(self):
        response = await self.client.get("/health")
        self.assertEqual(response.json()["backend"], "ratio-diagnostic")
        response = await server.app.state.client.post("/portal/login", json={"username": "test"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "captcha required")
