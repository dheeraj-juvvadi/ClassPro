"""Offline checks for the metadata-only release-log audit."""

import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("release-log-audit.py")
SPEC = importlib.util.spec_from_file_location("release_log_audit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
NOW = 2_000_000_000
DAY = 86400


class ReleaseLogAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="release-log-audit-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def release(self, number, age, names=("build.log", "tests.log")):
        directory = self.root / f"{number:040x}"
        directory.mkdir()
        for name in names:
            target = directory / name
            target.write_bytes(b"fixture")
            os.utime(target, (NOW - age * DAY,) * 2)
        os.utime(directory, (NOW - age * DAY,) * 2)
        return directory

    def test_default_retention_keeps_three_newest_even_when_all_are_old(self):
        for number, age in enumerate((40, 50, 60, 70), 1):
            self.release(number, age)
        result = MODULE.audit(self.root, now=NOW)
        self.assertEqual(result["protected_directories"], 3)
        self.assertEqual(result["candidate_files"], 2)
        self.assertEqual(result["candidate_logical_bytes"], 14)
        self.assertEqual({item["release"] for item in result["candidates"]}, {f"{4:040x}"})

    def test_protected_release_recent_file_and_exact_cutoff_are_kept(self):
        old = self.release(1, 90)
        self.release(2, 80)
        self.release(3, 70)
        self.release(4, 60)
        os.utime(old / "tests.log", (NOW - 30 * DAY,) * 2)
        result = MODULE.audit(self.root, now=NOW, keep_newest=1,
                              protect=[f"{2:040x}", f"{3:040x}"])
        self.assertEqual([item["file"] for item in result["candidates"]], ["build.log"])

    def test_only_named_regular_logs_are_reported_without_reading_contents(self):
        old = self.release(1, 90, ("build.log", "notes.txt", "payload.bin"))
        self.release(2, 1)
        (old / "tests.log").symlink_to(old / "payload.bin")
        (self.root / f"{3:040x}").symlink_to(old, target_is_directory=True)
        ignored = self.root / "incident-backup"
        ignored.mkdir()
        (ignored / "build.log").write_bytes(b"fixture")
        os.utime(old, (NOW - 90 * DAY,) * 2)
        before = {item.name: item.lstat() for item in old.iterdir()}
        with patch("builtins.open", side_effect=AssertionError("No content reads")), \
                patch.object(Path, "open", side_effect=AssertionError("No content reads")):
            result = MODULE.audit(self.root, now=NOW, keep_newest=1)
        self.assertEqual(result["release_directories"], 2)
        self.assertEqual([item["file"] for item in result["candidates"]], ["build.log"])
        self.assertEqual(before, {item.name: item.lstat() for item in old.iterdir()})

    def test_hardlinks_are_not_counted_and_output_is_bounded(self):
        old = self.release(1, 90)
        os.link(old / "build.log", self.root / "shared.log")
        for number in range(2, 10):
            self.release(number, 90 + number)
        self.release(10, 1)
        result = MODULE.audit(self.root, now=NOW, keep_newest=1, limit=2)
        self.assertEqual(result["candidate_files"], 17)
        self.assertEqual(result["candidate_logical_bytes"], 119)
        self.assertEqual(len(result["candidates"]), 2)
        self.assertEqual(result["omitted_candidates"], 15)

    def test_empty_root_and_invalid_retention(self):
        self.assertEqual(MODULE.audit(self.root, now=NOW)["candidate_files"], 0)
        for options in ({"keep_days": 0}, {"keep_newest": 0}, {"limit": 0},
                        {"limit": 51}, {"protect": ["short"]}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                MODULE.audit(self.root, now=NOW, **options)

    def test_symlink_root_is_rejected_and_cli_has_no_apply_mode(self):
        link = self.root / "link"
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError):
            MODULE.audit(link, now=NOW)
        result = subprocess.run([sys.executable, str(SCRIPT), str(self.root), "--apply"],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn("unrecognized arguments", result.stderr)


if __name__ == "__main__":
    unittest.main()
