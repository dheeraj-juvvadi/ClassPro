"""IST report refresh slots; no work is scheduled for inactive browsers."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from attendance_trends import decorate

HOURS = (*range(8, 20), 21, 23)
IST = ZoneInfo("Asia/Kolkata")


def latest_slot(timestamp):
    now = datetime.fromtimestamp(timestamp, IST)
    while now.weekday() == 6:
        now = (now - timedelta(days=1)).replace(hour=23, minute=59)
    for hour in reversed(HOURS):
        slot = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if slot <= now:
            return slot.timestamp()
    previous = now - timedelta(days=1)
    if previous.weekday() == 6:
        previous -= timedelta(days=1)
    return previous.replace(hour=23, minute=0, second=0, microsecond=0).timestamp()


def next_slot(timestamp):
    now = datetime.fromtimestamp(timestamp, IST)
    for offset in range(3):
        day = now + timedelta(days=offset)
        if day.weekday() == 6:
            continue
        for hour in HOURS:
            slot = day.replace(hour=hour, minute=0, second=0, microsecond=0)
            if slot > now:
                return slot.timestamp()



def due(entry, timestamp):
    if datetime.fromtimestamp(timestamp, IST).weekday() == 6:
        return False
    return max(entry.get("synced_at", 0), entry.get("sync_attempted_at", 0)) < latest_slot(timestamp)


def response(entry, timestamp):
    return {**decorate(entry, timestamp), "sync": {
        "nextAt": next_slot(timestamp) * 1000,
        "due": due(entry, timestamp),
        "syncedAt": entry.get("synced_at", 0) * 1000,
    }}
