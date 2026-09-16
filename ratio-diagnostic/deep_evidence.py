import base64
import hashlib
import hmac
import importlib.metadata
import json
import os
import platform
import resource
import ssl
import time
from contextvars import ContextVar
from email.utils import parsedate_to_datetime
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import certifi

submitted = ContextVar("submitted", default=None)
STAGES = {"youLogin.jsp", "LoginServlet", "SCaptchaServlet", "studentAttendanceDetails.jsp"}


def workload():
    usage = resource.getrusage(resource.RUSAGE_SELF)
    result = {"cpu_user_seconds": round(usage.ru_utime, 3), "cpu_system_seconds": round(usage.ru_stime, 3),
              "peak_rss_bytes": usage.ru_maxrss * (1 if platform.system() == "Darwin" else 1024)}
    for name in ("memory.current", "memory.max", "cpu.stat"):
        path = Path("/sys/fs/cgroup") / name
        if path.is_file():
            raw = path.read_text()[:512]
            result[name] = raw if all(character.isdigit() or character.isspace() or character.isalpha() or character == "_" for character in raw) else "unavailable"
    return result


def stage(url):
    value = url.path.rsplit("/", 1)[-1]
    return value if value in STAGES else "report_or_redirect"


def runtime():
    root = Path(__file__).resolve().parent
    files = {"portal_client": root / "upstream/core/portal_client.py", "upstream_main": root / "upstream/main.py",
             "compatibility": root / "server.py", "observer": root / "observe.py", "deep_observer": root / "deep_evidence.py",
             "ocr_model": root.parent / "portal-python/model/captcha_crnn.onnx", "ca_bundle": Path(certifi.where())}
    return {"stage": "runtime", "python": platform.python_version(), "os": platform.system(),
            "architecture": platform.machine(), "openssl": ssl.OPENSSL_VERSION,
            "utc_offset_seconds": -time.timezone,
            "versions": {name: importlib.metadata.version(name) for name in
                         ("httpx", "httpcore", "anyio", "certifi", "onnxruntime", "numpy", "Pillow")},
            "hashes": {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in files.items()},
            "environment_present": {name: bool(os.environ.get(name)) for name in
                                    ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "SSL_CERT_FILE", "SSL_CERT_DIR")}}


def integrity(payload):
    proof = payload.get("integrity")
    result = {"stage": "browser_integrity", "supplied": isinstance(proof, dict)}
    if not isinstance(proof, dict) or not isinstance(proof.get("nonce"), str):
        return result
    nonce = proof["nonce"]
    account = payload.get("account", "").strip()
    if account.lower().endswith("@srmist.edu.in"):
        account = account[:-14]
    for key, value in {"account": account, "password": payload.get("password", ""),
                       "answer": payload.get("answer", "")}.items():
        digest = hashlib.sha256((nonce + "\n" + key + "\n" + value).encode()).hexdigest()
        expected = proof.get(key)
        result[key + "_matches_browser"] = isinstance(expected, str) and hmac.compare_digest(digest, expected)
    return result


def form_evidence(request, session):
    fields = parse_qs(request.content.decode(), keep_blank_values=True)
    payload = submitted.get() or {}
    expected_account = payload.get("username", "").strip().split("@")[0]
    known = {"username", "password", "captcha", "fpPayload", "fpToken", "recaptchaToken", "telemetryPayload"}
    kinds = [key if key in known else "domain_token" if key == session.domain_field_name else
             "captcha_token" if key == session.captcha_field_name else "other_field" for key in fields]
    result = {"stage": "form_details", "field_roles_in_order": kinds,
              "duplicate_field_count": sum(len(value) != 1 for value in fields.values()),
              "account_matches_received": fields.get("username") == [expected_account],
              "password_matches_received": fields.get("password") == [payload.get("password")],
              "manual_answer_matches_received": fields.get("captcha") == [payload["captcha"]] if payload.get("captcha") else None,
              "dynamic_fields_distinct": session.domain_field_name != session.captcha_field_name,
              "unexpected_nonempty_fields": sum(bool(value[0]) for key, value in fields.items()
                                                if key not in known | {session.domain_field_name, session.captcha_field_name})}
    try:
        domain = base64.b64decode(fields.get(session.domain_field_name, [""])[0]).decode()
        interaction = base64.b64decode(fields.get(session.captcha_field_name, [""])[0]).decode()
        fingerprint = json.loads(base64.b64decode(fields.get("fpPayload", [""])[0]))
        telemetry = json.loads(base64.b64decode(fields.get("telemetryPayload", [""])[0]))
        result["domain_token_correct"] = domain == "sp.srmist.edu.in"[::-1]
        parts = interaction.split(session.random_delimiter or "0000")
        result["interaction_token_valid"] = len(parts) == 2 and parts[0].isdigit() and parts[1] == "3"
        if result["interaction_token_valid"]:
            result["interaction_elapsed_seconds"] = int(parts[0])
        result["fingerprint_timestamp_age_ms"] = round(time.time() * 1000 - fingerprint["ts"])
        result["telemetry"] = {key: value for key, value in telemetry.items()
                               if key in {"timezoneOffset", "screenWidth", "screenHeight", "colorDepth", "devicePixelRatio",
                                          "hardwareConcurrency", "deviceMemory", "touchSupport", "webdriver"}
                               and type(value) in (int, float, bool)}
        result["telemetry_ua_matches_header"] = telemetry.get("userAgent") == request.headers.get("user-agent")
        result["telemetry_platform_linux"] = telemetry.get("platform") == "Linux x86_64"
    except (ValueError, TypeError, KeyError):
        result["token_decode_failed"] = True
    return result


