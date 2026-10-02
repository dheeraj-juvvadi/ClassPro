"""Read-only exam tables verified in Student Portal; never submit Scribe forms."""
import re
from datetime import date, datetime
from bs4 import BeautifulSoup

MAX_ROWS = 160


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def parse_date(value):
    text = clean(value)
    patterns = [
        (r"\b\d{4}-\d{2}-\d{2}\b", "%Y-%m-%d"),
        (r"\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b", "%d-%m-%Y"),
        (r"\b\d{1,2}[ -][A-Za-z]{3,9}[ -]\d{4}\b", None),
    ]
    for pattern, fmt in patterns:
        for match in re.finditer(pattern, text):
            candidate = match.group().replace("/", "-")
            formats = [fmt] if fmt else ["%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%d-%B-%Y"]
            for form in formats:
                try:
                    value = datetime.strptime(candidate, form).date()
                    if 2000 <= value.year <= 2100:
                        return value.isoformat()
                except ValueError:
                    continue
    return None


def soup_for(html):
    if not html or re.search(r'theGR8LoginLoader|name=["\']password["\']|id=["\']login_form', html, re.I):
        raise ValueError("Login required or empty response")
    return BeautifulSoup(html, "lxml")


def sessions(html, today=None):
    today = today or date.today()
    soup = soup_for(html)
    selector = soup.find("select", id="txtExamMonthYear")
    if selector is None:
        raise ValueError("Exam session selector changed")
    found = []
    for option in selector.find_all("option"):
        match = re.fullmatch(r"(\d{1,2})_(\d{4})", option.get("value", ""))
        if not match:
            continue
        month, year = map(int, match.groups())
        if 1 <= month <= 12 and today.year - 1 <= year <= today.year + 2:
            found.append({"value": f"{month}_{year}", "month": month, "year": year,
                          "label": date(year, month, 1).strftime("%b %Y"), "provisional": False})
    return list({item["value"]: item for item in found}.values())


def candidates(offered, today):
    current = today.year * 12 + today.month
    available = [item for item in offered if -1 <= item["year"] * 12 + item["month"] - current <= 12]
    available.sort(key=lambda item: (item["year"], item["month"]))
    # The inspected Scribe selector lags behind its November subject endpoint.
    # Keep this single, bounded provisional read until that session is advertised.
    november = "11_2026"
    if date(2026, 7, 1) <= today <= date(2026, 12, 31) and not any(item["value"] == november for item in available):
        available.append({"value": november, "month": 11, "year": 2026,
                          "label": "Nov 2026", "provisional": True})
    return sorted(available, key=lambda item: (item["year"], item["month"]))[:6]


def table_records(html, source):
    soup = soup_for(html)
    for table in soup.find_all("table"):
        headings = None
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"], recursive=False)
            labels = [clean(cell.get_text(" ", strip=True)).casefold() for cell in cells]
            if "subject code" in labels and "subject description" in labels:
                headings = labels
                break
        if headings is None:
            continue
        date_key = "date & session" if source == "official" else "date"
        if date_key not in headings or (source == "scribe" and "session" not in headings):
            raise ValueError("Exam table headers changed")
        records = []
        for row in table.find_all("tr"):
            if row.find("th") or "strikethrough" in row.get("class", []):
                continue
            cells = row.find_all("td", recursive=False)
            if len(cells) == 1 and re.search(r"no subjects? found", cells[0].get_text(), re.I):
                continue
            if not cells:
                continue
            if len(cells) != len(headings):
                raise ValueError("Exam table row changed")
            values = {}
            for key, cell in zip(headings, cells):
                for old in cell.select("s,del,strike,.strikethrough"):
                    old.decompose()
                values[key] = clean(cell.get_text(" ", strip=True))
            code, title = values["subject code"], values["subject description"]
            if not code or not title or len(code) > 80 or len(title) > 240:
                raise ValueError("Invalid exam subject")
            raw_date = values[date_key]
            exam_date = parse_date(raw_date)
            if raw_date and raw_date.casefold() not in {"-", "--", "n/a", "not published", "pending"} and not exam_date:
                raise ValueError("Unrecognized exam date")
            session = values.get("session", "")
            if source == "official":
                match = re.search(r"\b(FN|AN|AM|PM|forenoon|afternoon)\b", raw_date, re.I)
                session = match.group().upper() if match else ""
            records.append({"code": code, "title": title, "date": exam_date,
                            "session": session[:40] or None, "type": values.get("type", "")[:40]})
            if len(records) > MAX_ROWS:
                raise ValueError("Exam table too large")
        return records
    raise ValueError("No recognized exam table")
