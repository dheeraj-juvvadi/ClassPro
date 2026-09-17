"""Synthetic persistence benchmark; no live store, credentials or SRM traffic."""
import json
import resource
import tempfile
import time
from session_store import SessionStore


def main():
    sessions = {}
    for index in range(112):
        sessions[f"synthetic-{index}"] = {
            "remember": True, "created": time.monotonic(), "last_seen": time.time(),
            "providers": {"portal": {"username": f"synthetic-{index}",
                "password": "synthetic-only", "cookies": {"session": f"test-{index}"},
                "report": {"courses": [{"code": f"COURSE-{course}",
                    "details": "synthetic-report-data-" * 100} for course in range(20)]}}},
        }
    timings = []
    with tempfile.TemporaryDirectory() as directory:
        store = SessionStore(directory)
        for cycle in range(30):
            started = time.perf_counter()
            store.save(sessions)
            restored = store.load()
            assert len(restored) == 112
            assert restored["synthetic-111"]["providers"] == sessions["synthetic-111"]["providers"]
            timings.append((time.perf_counter() - started) * 1000)
        ordered = sorted(timings)
        print(json.dumps({"synthetic_sessions": 112, "cycles": len(timings),
            "save_restore_median_ms": round(ordered[len(ordered) // 2], 2),
            "save_restore_p95_ms": round(ordered[int(len(ordered) * .95) - 1], 2),
            "save_restore_max_ms": round(max(timings), 2),
            "peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "database_bytes": store.path.stat().st_size,
            "scope": "synthetic persistence only; not login throughput"}))


if __name__ == "__main__":
    main()