class NetworkEvidence:
    def __init__(self):
        self.sequence = 0
        self.previous_cookie = None
        self.previous_peer = None

    def begin(self, request):
        self.sequence += 1
        request.extensions["comparison"] = {"sequence": self.sequence, "started": time.monotonic(), "timings": {}}

        async def trace(name, info):
            operation, phase = name.rsplit(".", 1)
            if operation not in {"connection.connect_tcp", "connection.start_tls", "http11.send_request_headers",
                                 "http11.send_request_body", "http11.receive_response_headers", "http11.receive_response_body"}:
                return
            timings = request.extensions["comparison"]["timings"]
            if phase == "started":
                timings[operation] = {"started": time.monotonic()}
            elif operation in timings:
                entry = timings[operation]
                entry["duration_ms"] = round((time.monotonic() - entry.pop("started", time.monotonic())) * 1000)
                entry["failed"] = phase == "failed"

        request.extensions["trace"] = trace

    def finish(self, response):
        request = response.request
        tracking = request.extensions.get("comparison", {})
        value = {"stage": "network_details", "target": stage(response.url),
                 "sequence": tracking.get("sequence"), "status": response.status_code,
                 "http_version": response.http_version, "response_bytes": len(response.content),
                 "query_present": bool(response.url.query),
                 "request_header_names": sorted(request.headers.keys()),
                 "response_header_names": sorted(response.headers.keys()),
                 "duration_ms": round((time.monotonic() - tracking.get("started", time.monotonic())) * 1000),
                 "timings": {key: {field: datum for field, datum in entry.items() if field != "started"}
                             for key, entry in tracking.get("timings", {}).items()}}
        for header in ("content-type", "content-encoding", "transfer-encoding", "connection"):
            candidate = response.headers.get(header, "")
            allowed = {"text/html", "text/html;charset=UTF-8", "text/html; charset=UTF-8", "image/png",
                       "gzip", "br", "chunked", "keep-alive", "close"}
            value[header] = candidate if candidate in allowed else "other" if candidate else "absent"
        location = response.headers.get("location")
        if location:
            target = response.url.join(location)
            value["redirect_same_host"] = target.host == response.url.host
            value["redirect_target"] = stage(target)
            value["redirect_query_present"] = bool(target.query)
        updates = []
        for line in response.headers.get_list("set-cookie"):
            cookies = SimpleCookie()
            cookies.load(line)
            for name, cookie in cookies.items():
                updates.append({"kind": "session" if name == "JSESSIONID" else "other",
                                "secure": bool(cookie["secure"]), "httponly": bool(cookie["httponly"]),
                                "domain_specified": bool(cookie["domain"]), "path_specified": bool(cookie["path"]),
                                "samesite": cookie["samesite"] if cookie["samesite"].lower() in {"lax", "strict", "none"} else "absent"})
                if name == "JSESSIONID":
                    value["session_cookie_rotated"] = self.previous_cookie is not None and self.previous_cookie != cookie.value
                    self.previous_cookie = cookie.value
        value["cookie_updates"] = updates
        if response.headers.get("date"):
            value["server_clock_delta_seconds"] = round(parsedate_to_datetime(response.headers["date"]).timestamp() - time.time(), 1)
        stream = response.extensions.get("network_stream")
        if stream:
            peer = stream.get_extra_info("server_addr")
            value["peer_changed"] = self.previous_peer is not None and peer != self.previous_peer
            self.previous_peer = peer
            if peer:
                value["upstream_peer"] = str(peer[0])
            tls = stream.get_extra_info("ssl_object")
            if tls:
                value.update({"tls_version": tls.version(), "tls_cipher": tls.cipher()[0],
                              "alpn": tls.selected_alpn_protocol(),
                              "certificate_sha256": hashlib.sha256(tls.getpeercert(binary_form=True)).hexdigest()})
        return value
