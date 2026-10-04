"""Separate provider sessions and merge reports without losing schedules."""
import asyncio

def normalize_account(account, provider):
    value = account.strip()
    suffix = "@srmist.edu.in"
    if provider == "academia":
        return value if "@" in value else value + suffix
    # Strip only SRM's known suffix; do not reinterpret unrelated addresses.
    return value[:-len(suffix)] if value.lower().endswith(suffix) else value

def providers(entry):
    states = entry.setdefault("providers", {})
    if not states and entry.get("cookies"):
        states["portal"] = {"cookies": entry["cookies"], "report": entry.get("report", {})}
    return states


def combined(entry):
    states = providers(entry)
    academia = states.get("academia", {}).get("report", {})
    portal = states.get("portal", {}).get("report", {})
    result = {**academia, **portal}
    result["courses"] = {key: dict(value) for key, value in academia.get("courses", {}).items()}
    for key, value in portal.get("courses", {}).items():
        result["courses"][key] = {**result["courses"].get(key, {}),
                                  **{field: item for field, item in value.items() if item not in (None, "")}}
    # Portal attendance wins; retain Academia's schedule when Portal omits it.
    if not portal.get("schedule", {}).get("entries") and academia.get("schedule", {}).get("entries"):
        result["schedule"] = academia["schedule"]
    if result.get("attendance"):
        result["attendance"] = {"data": [{**{key: value for key, value in result.get("courses", {}).get(course.get("code"), {}).items()
                                              if key in {"faculty", "room", "credits", "slot", "type"}}, **course}
                                          for course in result["attendance"].get("data", [])]}
    if result.get("marks"):
        result["marks"] = {**result["marks"], "data": [
            {**course, "credits": course.get("credits") if course.get("credits") is not None
             else result["courses"].get(course.get("code"), {}).get("credits")}
            for course in result["marks"].get("data", [])]}
    result["connections"] = {name: {"connected": True, "expired": state.get("expired", False)}
                             for name, state in states.items()}
    result["scheduleProvider"] = ("portal" if portal.get("schedule", {}).get("entries") else
                                  "academia" if academia.get("schedule", {}).get("entries") else None)
    return result


def same_student(states, provider, data, account):
    for name, state in states.items():
        if name == provider:
            continue
        old = state.get("report", {}).get("profile", {}).get("regNo", "")
        new = (data.get("profile") or {}).get("regNo", "")
        if old and new and old.lower() not in {"unknown", "n/a"} and new.lower() not in {"unknown", "n/a"}:
            if old.strip().casefold() != new.strip().casefold():
                return False
        elif state.get("username", "").split("@")[0].casefold() != account.split("@")[0].casefold():
            return False
    return True


async def refresh(request, entry, invoke, report, exam_refresh=None):
    states = providers(entry)
    warnings = []
    async def refresh_one(name):
        state = states.get(name)
        if not state:
            return False
        payload = {"cookies": state["cookies"]}
        if name == "academia":
            payload["username"] = state["username"]
            saved_batch = str(state.get("report", {}).get("profile", {}).get("batch", ""))
            batch = saved_batch.rsplit("/", 1)[-1].strip()
            if batch in {"1", "2"}:
                payload["batch_hint"] = batch
        response, data = await invoke(request, "/portal/refresh" if name == "portal" else "/refresh", payload)
        if response.status_code == 401 and state.get("password"):
            # This request already established expiry. Do not fetch the entire
            # expired report set a second time before attempting recovery.
            payload.update({"username": state["username"], "password": state["password"],
                            "reauthenticate": True})
            response, data = await invoke(request, "/portal/refresh" if name == "portal" else "/refresh", payload)
        if response.status_code != 200 or data.get("success") is not True:
            state["expired"] = response.status_code == 401
            if name == "portal" and state.get("report", {}).get("exams"):
                state["report"]["exams"] = {**state["report"]["exams"], "stale": True}
            warnings.append(f"{name.title()} could not refresh. Showing its last loaded data; reconnect if needed.")
            return False
        if name == "portal" and exam_refresh:
            data["exams"] = await exam_refresh(data.get("cookies", state["cookies"]),
                                               state.get("report", {}).get("exams"))
        state.update({"cookies": data.get("cookies", state["cookies"]),
                      "report": report(data, state.get("report")), "expired": False})
        return True
    # Separate cookie jars and provider records can refresh concurrently. The
    # existing per-session lock and global refresh queue still bound this work.
    tasks = [asyncio.create_task(refresh_one(name)) for name in ("portal", "academia")]
    try:
        succeeded = any(await asyncio.gather(*tasks))
    except BaseException:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    result = combined(entry)
    if warnings:
        result["warnings"] = warnings
    return result, succeeded
