"""Synthetic persistence benchmark; no live store, credentials or SRM traffic."""
import argparse
import json
import resource
import tempfile
import time
from session_store import SessionStore


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", type=int, default=112)
    parser.add_argument("--cycles", type=int, default=10)
    args = parser.parse_args()
    sessions = {}
    for index in range(args.sessions):
        sessions[f"synthetic-{index}"] = {
            "remember": True, "created": time.monotonic(), "last_seen": time.time(),
            "providers": {"portal": {"username": f"synthetic-{index}",
                "password": "synthetic-only", "cookies": {"session": f"test-{index}"},
                "report": {"courses": [{"code": f"COURSE-{course}",
                    "details": "synthetic-report-data-" * 100} for course in range(20)]}}},
        }
    timings = []
    incremental = []
    with tempfile.TemporaryDirectory() as directory:
        store = SessionStore(directory)
        for cycle in range(args.cycles):
            started = time.perf_counter()
            store.save(sessions)
            restored = store.load()
            assert len(restored) == args.sessions
            assert restored[f"synthetic-{args.sessions-1}"]["providers"] == sessions[f"synthetic-{args.sessions-1}"]["providers"]
            timings.append((time.perf_counter() - started) * 1000)
            del restored
            started = time.perf_counter()
            for index in range(100):
                token = f"synthetic-{index % args.sessions}"
                sessions[token]["last_seen"] = time.time()
                store.save_changes({token: sessions[token]})
            incremental.append((time.perf_counter() - started) * 10)
        ordered = sorted(timings)
        print(json.dumps({"synthetic_sessions": args.sessions, "cycles": len(timings),
            "save_restore_median_ms": round(ordered[len(ordered) // 2], 2),
            "save_restore_p95_ms": round(ordered[int(len(ordered) * .95) - 1], 2),
            "save_restore_max_ms": round(max(timings), 2),
            "peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "database_bytes": store.path.stat().st_size,
            "incremental_save_mean_ms": round(sum(incremental) / len(incremental), 3),
            "scope": "synthetic persistence only; not login throughput"}))


if __name__ == "__main__":
    main()
