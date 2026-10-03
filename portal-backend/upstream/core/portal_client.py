import base64
import json
import random
import re
import time

import httpx
import asyncio
from services.portal_marks_service import PortalMarksService
from core.client_lifecycle import track, gather_complete

LOGIN_URL = "https://sp.srmist.edu.in/srmiststudentportal/students/loginManager/youLogin.jsp"
BASE_URL = "https://sp.srmist.edu.in/srmiststudentportal"
HRD_URL = BASE_URL + "/students/template/HRDSystem.jsp"
ATT_URL = BASE_URL + "/students/report/studentAttendanceDetails.jsp"
MARKS_URL = BASE_URL + "/students/report/studentInternalMarkDetails.jsp"
INNER_MARKS_URL = BASE_URL + "/students/report/studentInternalMarkDetailsInner.jsp"
TIMETABLE_URL = BASE_URL + "/students/report/studentTimeTableDetails.jsp"
PROFILE_URL = BASE_URL + "/students/report/studentPersonalDetails.jsp"
GRADES_URL = BASE_URL + "/students/report/studentMarksCredits.jsp"
LOGIN_SERVLET = BASE_URL + "/LoginServlet"
FP_TOKEN_URL = BASE_URL + "/fpToken"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Referer": "https://sp.srmist.edu.in/",
}

_shared_transport = httpx.AsyncHTTPTransport(
    retries=1,
    limits=httpx.Limits(max_keepalive_connections=50, max_connections=200,
                       keepalive_expiry=60.0)
)


class _BorrowedTransport(httpx.AsyncBaseTransport):
    """Individual cookie jars share connections without owning pool shutdown."""
    async def handle_async_request(self, request):
        return await _shared_transport.handle_async_request(request)

    async def aclose(self):
        pass


async def close_shared_transport():
    await _shared_transport.aclose()


class _ExpiredPortalReport(Exception):
    pass


async def fetch_portal_reports(client):
    """Fetch in parallel, but stop optional work once attendance proves expiry."""
    async def attendance():
        html = await client.get_attendance_html()
        if html is None:
            raise _ExpiredPortalReport()
        return html

    try:
        return await gather_complete(attendance(), client.get_marks_data(),
            client.get_timetable_html(), client.get_profile_html(), client.get_academic_history())
    except _ExpiredPortalReport:
        # gather_complete cancels/drains all siblings before the jar is closed
        # or recovery starts. Do not wait for a slow optional report to time out.
        return None, [], None, None, {"status": "unavailable"}


def canvas_hash():
    seed = random.randint(0, 0x7FFFFFFF)
    return format(seed, "06x")


def telemetry_payload():
    now = int(time.time() * 1000)
    start = now - random.randint(3000, 8000)
    return {
        "startTime": start,
        "currentDomain": "sp.srmist.edu.in",
        "timezoneOffset": -330,
        "screenWidth": 1366,
        "screenHeight": 768,
        "colorDepth": 24,
        "devicePixelRatio": 1,
        "platform": "Linux x86_64",
        "userAgent": HEADERS["User-Agent"],
        "language": "en-US",
        "hardwareConcurrency": 8,
        "deviceMemory": 8,
        "touchSupport": False,
        "webdriver": False,
        "mouseClicks": random.randint(2, 6),
        "mouseMovements": random.randint(5, 20),
        "keystrokeCount": 0,
        "typingSpeedMs": 0,
        "canvasHash": canvas_hash(),
        "submitTime": now,
        "timeOnPageMs": now - start,
    }


