import os
import unittest
from urllib.parse import parse_qs
from unittest.mock import patch

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import httpx
import server
from core.portal_client import PortalClient, TIMETABLE_URL


TIMETABLE = """<table><thead><tr><th>Day</th><th>08:00 - 08:50</th>
</tr></thead><tbody><tr><td>Day 1</td><td>CS101</td></tr></tbody></table>"""


class TimetableRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_portal_request_matches_ratio_url_method_form_and_cookies(self):
        async def transport(request):
            self.assertEqual(str(request.url),
                             "https://sp.srmist.edu.in/srmiststudentportal/students/report/studentTimeTableDetails.jsp")
            self.assertEqual(request.method, "POST")
            self.assertEqual(parse_qs(request.content.decode(), keep_blank_values=True),
                             {"iden": ["10"], "filter": [""], "hdnFormDetails": ["1"],
                              "csrfPreventionSalt": [""]})
            self.assertIn("JSESSIONID=synthetic", request.headers["cookie"])
            return httpx.Response(200, text=TIMETABLE)

        portal = PortalClient()
        await portal.client.aclose()
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport),
                                     cookies={"JSESSIONID": "synthetic"}) as client:
            portal.client = client
            self.assertEqual(await portal.get_timetable_html(), TIMETABLE)

    async def test_public_reports_reaches_refresh_and_maps_timetable(self):
        requests = []

        class FakePortal:
            def __init__(self, cookies):
                self.client = httpx.AsyncClient(cookies=cookies)
                requests.append(self)

            async def keepalive(self):
                pass

            async def get_attendance_html(self):
                return "<table></table>"

            async def get_marks_data(self):
                return []

            async def get_timetable_html(self):
                return TIMETABLE

            async def get_profile_html(self):
                return None

        server.sessions.clear()
        server.rates.clear()
        server.sessions["synthetic"] = {"created": server.time.monotonic(),
                                        "cookies": {"JSESSIONID": "synthetic"}, "cached": 0}
        try:
            async with server.lifespan(server.app):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
                                             base_url="http://localhost:8089",
                                             cookies={server.cookie_name: "synthetic"}) as client:
                    with patch.object(server.upstream, "PortalClient", FakePortal):
                        response = await client.get("/api/reports")
                self.assertEqual(response.status_code, 200)
                entry = response.json()["schedule"]["entries"][0]
                self.assertEqual((entry["code"], entry["dayOrder"], entry["start"], entry["hours"]),
                                 ("CS101", "1", "08:00", 1))
                self.assertEqual(len(requests), 1)
        finally:
            for portal in requests:
                await portal.client.aclose()
            server.sessions.clear()
