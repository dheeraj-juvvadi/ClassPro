"""Map portal reports and bundled calendar to the public UI contract."""
import json
import re
from datetime import datetime
from pathlib import Path

CALENDAR_SOURCE = "Bundled academic calendar (2026)"


def calendar_days():
    rows = json.loads((Path(__file__).parent / "data/calendar_data.json").read_text())
    days = []
    for row in rows:
        date = datetime.strptime(row["date"], "%d %b %Y").date().isoformat()
        order = str(row.get("order", ""))
        label = row.get("description", "")
        if order in {"1", "2", "3", "4", "5"}:
            days.append({"date": date, "kind": "teaching", "dayOrder": order, "label": label})
        elif "holiday" in label.lower() or row.get("day") in {"Sat", "Sun"}:
            days.append({"date": date, "kind": "holiday", "label": label or "Holiday"})
    return days


CALENDAR = calendar_days()


def clock_time(value):
    hour, minute = map(int, value.split(":"))
    # The timetable uses afternoon times such as 01:40.
    if hour < 7:
        hour += 12
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError("Invalid timetable time")
    return f"{hour:02}:{minute:02}"


def schedule_report(raw):
    entries = []
    for day, periods in (raw or {}).items():
        match = re.fullmatch(r"Day\s+([1-5])", day, re.I)
        if not match or not isinstance(periods, dict):
            continue
        for period, course in periods.items():
            times = re.fullmatch(r"\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*", period)
            if not times or not isinstance(course, dict):
                continue
            try:
                start, end = [clock_time(part) for part in times.groups()]
            except ValueError:
                continue
            code = course.get("courseCode") or course.get("code")
            if not code or start >= end:
                continue
            minutes = lambda time: int(time[:2]) * 60 + int(time[3:])
            entries.append({"dayOrder": match[1], "start": start, "end": end,
                            "code": code, "title": course.get("courseTitle") or course.get("name") or course.get("course") or code,
                            "room": course.get("room") or "Room unavailable",
                            "faculty": course.get("faculty", ""),
                            "allocation": course.get("type") or "Theory",
                            "hours": max(1, int((minutes(end) - minutes(start)) / 50 + 0.5))})
    return {"timezone": "Asia/Kolkata", "entries": entries,
            "calendar": CALENDAR, "calendarSource": CALENDAR_SOURCE}


def extras(data, previous=None):
    previous = previous or {}
    courses = data.get("courses", previous.get("courses", {}))
    courses = courses if isinstance(courses, dict) else {}
    courses = {value.get("code", key): value for key, value in courses.items() if isinstance(value, dict)}
    attendance = []
    for course in data.get("attendance", []):
        details = courses.get(course.get("code"), {})
        normalized = dict(course)
        if "present" not in normalized and isinstance(course.get("conducted"), int) and isinstance(course.get("absent"), int):
            normalized["present"] = max(0, course["conducted"] - course["absent"])
        attendance.append({**normalized, **{key: details[key] for key in
                           ("faculty", "room", "credits", "slot", "type") if key in details}})
    profile = dict(data.get("profile") or previous.get("profile") or {})
    history = data.get("academicHistory")
    if not history or history.get("status") == "unavailable":
        old_history = previous.get("academicHistory")
        history = {**old_history, "stale": True} if old_history else {"status": "unavailable"}
    if history.get("status") in {"ready", "empty"}:
        for field in ("currentCgpa", "completedCredits"):
            if field in history:
                profile[field] = history[field]
            elif not history.get("stale") and field not in (data.get("profile") or {}):
                profile.pop(field, None)
        profile["academicSummarySource"] = "Student Portal"
    return {"attendance": {"data": attendance}, "courses": courses,
            "academicHistory": history,
            "monthly": data.get("monthly", previous.get("monthly", [])),
            "profile": {key: profile[key] for key in
                        ("name", "regNo", "batch", "semester", "dept", "section", "program", "currentCgpa", "completedCredits", "academicSummarySource") if key in profile},
            "schedule": schedule_report(data["schedule"]) if data.get("schedule") else
                        previous.get("schedule", schedule_report({}))}
