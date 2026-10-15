"""Read-only Docker telemetry; emits aggregates, never log lines or session data."""
import argparse
from collections import Counter, OrderedDict, defaultdict
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import statistics
import subprocess
import time

ROUTES = {"/login", "/refresh", "/portal/captcha", "/portal/login", "/portal/refresh"}
OUTCOMES = {"success", "failed", "discarded", "queue_timeout", "cancelled"}


def summary(values):
    if not values:
        return {"n": 0}
    ordered = sorted(values)
    return {"n": len(values), "median": round(statistics.median(values), 3),
            "p95": round(ordered[math.ceil(len(values) * .95) - 1], 3),
            "max": round(ordered[-1], 3)}


def number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def logs(container, since):
    groups = defaultdict(list)
    outcomes, statuses, hours = Counter(), Counter(), defaultdict(Counter)
    pending = OrderedDict()
    first = last = None
    ignored = 0
    process = subprocess.Popen(["docker", "logs", "--since", since, "--timestamps", container],
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    for raw in process.stdout:
        if len(raw) > 65536:
            ignored += 1
            continue
        try:
            stamp, body = raw.decode("utf-8").split(" ", 1)
            parsed = datetime.fromisoformat(stamp[:26] + "+00:00")
            row = json.loads(body)
            if not isinstance(row, dict):
                continue
        except (ValueError, UnicodeDecodeError):
            continue
        event = row.get("event")
        if event not in {"portal_request", "refresh_finished", "portal_exception", "session_persist_failed"}:
            continue
        first = min(first, parsed) if first else parsed
        last = max(last, parsed) if last else parsed
        hour = parsed.strftime("%Y-%m-%dT%H:00Z")
        hours[hour][event] += 1
        trace = row.get("request_id")
        if not isinstance(trace, str) or len(trace) > 128:
            trace = None
        duration = row.get("duration_ms")
        if event == "portal_request" and number(duration):
            route = row.get("route") if row.get("route") in ROUTES else "other"
            status = row.get("status")
            code = str(status) if isinstance(status, int) and 100 <= status <= 599 else "other"
            statuses[f"{route} {code}"] += 1
            groups[f"provider_ms:{route}:{code}"].append(duration)
            if trace:
                record = pending.setdefault(trace, {"sum": 0, "max": 0, "n": 0})
                record["sum"] += duration
                record["max"] = max(record["max"], duration)
                record["n"] += 1
                pending.move_to_end(trace)
                if len(pending) > 4096:
                    pending.popitem(last=False)
        elif event == "refresh_finished":
            outcome = row.get("outcome") if row.get("outcome") in OUTCOMES else "other"
            outcomes[outcome] += 1
            hours[hour]["refresh_" + outcome] += 1
            if number(duration):
                groups[f"refresh_ms:{outcome}"].append(duration)
            queue = row.get("queue_ms")
            if number(queue):
                groups[f"queue_ms:{outcome}"].append(queue)
            record = pending.pop(trace, None)
            if record and number(duration):
                groups[f"matched_provider_max_ms:{outcome}"].append(record["max"])
                groups[f"matched_provider_sum_ms:{outcome}"].append(record["sum"])
                groups[f"refresh_minus_longest_provider_ms:{outcome}"].append(max(0, duration - record["max"]))
    code = process.wait(timeout=10)
    if code:
        raise RuntimeError("Docker logs command failed")
    return {"since": since, "first_event": first.isoformat() if first else None,
            "last_event": last.isoformat() if last else None, "oversize_lines_skipped": ignored,
            "provider_status_counts": dict(statuses), "refresh_outcomes": dict(outcomes),
            "timings": {key: summary(value) for key, value in sorted(groups.items())},
            "hourly_events": dict(sorted(hours.items())),
            "limits": "Provider spans include network, parsing and internal response handling; overlapping spans must not be added as elapsed time. Public/cache-only requests are not logged."}


def fields(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        pieces = line.replace(":", "").split()
        if len(pieces) >= 2:
            try:
                result[pieces[0]] = int(pieces[1])
            except ValueError:
                pass
    return result


def resources(container, samples, interval):
    raw = subprocess.check_output(["docker", "inspect", "--format",
        "{{.State.Pid}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.RestartCount}}", container], text=True)
    pid, memory_limit, nano_cpus, restarts = map(int, raw.split())
    cgroup_path = next(line.split(":", 2)[2] for line in Path(f"/proc/{pid}/cgroup").read_text().splitlines()
                       if line.startswith("0::"))
    cgroup = Path("/sys/fs/cgroup") / cgroup_path.lstrip("/")
    readings = []
    for index in range(samples):
        status = fields(f"/proc/{pid}/status")
        host = fields("/proc/meminfo")
        memstat = fields(cgroup / "memory.stat")
        readings.append({"monotonic": time.monotonic(),
            "cpu": fields(cgroup / "cpu.stat"),
            "cgroup_mib": int((cgroup / "memory.current").read_text()) / 2**20,
            "anon_mib": memstat.get("anon", 0) / 2**20,
            "file_mib": memstat.get("file", 0) / 2**20,
            "process_rss_mib": status.get("VmRSS", 0) / 1024,
            "process_peak_rss_mib": status.get("VmHWM", 0) / 1024,
            "threads": status.get("Threads", 0),
            "host_available_mib": host.get("MemAvailable", 0) / 1024})
        if index + 1 < samples:
            time.sleep(interval)
    cpu = []
    throttled = []
    for before, after in zip(readings, readings[1:]):
        elapsed = after["monotonic"] - before["monotonic"]
        cpu.append((after["cpu"]["usage_usec"] - before["cpu"]["usage_usec"]) / elapsed / 10000)
        throttled.append(after["cpu"].get("nr_throttled", 0) - before["cpu"].get("nr_throttled", 0))
    return {"samples": samples, "interval_seconds": interval,
            "memory_limit_mib": memory_limit / 2**20, "cpu_quota_cores": nano_cpus / 1e9,
            "container_restarts": restarts, "cpu_percent_of_one_core": summary(cpu),
            "throttled_periods_during_sample": sum(throttled),
            "memory_events_since_start": fields(cgroup / "memory.events"),
            "measurements": {key: summary([row[key] for row in readings]) for key in readings[0]
                             if key not in {"cpu", "monotonic"}}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", default="anon-api")
    parser.add_argument("--since", default="72h")
    parser.add_argument("--samples", type=int, default=6)
    parser.add_argument("--interval", type=float, default=10)
    parser.add_argument("--mode", choices=["logs", "resources"], required=True)
    args = parser.parse_args()
    if not 2 <= args.samples <= 61 or not 0 < args.interval <= 30:
        parser.error("Use 2–61 samples and a 0–30 second interval")
    result = logs(args.container, args.since) if args.mode == "logs" else resources(args.container, args.samples, args.interval)
    print(json.dumps({"observed_at": datetime.now(timezone.utc).isoformat(), args.mode: result}, indent=2))


if __name__ == "__main__":
    main()
