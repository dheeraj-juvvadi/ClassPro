import base64
import hashlib
import json
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs

import httpx
from adapter import Adapter


class AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.adapter = Adapter()
        await self.adapter.session.client.aclose()
        self.requests = []
        self.login_result = "ok"

        async def handler(request):
            self.requests.append(request)
            path = request.url.path
            if path.endswith("youLogin.jsp"):
                return httpx.Response(200, text="""<input name='username'><input name='password'>
                <input name='captcha'><input id="fpNonce" value="nonce">
                <script>domainFieldName='domain_x';captchaFieldName='interaction_x';
                randomDelimiter='abcd';</script><img src='SCaptchaServlet'>""",
                                      headers={"Set-Cookie": "JSESSIONID=private; Path=/; Secure"})
            if path.endswith("SCaptchaServlet"):
                return httpx.Response(200, content=b"image")
            if path.endswith("LoginServlet"):
                return httpx.Response(200, text=self.login_result)
            return httpx.Response(200, text="attendance table" if self.login_result == "ok" else "login_form")

        self.adapter.session.client = httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                                       follow_redirects=True)

    async def asyncTearDown(self):
        await self.adapter.session.client.aclose()

    async def test_same_client_cookie_and_exact_password(self):
        client = self.adapter.session.client
        await self.adapter.call("challenge", {})
        result = await self.adapter.call("login", {"account": " user@srmist.edu.in ",
                                                   "password": " p+&秘密 ", "answer": "Ab12"})
        self.assertEqual(result["status"], 200)
        self.assertIs(client, self.adapter.session.client)
        submitted = next(request for request in self.requests if request.method == "POST")
        fields = parse_qs(submitted.content.decode())
        self.assertEqual(fields["username"], ["user"])
        self.assertEqual(fields["password"], [" p+&秘密 "])
        self.assertIn("JSESSIONID=private", submitted.headers["cookie"])
        telemetry = json.loads(base64.b64decode(fields["telemetryPayload"][0]))
        self.assertEqual(telemetry["timezoneOffset"], -330)
        self.assertEqual(sum(request.url.path.endswith("youLogin.jsp") for request in self.requests), 1)
        self.assertNotIn("private", json.dumps(result))

    async def test_automatic_wait_and_no_credential_retry(self):
        await self.adapter.call("challenge", {})
        self.login_result = "invalid credentials"
        with patch("adapter.solve", return_value="Ab12"), patch("adapter.asyncio.sleep", new_callable=AsyncMock) as delay:
            result = await self.adapter.call("login", {"account": "user", "password": "pass"})
        delay.assert_awaited_once_with(2)
        self.assertEqual(result["status"], 401)
        self.assertEqual(sum(request.method == "POST" for request in self.requests), 1)

    async def test_manual_never_runs_ocr(self):
        await self.adapter.call("challenge", {})
        with patch("adapter.solve", side_effect=AssertionError("must not run")):
            result = await self.adapter.call("login", {"account": "user", "password": "pass", "answer": "Ab12"})
        self.assertEqual(result["status"], 200)

    async def test_captcha_retries_are_bounded(self):
        await self.adapter.call("challenge", {})
        self.login_result = "invalid captcha"
        with patch("adapter.solve", return_value="Ab12"), patch("adapter.asyncio.sleep", new_callable=AsyncMock):
            result = await self.adapter.call("login", {"account": "user", "password": "pass"})
        self.assertEqual(result["body"]["error"]["code"], "CAPTCHA_INVALID")
        self.assertEqual(sum(request.method == "POST" for request in self.requests), 4)

    async def test_ocr_failure_never_submits_credentials(self):
        await self.adapter.call("challenge", {})
        with patch("adapter.solve", side_effect=ValueError("uncertain")):
            result = await self.adapter.call("login", {"account": "user", "password": "pass"})
        self.assertEqual(result["body"]["error"]["code"], "CAPTCHA_REQUIRED")
        self.assertFalse(any(request.method == "POST" for request in self.requests))

    def test_exact_upstream_source_except_final_newline(self):
        source = Path(__file__).parent / "core/portal_client.py"
        self.assertEqual(hashlib.sha256(source.read_bytes().rstrip(b"\n")).hexdigest(),
                         "bcab9e964884052e9bfd0297505c791b64f5850d9362ad1ac15d002152a50391")
