import asyncio
import os
import unittest
from types import SimpleNamespace

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import server
from core.academia_reports import fetch_academia_reports, normalized_batch


def profile(batch):
    return f"<table><tr><td>Student Name</td><td>Synthetic</td></tr><tr><td>Batch</td><td>{batch}</td></tr></table>"


class AcademiaFetchTests(unittest.IsolatedAsyncioTestCase):
    def test_only_known_batch_values_are_accepted(self):
        for value, expected in [("1", "1"), ("2026/2", "2"), (" 2 ", "2"),
                                ("N/A", None), ("3", None), (None, None)]:
            self.assertEqual(normalized_batch(value), expected)

    async def test_saved_batch_does_not_request_the_other_grid(self):
        calls = []

        async def page():
            return profile("2026/1")

        async def attendance():
            return "attendance"

        async def grid(batch):
            calls.append(batch)
            return batch

        client = SimpleNamespace(get_profile_html=page, get_attendance_html=attendance, get_grid_html=grid)
        result = await fetch_academia_reports(client, "1")
        self.assertEqual(result, (profile("2026/1"), "Batch_1", None, "attendance"))
        self.assertEqual(calls, ["Batch_1"])

    async def test_changed_batch_cancels_wrong_grid_and_fetches_current_one(self):
        started, cancelled = asyncio.Event(), asyncio.Event()
        calls = []

        async def page():
            await started.wait()
            return profile("2")

        async def attendance():
            return "attendance"

        async def grid(batch):
            calls.append(batch)
            if batch == "batch_2":
                return "new-grid"
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        client = SimpleNamespace(get_profile_html=page, get_attendance_html=attendance, get_grid_html=grid)
        result = await asyncio.wait_for(fetch_academia_reports(client, "1"), .5)
        self.assertEqual(result[1:3], (None, "new-grid"))
        self.assertTrue(cancelled.is_set())
        self.assertEqual(calls, ["Batch_1", "batch_2"])

    async def test_new_session_does_not_wait_for_slow_unused_batch(self):
        cancelled = asyncio.Event()

        async def page():
            await asyncio.sleep(0)
            return profile("1")

        async def attendance():
            return "attendance"

        async def grid(batch):
            if batch == "Batch_1":
                return "selected-grid"
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        client = SimpleNamespace(get_profile_html=page, get_attendance_html=attendance, get_grid_html=grid)
        result = await asyncio.wait_for(fetch_academia_reports(client, require_profile=True), .5)
        self.assertEqual(result[1:3], ("selected-grid", None))
        self.assertTrue(cancelled.is_set())

    async def test_unknown_batch_preserves_both_grid_fallback(self):
        async def page():
            return profile("N/A")

        async def attendance():
            return "attendance"

        async def grid(batch):
            return batch

        client = SimpleNamespace(get_profile_html=page, get_attendance_html=attendance, get_grid_html=grid)
        result = await fetch_academia_reports(client, "1")
        self.assertEqual(result[1:3], ("Batch_1", "batch_2"))

    async def test_expired_session_does_not_wait_for_grid_timeouts(self):
        started, stopped = asyncio.Event(), []

        async def page():
            await started.wait()
            return None

        async def grid(batch):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                stopped.append(batch)

        client = SimpleNamespace(get_profile_html=page, get_attendance_html=page, get_grid_html=grid)
        result = await asyncio.wait_for(fetch_academia_reports(client), .5)
        self.assertEqual(result, (None, None, None, None))
        self.assertCountEqual(stopped, ["Batch_1", "batch_2"])

    async def test_cancelling_call_drains_all_cookie_jar_requests(self):
        started, stopped = asyncio.Event(), []

        async def slow(*args):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                stopped.append(True)

        client = SimpleNamespace(get_profile_html=slow, get_attendance_html=slow, get_grid_html=slow)
        task = asyncio.create_task(fetch_academia_reports(client, "2"))
        await started.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(len(stopped), 3)

    async def test_failed_unused_grid_cannot_discard_successful_reports(self):
        async def page():
            await asyncio.sleep(0)
            return profile("1")

        async def attendance():
            return "attendance"

        async def grid(batch):
            if batch == "batch_2":
                raise RuntimeError("unused synthetic timeout")
            return "selected"

        client = SimpleNamespace(get_profile_html=page, get_attendance_html=attendance, get_grid_html=grid)
        result = await fetch_academia_reports(client)
        self.assertEqual(result[1:], ("selected", None, "attendance"))

    async def test_failed_attendance_does_not_wait_for_slow_profile(self):
        stopped = []

        async def slow(*args):
            try:
                await asyncio.Event().wait()
            finally:
                stopped.append(True)

        async def attendance():
            raise RuntimeError("attendance unavailable")

        client = SimpleNamespace(get_profile_html=slow, get_attendance_html=attendance, get_grid_html=slow)
        with self.assertRaisesRegex(RuntimeError, "attendance unavailable"):
            await asyncio.wait_for(fetch_academia_reports(client, "1"), .5)
        self.assertEqual(len(stopped), 2)

    async def test_failed_selected_grid_does_not_wait_for_slow_attendance(self):
        stopped = asyncio.Event()

        async def page():
            return profile("1")

        async def attendance():
            try:
                await asyncio.Event().wait()
            finally:
                stopped.set()

        async def grid(batch):
            raise RuntimeError("selected grid unavailable")

        client = SimpleNamespace(get_profile_html=page, get_attendance_html=attendance, get_grid_html=grid)
        with self.assertRaisesRegex(RuntimeError, "selected grid unavailable"):
            await asyncio.wait_for(fetch_academia_reports(client, "1"), .5)
        self.assertTrue(stopped.is_set())
