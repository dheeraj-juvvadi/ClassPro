"""On-demand, session-scoped exam refresh and last-success fallback."""
import asyncio
import copy
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from core.portal_client import PortalClient
from services.portal_exam_service import candidates, sessions, table_records

BASE = "https://sp.srmist.edu.in/srmiststudentportal/"
OFFICIAL = BASE + "students/transaction/StudentExamTimeTable.jsp"
SCRIBE = BASE + "students/certificateRequest/Scribe.jsp"
SUBJECTS = BASE + "students/certificateRequest/ScribeInner.jsp"
NOTICE = "Exam dates may change. Confirm with Student Portal or your hall ticket before each exam."
CHECK_SECONDS = 6 * 3600
RETRY_SECONDS = 15 * 60
FETCH_VERSION = 3


def stamp(now):
    return datetime.fromtimestamp(now, timezone.utc).isoformat()


def unavailable(previous, now):
    result = copy.deepcopy(previous) if isinstance(previous, dict) else {}
    result.update({"fetchVersion": FETCH_VERSION, "lastAttemptAt": stamp(now), "nextCheckAt": (now + RETRY_SECONDS) * 1000,
                   "stale": True, "notice": NOTICE})
    result["entries"] = [{**row, "stale": True} for row in result.get("entries", [])]
    if not result.get("checkedAt"):
        result.update({"status": "unavailable", "entries": [], "sessions": [],
                       "source": "Student Portal", "sourceKind": None, "provisional": False})
    return result


async def read(client, url, params=None):
    # Match funLoadSubject(): iden=1 only loads subjects; it does not apply for
    # a scribe. The JSP expects form fields from the selector's AJAX POST.
    if url == SUBJECTS:
        request = {"method": "POST", "data": params,
                   "headers": {"X-Requested-With": "XMLHttpRequest",
                               "Referer": BASE + "students/template/HRDSystem.jsp"}}
    else:
        request = {"method": "GET", "params": params}
    async with client.stream(url=url, timeout=10, follow_redirects=False, **request) as response:
        if response.status_code != 200:
            raise ValueError("Exam source unavailable")
        content = bytearray()
        async for chunk in response.aiter_bytes():
            content.extend(chunk)
            if len(content) > 750_000:
                raise ValueError("Exam response too large")
        return content.decode("utf-8", "replace")


