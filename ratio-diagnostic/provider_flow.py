"""Separate provider sessions and merge Ratio-D reports without losing schedules."""

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
    # Portal attendance wins; retain Academia's schedule when Portal omits it.
    if not portal.get("schedule", {}).get("entries") and academia.get("schedule", {}).get("entries"):
        result["schedule"] = academia["schedule"]
        result["courses"] = {**academia.get("courses", {}), **portal.get("courses", {})}
    if result.get("attendance"):
        result["attendance"] = {"data": [{**{key: value for key, value in result.get("courses", {}).get(course.get("code"), {}).items()
                                              if key in {"faculty", "room", "credits", "slot", "type"}}, **course}
                                          for course in result["attendance"].get("data", [])]}
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


async def refresh(request, entry, invoke, report):
    states = providers(entry)
    warnings = []
    succeeded = False
    # Portal first, as in Ratio-D. Also refresh Academia when its timetable is needed.
    for name in ("portal", "academia"):
        state = states.get(name)
        if not state:
            continue
        payload = {"cookies": state["cookies"]}
        if name == "academia":
            payload["username"] = state["username"]
        response, data = await invoke(request, "/portal/refresh" if name == "portal" else "/refresh", payload)
        if response.status_code == 401 and state.get("password"):
            payload.update({"username": state["username"], "password": state["password"]})
            response, data = await invoke(request, "/portal/refresh" if name == "portal" else "/refresh", payload)
        if response.status_code != 200 or data.get("success") is not True:
            state["expired"] = response.status_code == 401
            warnings.append(f"{name.title()} could not refresh. Showing its last loaded data; reconnect if needed.")
            continue
        state.update({"cookies": data.get("cookies", state["cookies"]),
                      "report": report(data, state.get("report")), "expired": False})
        succeeded = True
    result = combined(entry)
    if warnings:
        result["warnings"] = warnings
    return result, succeeded
