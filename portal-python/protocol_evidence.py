import base64
import json
import time
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, urlparse


class ProtocolEvidence:
    def __init__(self):
        self.captcha_session = None

    def request(self, request, session):
        stage = request.url.path.rsplit("/", 1)[-1]
        cookies = SimpleCookie()
        cookies.load(request.headers.get("cookie", ""))
        current = cookies.get("JSESSIONID")
        current = current.value if current else None
        if stage == "SCaptchaServlet":
            self.captcha_session = current
        if stage not in {"SCaptchaServlet", "LoginServlet"}:
            return None
        record = {"stage": "request_structure", "target": stage,
                  "method": request.method, "session_cookie_present": current is not None,
                  "captcha_cookie_matches": current is not None and current == self.captcha_session,
                  "origin_present": "origin" in request.headers,
                  "referer_same_host": urlparse(request.headers.get("referer", "")).hostname == request.url.host}
        if stage != "LoginServlet":
            return record
        fields = parse_qs(request.content.decode(), keep_blank_values=True)
        record.update({"form_field_count": len(fields),
                       "username_present": bool(fields.get("username", [""])[0]),
                       "password_present": bool(fields.get("password", [""])[0]),
                       "captcha_present": bool(fields.get("captcha", [""])[0]),
                       "nonce_present": bool(session.nonce),
                       "domain_field_present": session.domain_field_name in fields,
                       "captcha_field_present": session.captcha_field_name in fields,
                       "dynamic_names_found": session.domain_field_name != "dtoken_x" and session.captcha_field_name != "cptoken_x",
                       "delimiter_found": session.random_delimiter != "0000",
                       "challenge_age_seconds": max(0, int((time.time() * 1000 - (session.load_ms or 0)) / 1000))})
        for field in ("fpPayload", "telemetryPayload"):
            try:
                value = json.loads(base64.b64decode(fields.get(field, [""])[0]))
                record[field + "_valid"] = isinstance(value, dict)
                if field == "fpPayload":
                    record["fingerprint_nonce_matches"] = bool(session.nonce) and value.get("nonce") == session.nonce
            except (ValueError, TypeError):
                record[field + "_valid"] = False
        return record
