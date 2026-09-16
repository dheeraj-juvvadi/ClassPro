import base64
import json
import unittest
from types import SimpleNamespace

import httpx
from protocol_evidence import ProtocolEvidence


class ProtocolEvidenceTests(unittest.TestCase):
    def test_continuity_without_secret_disclosure(self):
        evidence = ProtocolEvidence()
        session = SimpleNamespace(nonce="private-nonce", domain_field_name="dynamic-domain",
                                  captcha_field_name="dynamic-captcha", random_delimiter="1234", load_ms=1)
        evidence.request(httpx.Request("GET", "https://portal.test/SCaptchaServlet",
                                      headers={"cookie": "JSESSIONID=private-cookie"}), session)
        fingerprint = base64.b64encode(json.dumps({"nonce": session.nonce}).encode()).decode()
        request = httpx.Request("POST", "https://portal.test/LoginServlet",
                                headers={"cookie": "JSESSIONID=private-cookie"},
                                data={"username": "private-account", "password": "private-password",
                                      "captcha": "private-answer", "fpPayload": fingerprint,
                                      "telemetryPayload": "e30=", "dynamic-domain": "secret",
                                      "dynamic-captcha": "secret"})
        result = evidence.request(request, session)
        self.assertTrue(result["captcha_cookie_matches"])
        self.assertTrue(result["fingerprint_nonce_matches"])
        self.assertTrue(result["dynamic_names_found"])
        self.assertNotIn("private", json.dumps(result))
        request.headers["cookie"] = "JSESSIONID=changed"
        self.assertFalse(evidence.request(request, session)["captcha_cookie_matches"])

    def test_absent_cookies_are_not_a_match(self):
        result = ProtocolEvidence().request(httpx.Request("GET", "https://portal.test/SCaptchaServlet"), None)
        self.assertFalse(result["captcha_cookie_matches"])