class PortalSession:
    def __init__(self):
        self.client = track(httpx.AsyncClient(transport=_BorrowedTransport(), headers=HEADERS, follow_redirects=True, timeout=30.0))
        self.nonce = None
        self.login_form_fields = {}
        self.captcha_page = None
        self.exposed_captcha_text = None
        self.domain_field_name = None
        self.captcha_field_name = None
        self.random_delimiter = None
        self.load_ms = None

    async def load_captcha(self):
        r = await self.client.get(LOGIN_URL)
        text = r.text
        m = re.search(r"window\.SECURE_CONFIG\s*=\s*\{[^}]*?nonce\s*:\s*'([^']+)'", text)
        self.nonce = m.group(1) if m else None
        if not self.nonce:
            m = re.search(r"window\.SECURE_CONFIG\s*=\s*window\.SECURE_CONFIG\s*\|\|\s*\{\};\s*window\.SECURE_CONFIG\.nonce\s*=\s*'([^']+)'", text)
            self.nonce = m.group(1) if m else None
        if not self.nonce:
            m = re.search(r'id="fpNonce"\s*value="([^"]+)"', text)
            self.nonce = m.group(1) if m else None
        df = re.search(r'domainFieldName\s*=\s*[\'"]([^\'"]+)[\'"]', text)
        cf = re.search(r'captchaFieldName\s*=\s*[\'"]([^\'"]+)[\'"]', text)
        self.domain_field_name = df.group(1) if df else "dtoken_x"
        self.captcha_field_name = cf.group(1) if cf else "cptoken_x"
        m = re.search(r'"captchaText"\s*:\s*"([^"]+)"', text) or re.search(r"captchaText\s*=\s*'([^']+)'", text)
        self.exposed_captcha_text = m.group(1) if m else ""
        m = re.search(r"randomDelimiter\s*=\s*'([^']+)'", text)
        self.random_delimiter = m.group(1) if m else "0000"
        fields = {}
        for inp in re.finditer(r"<input[^>]*name=['\"]([^'\"]+)['\"][^>]*>", text):
            fields[inp.group(1)] = ""
        self.login_form_fields = fields
        m = re.search(r"SCaptchaServlet[^'\" ]*", text)
        captcha_url = None
        if m:
            seg = m.group(0)
            captcha_url = BASE_URL + "/" + seg if not seg.startswith("/") else "https://sp.srmist.edu.in" + seg
        img_b64 = None
        if captcha_url:
            proof = base64.b64encode(f"{self.nonce}:sp.srmist.edu.in".encode()).decode()
            cr = await self.client.get(captcha_url, headers={
                "X-Domain-Proof": proof,
                "Accept": "image/png, image/jpeg, image/svg+xml, image/*",
                "Referer": "https://sp.srmist.edu.in/srmiststudentportal/students/loginManager/youLogin.jsp",
            })
            if cr.status_code == 200:
                img_b64 = base64.b64encode(cr.content).decode()
                self.captcha_bytes = cr.content
        self.captcha_page = text
        self.load_ms = int(time.time() * 1000)
        return {
            "captcha_image": f"data:image/png;base64,{img_b64}" if img_b64 else None,
            "captcha_text_exposed": self.exposed_captcha_text,
            "captcha_required": True,
        }

    async def get_login_page(self):
        r = await self.client.get(LOGIN_URL)
        return r.text if r.status_code == 200 else None

    async def login(self, username, password, captcha, telemetry=None):
        if not self.captcha_page:
            await self.load_captcha()
        now_ms = int(time.time() * 1000)
        elapsed_sec = max(0, int((now_ms - (self.load_ms or now_ms)) / 1000))
        dtoken = base64.b64encode("sp.srmist.edu.in"[::-1].encode()).decode()
        trap_payload = str(elapsed_sec) + (self.random_delimiter or "0000") + "3"
        cptoken = base64.b64encode(trap_payload.encode()).decode()
        fp_payload = base64.b64encode(json.dumps(
            {"fp": "", "nonce": self.nonce, "ts": now_ms}).encode()).decode()
        payload = telemetry if telemetry else base64.b64encode(json.dumps(telemetry_payload()).encode()).decode()
        fp_body = dict(self.login_form_fields)
        fp_body.update({
            "username": username,
            "password": password,
            "captcha": captcha,
            "fpPayload": fp_payload,
            "fpToken": "",
            "recaptchaToken": "",
            "telemetryPayload": payload,
        })
        fp_body[self.domain_field_name] = dtoken
        fp_body[self.captcha_field_name] = cptoken
        resp = await self.client.post(LOGIN_SERVLET, data=fp_body)
        body = resp.text or ""
        attendance_response = "attendance" in resp.url.path.lower()
        if "logout.jsp" in resp.url.path or attendance_response:
            html = body
        else:
            html = await self.get_attendance_html()
            attendance_response = True
        if html is None:
            reason = self.classify_failure(resp.url.path, body)
            return {"ok": False, "reason": reason}
        # Login already fetched attendance to verify authentication. Reuse only
        # that response in this same login operation, never across later syncs.
        self.authenticated_attendance = html if attendance_response else None
        return {"ok": True, "cookies": {c.name: c.value for c in self.client.cookies.jar}}

    @staticmethod
    def classify_failure(path, body):
        blob = body.lower()
        if "invalid captcha" in blob or "enter valid captcha" in blob or "valid captcha" in blob:
            return "wrong_captcha"
        if "invalid username" in blob or "invalid password" in blob or "invalid credentials" in blob or "username or password" in blob:
            return "invalid_credentials"
        if "session" in blob and ("expire" in blob or "timeout" in blob):
            return "session_expired"
        return "login_failed"

    async def get_attendance_html(self):
        r = await self.client.get(ATT_URL)
        if r.status_code != 200 or "login_form" in r.text or "theGR8LoginLoader" in r.text:
            return None
        return r.text


    async def get_marks_html(self):
        try:
            r = await self.client.get(MARKS_URL)
            if r.status_code == 200 and "table" in r.text.lower():
                return r.text
        except Exception as e:
            print(f"  -> [PORTAL] Network error fetching marks: {e}", flush=True)
        return None

