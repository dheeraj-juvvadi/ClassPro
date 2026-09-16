from contextvars import ContextVar
from pathlib import Path
import sys

from selectolax.parser import HTMLParser

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "portal-python"))
from protocol_evidence import ProtocolEvidence

events = ContextVar("diagnostic_events", default=None)


def record(value):
    target = events.get()
    if target is not None and len(target) < 48:
        target.append(value)


def instrument(original):
    class ObservedSession(original):
        def __init__(self):
            super().__init__()
            self.observation = ProtocolEvidence()
            self.client.event_hooks["request"].append(self.observe_request)
            self.client.event_hooks["response"].append(self.observe_response)

        async def observe_request(self, request):
            try:
                value = self.observation.request(request, self)
                if value:
                    record(value)
            except Exception:
                record({"stage": "request_structure", "diagnostic_failed": True})

        async def observe_response(self, response):
            stage = response.url.path.rsplit("/", 1)[-1]
            if stage not in {"LoginServlet", "youLogin.jsp", "SCaptchaServlet", "studentAttendanceDetails.jsp"}:
                stage = "report_or_redirect"
            value = {"stage": stage, "status": response.status_code, "redirect": response.is_redirect}
            try:
                if "text" in response.headers.get("content-type", ""):
                    await response.aread()
                    tree = HTMLParser(response.text)
                    value["login_form_present"] = tree.css_first("#login_form") is not None
                    for node in tree.css('script, style, [hidden], [aria-hidden="true"], .invalid-feedback'):
                        node.decompose()
                    messages = " ".join(node.text() for node in tree.css('.alert, [role="alert"], #errorMessage')).lower()
                    value["alert_classification"] = "unclassified"
                    if any(text in messages for text in ("invalid credentials", "invalid username or password")):
                        value["alert_classification"] = "credentials_rejected"
                    elif any(text in messages for text in ("invalid captcha", "incorrect captcha", "captcha mismatch")):
                        value["alert_classification"] = "captcha_rejected"
            except Exception:
                value["diagnostic_failed"] = True
            record(value)

    return ObservedSession
