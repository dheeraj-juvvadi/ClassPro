"""Published academic history from Student Portal's Grade / Mark & Credit report."""
import re
from datetime import datetime, timezone
from selectolax.parser import HTMLParser

PASS_GRADES = {"O", "A+", "A", "B+", "B", "C"}


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def number(value, maximum):
    value = clean(value)
    if not re.fullmatch(r"\d+(?:\.\d+)?", value):
        return None
    parsed = float(value)
    return parsed if 0 <= parsed <= maximum else None


class PortalAcademicService:
    @staticmethod
    def parse(html):
        if not html or len(html) > 512 * 1024:
            return None
        parser = HTMLParser(html)
        result = {"source": "Student Portal", "status": "ready", "semesters": [],
                  "fetchedAt": datetime.now(timezone.utc).isoformat()}
        summary_labels = {"cgpa": ("currentCgpa", 10),
                          "credits earned": ("completedCredits", 1000),
                          "credits registered": ("registeredCredits", 1000),
                          "credits required": ("requiredCredits", 1000)}
        # Use exact labels. SGPA and registered credits are different quantities.
        for row in parser.css("tr"):
            cells = row.css("td, th")
            if len(cells) != 2:
                continue
            label, value = [clean(cell.text(separator=" ", strip=True)) for cell in cells]
            field = summary_labels.get(label.lower().strip(" :"))
            if field:
                parsed = number(value, field[1])
                if parsed is not None:
                    result[field[0]] = parsed
        groups, seen = {}, set()
        recognized = False
        for table in parser.css("table"):
            rows = table.css("tr")
            if not rows:
                continue
            headers = [clean(c.text()).lower() for c in rows[0].css("th, td")]
            required = ["semester", "month / year", "code", "description", "credit", "grade"]
            if not all(header in headers for header in required):
                continue
            recognized = True
            columns = {header: headers.index(header) for header in required}
            current = None
            for row in rows[1:]:
                cells = [clean(c.text(separator=" ", strip=True)) for c in row.css("td, th")]
                if len(cells) == 2 and cells[0].upper() == "SGPA" and current:
                    value = number(cells[1], 10)
                    if value is not None:
                        current["gpa"] = value
                    continue
                if len(cells) != len(headers):
                    continue
                item = {key: cells[index] for key, index in columns.items()}
                semester = number(item["semester"], 24)
                credit = number(item["credit"], 30)
                if semester is None or semester < 1 or semester % 1 or credit is None:
                    result["partial"] = True
                    continue
                code, period = item["code"][:80], item["month / year"][:40]
                if not code:
                    result["partial"] = True
                    continue
                identity = (int(semester), period, code, item["grade"])
                if identity in seen:
                    continue
                if len(seen) >= 600:
                    result["partial"] = True
                    break
                seen.add(identity)
                group_key = (int(semester), period)
                current = groups.setdefault(group_key, {"semester": int(semester), "period": period,
                                                         "courses": [], "credits": 0, "earnedCredits": 0})
                grade = item["grade"][:16]
                current["courses"].append({"code": code, "title": item["description"][:240],
                                           "credits": credit, "grade": grade})
                current["credits"] += credit
                if grade.upper() in PASS_GRADES:
                    current["earnedCredits"] += credit
            # Later matching tables are separate failed-course lists, not history.
            break
        if not recognized:
            return None
        result["semesters"] = sorted(groups.values(), key=lambda group: group["semester"])
        if not result["semesters"]:
            result["status"] = "empty"
        return result