async def collect(client, previous, now):
    today = datetime.fromtimestamp(now, ZoneInfo("Asia/Kolkata")).date()
    official_html, scribe_html = await asyncio.gather(
        read(client, OFFICIAL, {"iden": "126", "hdnFormDetails": "126", "filter": ""}),
        read(client, SCRIBE, {"iden": "49", "hdnFormDetails": "49", "filter": ""}),
        return_exceptions=True)
    offered, official, official_failed, discovery_failed = [], [], False, False
    try:
        if isinstance(official_html, BaseException):
            raise ValueError("Official source unavailable")
        official = table_records(official_html, "official")
        lower, upper = (today - timedelta(days=45)).isoformat(), (today + timedelta(days=270)).isoformat()
        official = [item for item in official if item["date"] and lower <= item["date"] <= upper]
    except ValueError:
        official_failed = True
    try:
        if isinstance(scribe_html, BaseException):
            raise ValueError("Session discovery unavailable")
        offered = sessions(scribe_html, today)
    except ValueError:
        discovery_failed = True
        scribe_html = None
    base = {"fetchVersion": FETCH_VERSION, "checkedAt": stamp(now), "lastAttemptAt": stamp(now), "stale": False,
            "nextCheckAt": (now + CHECK_SECONDS) * 1000, "notice": NOTICE,
            "sessions": [{"value": item["value"], "label": item["label"]} for item in offered]}
    options = candidates(offered, today) if isinstance(scribe_html, str) else []
    semaphore = asyncio.Semaphore(2)

    async def load_period(candidate):
        try:
            async with semaphore:
                html = await read(client, SUBJECTS, {"iden": "1", "hdnExamMonth": candidate["month"],
                                                     "hdnExamYear": candidate["year"]})
            records = table_records(html, "scribe")
            # Semester exams can extend into the following month/year.
            lower = datetime(candidate["year"], candidate["month"], 1).date() - timedelta(days=45)
            upper = lower + timedelta(days=150)
            if any(item["date"] and not lower.isoformat() <= item["date"] <= upper.isoformat() for item in records):
                raise ValueError("Exam dates do not match requested session")
            return candidate, records
        except Exception:
            return candidate, None

    loaded = await asyncio.gather(*(load_period(candidate) for candidate in options))
    selected, period_labels, failed_values = [], {}, set()
    for candidate, records in loaded:
        period = candidate["value"]
        period_labels[period] = candidate["label"]
        if records is None:
            failed_values.add(period)
            selected.extend({**row, "stale": True} for row in (previous or {}).get("entries", [])
                            if row.get("period") == period)
            continue
        selected.extend({**row, "period": period, "periodLabel": candidate["label"],
                         "provisional": True, "sourceKind": "scribe", "stale": False} for row in records)
    if discovery_failed:
        selected.extend({**row, "stale": True} for row in (previous or {}).get("entries", [])
                        if row.get("sourceKind") == "scribe")
    for row in official:
        month = datetime.fromisoformat(row["date"])
        period = f"{month.month}_{month.year}"
        selected = [item for item in selected if (item["code"], item.get("period")) != (row["code"], period)]
        period_labels.setdefault(period, month.strftime("%b %Y"))
        selected.append({**row, "period": period, "periodLabel": period_labels[period],
                         "provisional": False, "sourceKind": "official", "stale": False})
    if official_failed:
        for row in (previous or {}).get("entries", []):
            if row.get("sourceKind") == "official" and not any(
                    item["code"] == row["code"] and item.get("date") == row.get("date") for item in selected):
                selected.append({**row, "stale": True})
    if not official and (discovery_failed or loaded and all(records is None for _, records in loaded)):
        return unavailable(previous, now)
    selected.sort(key=lambda row: (row["date"] or "9999", row.get("period", ""), row["code"]))
    sources = {item["sourceKind"] for item in selected}
    stale = bool(official_failed or discovery_failed or failed_values or any(item.get("stale") for item in selected))
    for item in selected:
        if item.get("period"):
            period_labels.setdefault(item["period"], item.get("periodLabel", item["period"]))
    return {**base, "entries": selected[:160], "status": "published" if any(item["date"] for item in selected) else "pending",
            "stale": stale, "nextCheckAt": (now + (RETRY_SECONDS if stale else CHECK_SECONDS)) * 1000,
            "provisional": any(item.get("provisional") for item in selected) or not official,
            "sourceKind": "official" if sources == {"official"} else "mixed" if len(sources) > 1 else "scribe",
            "source": "Student Portal · Exam Time Table" if sources == {"official"} else "Student Portal · provisional exam details",
            "sessions": [{"value": value, "label": label} for value, label in period_labels.items()],
            "sessionId": selected[0]["period"] if selected else (options[0]["value"] if options else None),
            "sessionLabel": selected[0]["periodLabel"] if selected else "Upcoming exams"}


async def refresh_exams(cookies, previous=None, now=None, *, force=False):
    import time
    now = time.time() if now is None else now
    if (not force and isinstance(previous, dict) and previous.get("fetchVersion") == FETCH_VERSION
            and isinstance(previous.get("nextCheckAt"), (int, float))):
        if now * 1000 < previous["nextCheckAt"] <= (now + CHECK_SECONDS) * 1000:
            return copy.deepcopy(previous)
    portal = PortalClient(cookies)
    try:
        async with asyncio.timeout(25):
            return await collect(portal.client, previous, now)
    except Exception:
        return unavailable(previous, now)
    finally:
        await portal.client.aclose()
