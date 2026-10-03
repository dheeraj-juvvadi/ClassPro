import copy
import os
import time
import unittest
from unittest.mock import patch

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import httpx
from pydantic import ValidationError
from report_response import ReportResponse
import server


REPORT = {
    "attendance": {"data": [{"code": "SYN001", "title": "Café – अभ्यास",
                              "present": 31, "conducted": 40, "absent": 9,
                              "percentage": 77.5, "credits": "3.0"}]},
    "marks": {"data": [{"code": "SYN001", "scored": None, "total": None,
                         "components": [{"name": "Test 1", "scored": 0, "total": 10}]}]},
    "profile": {"name": "Synthetic 🧪", "currentCgpa": 8.25},
    "schedule": {"entries": [], "calendar": [], "timezone": "Asia/Kolkata"},
    "academicHistory": {"status": "unavailable", "stale": False},
    "warnings": [], "futureField": {"values": [True, False, None, "", 2 ** 80]},
}


class ReportResponseModelTests(unittest.TestCase):
    def test_plain_json_fields_are_preserved_without_coercion(self):
        import json
        response = ReportResponse.model_validate(REPORT)
        self.assertEqual(json.loads(response.model_dump_json()), REPORT)
        self.assertEqual(REPORT["attendance"]["data"][0]["credits"], "3.0")

    def test_nested_nonfinite_values_and_non_json_objects_fail(self):
        for value in (float("nan"), float("inf"), -float("inf"), b"bytes", object()):
            with self.subTest(value_type=type(value).__name__):
                with self.assertRaises(ValidationError):
                    ReportResponse.model_validate({"nested": [{"value": value}]})


class ReportResponseRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.report = copy.deepcopy(REPORT)
        self.entry = {"created": time.monotonic(), "last_seen": time.time(),
                      "remember": True, "synced_at": time.time(),
                      "report": self.report, "providers": {"portal": {"report": {}}}}
        for target in (
            patch.dict(server.sessions, {"synthetic": self.entry}, clear=True),
            patch.dict(server.rates, {}, clear=True),
            patch.object(server, "session_store", None),
            patch.object(server, "required_token", ""),
        ):
            target.start()
            self.addCleanup(target.stop)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
                                       base_url="http://localhost:8089",
                                       headers={"cookie": f"{server.cookie_name}=synthetic"})
        self.addAsyncCleanup(self.client.aclose)

    async def test_production_route_uses_rust_bytes_and_preserves_contract(self):
        with patch("fastapi.routing.jsonable_encoder", side_effect=AssertionError("slow path")):
            response = await self.client.get("/api/reports?cache=only")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("nextAt", body.pop("sync"))
        self.assertEqual(body, self.report)
        self.assertEqual(response.headers["content-type"], "application/json")
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertTrue(response.headers["x-request-id"])
        self.assertIn("HttpOnly", response.headers["set-cookie"])
        self.assertIn("SameSite=strict", response.headers["set-cookie"])
        self.assertEqual(self.report, REPORT)

    async def test_invalid_report_is_not_silently_converted_to_null(self):
        self.report["futureField"]["values"].append(float("nan"))
        response = await self.client.get("/api/reports?cache=only")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["error"]["code"], "PORTAL_UNAVAILABLE")

    async def test_session_error_bypasses_success_model(self):
        server.sessions.clear()
        response = await self.client.get("/api/reports?cache=only")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"]["code"], "SESSION_EXPIRED")
