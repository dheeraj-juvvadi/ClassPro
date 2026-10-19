"""One-shot automatic retry cycles for failed providers and exams.

State is JSON-serializable and lives inside the encrypted session entry, so the
allowance survives restarts without a scheduler or background task. The server
arms a cycle only after a failed attempt finishes; a matching, due request may
consume the single allowance exactly once. Nothing here keeps time on its own.
"""
import secrets

DELAY_SECONDS = 60


def sources(values):
    return sorted({str(value) for value in values if value})


def arm(failed, now, delay=DELAY_SECONDS):
    """Start a fresh cycle with one retry due `delay` seconds from `now`."""
    failed = sources(failed)
    if not failed:
        return None
    return {"id": secrets.token_hex(8), "sources": failed,
            "at": float(now) + delay, "consumed": False, "exhausted": False}


def matches(state, retry_id):
    return bool(isinstance(state, dict) and retry_id and state.get("id") == retry_id)


def due(state, now):
    return bool(isinstance(state, dict) and not state.get("consumed")
                and float(now) >= state.get("at", 0))


def consume(state):
    if isinstance(state, dict):
        state["consumed"] = True


def settle(state, failed):
    """Finish a consumed retry: clear on recovery, else mark it exhausted."""
    failed = sources(failed)
    if not failed or not isinstance(state, dict):
        return None
    state["sources"] = failed
    state["consumed"] = True
    state["exhausted"] = True
    return state


def view(state, now=None):
    """Contract view: null, or the current cycle's public metadata."""
    if not isinstance(state, dict) or not state.get("id"):
        return None
    return {"id": state["id"], "pending": not state.get("consumed", False),
            "at": int(float(state.get("at", 0)) * 1000),
            "sources": sources(state.get("sources", [])),
            "exhausted": bool(state.get("exhausted", False))}
