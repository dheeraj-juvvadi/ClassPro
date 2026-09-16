import asyncio
import contextlib
import io
import json
import sys

from core.portal_client import PortalSession, PortalClient
from ocr import solve


def error(code, message, status=401):
    return {"status": status, "body": {"error": {"code": code, "message": message}}}


class Adapter:
    def __init__(self):
        self.session = PortalSession()
        self.authenticated = False
        self.events = []
        self.session.client.event_hooks["response"] = [self.evidence]

    async def evidence(self, response):
        await response.aread()
        stage = response.url.path.rsplit("/", 1)[-1]
        allowed = {"youLogin.jsp", "LoginServlet", "studentAttendanceDetails.jsp", "SCaptchaServlet"}
        text = response.text if "text" in response.headers.get("content-type", "") else ""
        self.events.append({"stage": stage if stage in allowed else "report_or_redirect",
                            "status": response.status_code,
                            "redirect": response.is_redirect,
                            "login_form_present": "login_form" in text,
                            "dashboard_present": "userHomePage" in text})
        self.events = self.events[-20:]

    async def call(self, action, payload):
        self.events = []
        if action == "challenge":
            info = await self.session.load_captcha()
            if not info.get("captcha_image"):
                return error("PORTAL_UNAVAILABLE", "SRM verification is unavailable.", 502)
            return {"status": 200, "body": {"required": True, "serverAuto": True,
                                             "image": info["captcha_image"]}}
        if action == "login":
            answer = payload.get("answer", "")
            automatic = not answer
            result = None
            for attempt in range(4 if automatic else 1):
                if automatic:
                    try:
                        answer = await asyncio.to_thread(solve, self.session.captcha_bytes)
                    except Exception:
                        return error("CAPTCHA_REQUIRED", "Enter the verification code manually.")
                    await asyncio.sleep(2)
                result = await self.session.login(payload["account"].strip().split("@")[0],
                                                   payload["password"], answer)
                self.events.append({"stage": "login_result", "automatic": automatic,
                                    "attempt": attempt + 1, "reason": result.get("reason", "accepted")})
                if result.get("ok") or result.get("reason") != "wrong_captcha":
                    break
                if automatic and attempt < 3:
                    await self.session.load_captcha()
            if not result or not result.get("ok"):
                reason = (result or {}).get("reason")
                code = "CAPTCHA_INVALID" if reason == "wrong_captcha" else "LOGIN_REJECTED"
                return error(code, "Student Portal did not establish a session. Please retry.")
            attendance = await self.session.get_attendance_html()
            self.authenticated = True
            return {"status": 200, "body": {"authenticated": True, "attendanceHTML": attendance}}
        if action == "reports" and self.authenticated:
            client = PortalClient()
            client.client = self.session.client
            attendance = await client.get_attendance_html()
            if attendance is None:
                self.authenticated = False
                return error("SESSION_EXPIRED", "Your SRM session expired.")
            marks = await client.get_marks_data()
            return {"status": 200, "body": {"attendanceHTML": attendance, "marks": marks}}
        return error("SESSION_EXPIRED", "Please sign in again.")


async def main():
    adapter = Adapter()
    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.buffer.readline, 16385)
            if not line or len(line) > 16384:
                break
            try:
                request = json.loads(line)
                with contextlib.redirect_stdout(io.StringIO()):
                    result = await asyncio.wait_for(adapter.call(request["action"], request.get("payload", {})), 85)
                result["events"] = adapter.events
            except Exception as exception:
                result = error("PORTAL_UNAVAILABLE", "Unable to reach Student Portal.", 502)
                result["events"] = [{"stage": "adapter_failure", "type": type(exception).__name__}]
            sys.stdout.write(json.dumps(result, separators=(",", ":")) + "\n")
            sys.stdout.flush()
            request = result = line = None
    finally:
        await adapter.session.client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
