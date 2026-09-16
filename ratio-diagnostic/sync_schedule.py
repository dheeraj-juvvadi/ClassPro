"""IST report refresh slots; no work is scheduled for inactive browsers."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HOURS = (*range(8, 20), 21, 23)
IST = ZoneInfo("Asia/Kolkata")


def latest_slot(timestamp):
    now = datetime.fromtimestamp(timestamp, IST)
    for hour in reversed(HOURS):
        slot = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if slot <= now:
            return slot.timestamp()
    return (now - timedelta(days=1)).replace(hour=23, minute=0, second=0, microsecond=0).timestamp()


def next_slot(timestamp):
    now = datetime.fromtimestamp(timestamp, IST)
    for hour in HOURS:
        slot = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if slot > now:
            return slot.timestamp()
    return (now + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0).timestamp()


def due(entry, timestamp):
    return max(entry.get("synced_at", 0), entry.get("sync_attempted_at", 0)) < latest_slot(timestamp)


def response(entry, timestamp):
    return {**entry["report"], "sync": {
        "nextAt": next_slot(timestamp) * 1000,
        "due": due(entry, timestamp),
        "syncedAt": entry.get("synced_at", 0) * 1000,
    }}
