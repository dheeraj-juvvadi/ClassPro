#!/usr/bin/env python3
"""Report old release-log metadata. Never read contents or change files."""

import argparse
import json
import os
from pathlib import Path
import re
import stat
import time

SHA = re.compile(r"[a-f0-9]{40}")
LOG_NAMES = ("build.log", "tests.log")


def audit(root, *, keep_days=30, keep_newest=3, protect=(), limit=20, now=None):
    if keep_days < 1 or keep_newest < 1 or not 1 <= limit <= 50:
        raise ValueError("Retention must be positive; output limit must be 1–50.")
    if any(not SHA.fullmatch(value) for value in protect):
        raise ValueError("Protected releases must be full lowercase commit SHAs.")
    root = Path(root)
    if not stat.S_ISDIR(root.lstat().st_mode):
        raise ValueError("Root must be a real directory, not a symlink.")
    now = time.time() if now is None else now
    cutoff = now - keep_days * 86400
    releases = []
    with os.scandir(root) as entries:
        for entry in entries:
            if SHA.fullmatch(entry.name) and entry.is_dir(follow_symlinks=False):
                releases.append((entry.stat(follow_symlinks=False).st_mtime,
                                 entry.name, Path(entry.path)))
    releases.sort(reverse=True)
    protected = set(protect) | {sha for _, sha, _ in releases[:keep_newest]}
    candidates = []
    for modified, sha, directory in releases:
        if sha in protected or modified >= cutoff:
            continue
        for name in LOG_NAMES:
            try:
                metadata = (directory / name).lstat()
            except FileNotFoundError:
                continue
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_mtime >= cutoff:
                continue
            # Shared hard links do not yield the reported bytes when removed.
            if metadata.st_nlink != 1:
                continue
            candidates.append({"release": sha, "file": name,
                               "logical_bytes": metadata.st_size,
                               "age_days": int((now - metadata.st_mtime) // 86400)})
    candidates.sort(key=lambda item: (-item["age_days"], item["release"], item["file"]))
    return {
        "mode": "dry-run",
        "keep_days": keep_days,
        "keep_newest": keep_newest,
        "release_directories": len(releases),
        "protected_directories": sum(sha in protected for _, sha, _ in releases),
        "candidate_files": len(candidates),
        "candidate_logical_bytes": sum(item["logical_bytes"] for item in candidates),
        "candidates": candidates[:limit],
        "omitted_candidates": max(0, len(candidates) - limit),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Explicit local release directory")
    parser.add_argument("--keep-days", type=int, default=30)
    parser.add_argument("--keep-newest", type=int, default=3,
                        help="Protect newest directories by directory mtime (default: 3)")
    parser.add_argument("--protect", action="append", default=[], metavar="SHA",
                        help="Also protect an active/rollback release; repeat as needed")
    parser.add_argument("--limit", type=int, default=20, help="Listed candidates, 1–50")
    args = parser.parse_args()
    try:
        result = audit(args.root, keep_days=args.keep_days, keep_newest=args.keep_newest,
                       protect=args.protect, limit=args.limit)
    except ValueError as error:
        parser.error(str(error))
    except OSError:
        parser.exit(2, "Cannot inspect release metadata; check the root and permissions.\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
