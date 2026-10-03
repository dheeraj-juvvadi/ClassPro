"""Bounded attendance observations, persisted with the encrypted session."""
DAY = 86400


def observe(entry, timestamp):
    attendance = entry.get("report", {}).get("attendance", {})
    if attendance.get("error") or entry.get("report", {}).get("warnings"):
        return
    values = {}
    for course in attendance.get("data", []):
        present, total = course.get("present"), course.get("conducted")
        if (isinstance(present, (int, float)) and isinstance(total, (int, float))
                and total > 0 and 0 <= present <= total and course.get("code")):
            values[course["code"]] = 100 * present / total
    if not values:
        return
    samples = [sample for sample in entry.get("attendance_samples", [])
               if timestamp - 3 * DAY <= sample["at"] <= timestamp]
    # Multiple manual refreshes in one minute share an observation.
    if samples and timestamp - samples[-1]["at"] < 60:
        samples.pop()
    samples.append({"at": timestamp, "values": values})
    entry["attendance_samples"] = samples[-200:]


def decorate(entry, timestamp):
    report = entry["report"]
    attendance = report.get("attendance")
    if not attendance or attendance.get("error"):
        return report
    # Do not present a stale reading as an exact 24-hour comparison.
    current_at = entry.get("synced_at", timestamp)
    cutoff = current_at - DAY
    candidates = [s for s in entry.get("attendance_samples", []) if cutoff - 7200 <= s["at"] <= cutoff]
    baseline = max(candidates, key=lambda s: s["at"], default=None)
    rows = []
    for course in attendance.get("data", []):
        row = dict(course)
        row.pop("change24h", None)
        old = baseline["values"].get(course.get("code")) if baseline else None
        present, total = course.get("present"), course.get("conducted")
        if old is not None and isinstance(present, (int, float)) and isinstance(total, (int, float)) and total > 0 and 0 <= present <= total:
            row["change24h"] = {"points": round(100 * present / total - old, 2),
                                "from": baseline["at"] * 1000, "to": current_at * 1000}
        rows.append(row)
    return {**report, "attendance": {**attendance, "data": rows}}