class PortalClient:
    def __init__(self, cookies=None):
        self.client = track(httpx.AsyncClient(transport=_BorrowedTransport(), headers=HEADERS, follow_redirects=True, timeout=30.0))
        if cookies:
            self.client.cookies.update(cookies)

    def seed_attendance(self, html):
        if isinstance(html, str) and html and len(html) <= 512 * 1024:
            if "login_form" not in html and "theGR8LoginLoader" not in html:
                result = asyncio.get_running_loop().create_future()
                result.set_result(html)
                self._attendance_task = result

    async def keepalive(self):
        try:
            await self.client.get(HRD_URL)
        except httpx.HTTPError:
            pass

    async def get_attendance_html(self):
        # Marks enrichment and the attendance report share this one request.
        # This task lives only for the current PortalClient/report refresh.
        if not hasattr(self, "_attendance_task"):
            self._attendance_task = asyncio.create_task(self._fetch_attendance_html())
        return await self._attendance_task

    async def _fetch_attendance_html(self):
        try:
            r = await self.client.get(ATT_URL)
            if r.status_code != 200 or "login_form" in r.text or "theGR8LoginLoader" in r.text:
                return None
            return r.text
        except Exception as e:
            print(f"  -> [PORTAL] Network error fetching attendance: {e}", flush=True)
            return None

    async def get_marks_html(self):
        try:
            r = await self.client.get(MARKS_URL)
            if r.status_code == 200 and "table" in r.text.lower():
                return r.text
        except Exception:
            pass
        return None

    async def get_timetable_html(self):
        try:
            payload = {
                "iden": "10",
                "filter": "",
                "hdnFormDetails": "1",
                "csrfPreventionSalt": ""
            }
            r = await self.client.post(TIMETABLE_URL, data=payload)
            if r.status_code == 200 and "table" in r.text.lower() and "day 1" in r.text.lower():
                return r.text
        except Exception as e:
            print(f"  -> [PORTAL] Network error fetching timetable: {e}", flush=True)
        return None

    async def get_profile_html(self):
        try:
            r = await self.client.get(PROFILE_URL)
            if r.status_code == 200 and "student name" in r.text.lower():
                return r.text
        except Exception as e:
            print(f"  -> [PORTAL] Network error fetching profile: {e}", flush=True)
        return None

    async def get_academic_history(self):
        """Two bounded reads per report sync; use the signed-in shell's form fields."""
        from selectolax.parser import HTMLParser
        from services.portal_academic_service import PortalAcademicService

        async def document(method, url, **kwargs):
            async with self.client.stream(method, url, **kwargs) as response:
                if response.status_code != 200:
                    return None
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(data) + len(chunk) > 512 * 1024:
                        return None
                    data.extend(chunk)
                return data.decode("utf-8", errors="replace")

        try:
            async with asyncio.timeout(10):
                shell = await document("GET", HRD_URL)
                parser = HTMLParser(shell or "")
                fields = {name: parser.css_first(f'input[name="{name}"]')
                          for name in ("hdnFormDetails", "csrfPreventionSalt")}
                if any(node is None for node in fields.values()):
                    return {"status": "unavailable"}
                payload = {name: node.attributes.get("value", "") for name, node in fields.items()}
                payload.update({"iden": "8", "filter": ""})
                html = await document("POST", GRADES_URL, data=payload,
                                      headers={"Referer": HRD_URL, "X-Requested-With": "XMLHttpRequest"})
                result = PortalAcademicService.parse(html)
                return result if result else {"status": "unavailable"}
        except (httpx.HTTPError, TimeoutError, ValueError):
            return {"status": "unavailable"}

    async def get_marks_data(self):
        try:
            r = await self.client.get(MARKS_URL)
            if r.status_code != 200 or "table" not in r.text.lower():
                return []
            
            subjects = PortalMarksService.parse_main(r.text)
            if not subjects:
                return []

            async def fetch_inner(subj):
                if not subj.get("subjectId"):
                    return
                payload = {
                    "iden": "1",
                    "hdnSubjectId": subj["subjectId"],
                    "status": subj.get("status", "2")
                }
                try:
                    r_inner = await self.client.post(INNER_MARKS_URL, data=payload)
                    if r_inner.status_code == 200:
                        subj["assessments"] = PortalMarksService.parse_inner(r_inner.text)
                except Exception:
                    pass

            await gather_complete(*[fetch_inner(s) for s in subjects])

            for s in subjects:
                s.pop("subjectId", None)
                s.pop("status", None)

            try:
                att_html = await self.get_attendance_html()
                if att_html:
                    from services.portal_attendance_service import PortalAttendanceService
                    courses, _ = PortalAttendanceService.parse(att_html)
                    if courses:
                        mark_codes = {m.get("courseCode", "").strip().lower() for m in subjects}
                        for c in courses:
                            c_code = c.get("code", "").strip()
                            if c_code.lower() not in mark_codes:
                                subjects.append({
                                    "courseCode": c_code,
                                    "title": c.get("title", ""),
                                    "type": "Internal",
                                    "performance": "N/A",
                                    "assessments": [],
                                    "totalMarkGot": None,
                                    "totalMaxMarks": None
                                })
            except Exception as ex:
                print(f"  -> [PORTAL] Error merging attendance courses in marks: {ex}", flush=True)

            return subjects
        except Exception as e:
            print(f"  -> [PORTAL] Error fetching marks data: {e}", flush=True)
            return []
