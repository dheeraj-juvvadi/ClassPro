import base64
import hashlib
import json
import time
import unittest
from types import SimpleNamespace

import httpx
from deep_evidence import NetworkEvidence, form_evidence, integrity, submitted


class DeepEvidenceTests(unittest.TestCase):
    def test_integrity_exposes_only_match_flags(self):
        payload = {"account": " user@srmist.edu.in ", "password": " private+&秘密 ", "answer": "Abc123"}
        proof = {"nonce": "private-nonce"}
        for key, value in {"account": "user", "password": payload["password"], "answer": payload["answer"]}.items():
            proof[key] = hashlib.sha256((proof["nonce"] + "\n" + key + "\n" + value).encode()).hexdigest()
        payload["integrity"] = proof
        result = integrity(payload)
        self.assertTrue(all(result.values()))
        self.assertNotIn("private", json.dumps(result))
        payload["password"] += "changed"
        self.assertFalse(integrity(payload)["password_matches_browser"])

    def test_form_round_trip_and_token_structure(self):
        session = SimpleNamespace(domain_field_name="domain-private", captcha_field_name="captcha-private", random_delimiter="sep")
        encode = lambda value: base64.b64encode(value.encode()).decode()
        payload = {"username": " user@srmist.edu.in ", "password": " private+&秘密 ", "captcha": "secret-answer"}
        token = submitted.set(payload)
        try:
            request = httpx.Request("POST", "https://example.test/LoginServlet", data={
                "username": "user", "password": payload["password"], "captcha": payload["captcha"],
                "domain-private": encode("sp.srmist.edu.in"[::-1]), "captcha-private": encode("2sep3"),
                "fpPayload": encode(json.dumps({"ts": time.time() * 1000})), "telemetryPayload": encode("{}")})
            result = form_evidence(request, session)
            self.assertTrue(result["password_matches_received"])
            self.assertTrue(result["account_matches_received"])
            self.assertTrue(result["domain_token_correct"])
            self.assertTrue(result["interaction_token_valid"])
            self.assertNotIn("private", json.dumps(result))
            self.assertNotIn("secret-answer", json.dumps(result))
        finally:
            submitted.reset(token)

    def test_network_observation_redacts_headers_and_redirect_tokens(self):
        network = NetworkEvidence()
        request = httpx.Request("POST", "https://example.test/LoginServlet?token=private",
                                headers={"cookie": "JSESSIONID=private", "authorization": "private"})
        network.begin(request)
        response = httpx.Response(302, request=request, text="private student record",
                                  headers={"set-cookie": "JSESSIONID=private; HttpOnly; Secure; Path=/",
                                           "location": "/home?token=private", "x-secret": "private"})
        result = network.finish(response)
        self.assertTrue(result["redirect_same_host"])
        self.assertTrue(result["redirect_query_present"])
        self.assertTrue(result["cookie_updates"][0]["httponly"])
        self.assertNotIn("private", json.dumps(result))
        self.assertNotIn("student record", json.dumps(result))
