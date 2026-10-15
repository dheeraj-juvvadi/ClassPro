"""Persist each course's last attendance change for 24 hours after observation."""
import math
DAY = 86400


def valid_count(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def readings(attendance):
    values, counts = {}, {}
    for course in attendance.get("data", []):
        present, total = course.get("present"), course.get("conducted")
        code = course.get("code")
        if valid_count(present) and valid_count(total) and total > 0 and present <= total and code:
            values[code] = 100 * present / total
            counts[code] = [present, total]
    return values, counts


def transition(old, current, code):
    before, after = old["values"][code], current["values"][code]
    if not valid_count(before) or not 0 <= current["at"] - old["at"] <= 3 * DAY:
        return None
    old_counts, counts = old.get("counts", {}).get(code), current.get("counts", {}).get(code)
    changed = counts != old_counts if counts is not None and old_counts is not None else after != before
    if changed:
        return {"points": round(after - before, 2), "from": old["at"] * 1000,
                "to": current["at"] * 1000, "expiresAt": (current["at"] + DAY) * 1000}
    return None


def latest_changes(samples):
    """Recover changes from observations saved before persistent tracking."""
    previous, changes = {}, {}
    for sample in sorted(samples, key=lambda item: item["at"]):
        for code, value in sample["values"].items():
            if not valid_count(value):
                continue
            if code in previous:
                change = transition(previous[code], sample, code)
                if change:
                    changes[code] = change
            previous[code] = sample
    return changes


def observe(entry, timestamp):
    attendance = entry.get("report", {}).get("attendance", {})
    if attendance.get("error") or entry.get("report", {}).get("warnings"):
        return
    values, counts = readings(attendance)
    if not values:
        return
    samples = [sample for sample in entry.get("attendance_samples", [])
               if timestamp - 3 * DAY <= sample["at"] <= timestamp]
    current = {"at": timestamp, "values": values, "counts": counts}
    changes = entry.get("attendance_changes")
    changes = dict(changes) if changes is not None else latest_changes(samples)
    previous = {}
    for sample in samples:
        for code in sample["values"]:
            previous[code] = sample
    for code in values:
        change = transition(previous[code], current, code) if code in previous else None
        if change:
            changes[code] = change
    entry["attendance_changes"] = {code: change for code, change in changes.items()
        if code in values and change["to"] <= timestamp * 1000 < change["expiresAt"]}
    # Unchanged syncs update history without resetting a change's expiry.
    if (samples and timestamp - samples[-1]["at"] < 60
            and samples[-1]["values"] == values and samples[-1].get("counts") == counts):
        samples.pop()
    samples.append(current)
    entry["attendance_samples"] = samples[-200:]


def decorate(entry, timestamp):
    report = entry["report"]
    attendance = report.get("attendance")
    if not attendance or attendance.get("error"):
        return report
    changes = entry.get("attendance_changes")
    if changes is None:
        # Read-only migration for saved sessions; expire against wall-clock time.
        current_at = entry.get("synced_at", timestamp)
        samples = [s for s in entry.get("attendance_samples", []) if s["at"] <= current_at]
        values, counts = readings(attendance)
        samples.append({"at": current_at, "values": values, "counts": counts})
        changes = latest_changes(samples)
    valid, _ = readings(attendance)
    rows = []
    for course in attendance.get("data", []):
        row = dict(course)
        row.pop("change24h", None)
        row.pop("changeSinceSync", None)
        change = changes.get(course.get("code"))
        if (not report.get("warnings") and course.get("code") in valid and change
                and change["to"] <= timestamp * 1000 < change["expiresAt"]):
            row["changeSinceSync"] = dict(change)
        rows.append(row)
    return {**report, "attendance": {**attendance, "data": rows}}
