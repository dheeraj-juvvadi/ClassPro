import unittest
from datetime import datetime
from sync_schedule import IST, due, latest_slot, next_slot


def stamp(day, hour, minute=0):
    return datetime(2026, 9, day, hour, minute, tzinfo=IST).timestamp()


class SyncScheduleTests(unittest.TestCase):
    def test_hour_boundaries(self):
        self.assertEqual(latest_slot(stamp(16, 7, 59)), stamp(15, 23))
        for hour in range(8, 20):
            self.assertEqual(latest_slot(stamp(16, hour, 1)), stamp(16, hour))
        self.assertEqual(latest_slot(stamp(16, 20)), stamp(16, 19))
        self.assertEqual(latest_slot(stamp(16, 22)), stamp(16, 21))
        self.assertEqual(next_slot(stamp(16, 19)), stamp(16, 21))
        self.assertEqual(next_slot(stamp(16, 21)), stamp(16, 23))
        self.assertEqual(next_slot(stamp(16, 23)), stamp(17, 8))

    def test_cached_and_failed_slots_do_not_repeat(self):
        self.assertFalse(due({"synced_at": stamp(16, 9, 15)}, stamp(16, 9, 59)))
        self.assertTrue(due({"synced_at": stamp(16, 9, 15)}, stamp(16, 10)))
        self.assertFalse(due({"sync_attempted_at": stamp(16, 10)}, stamp(16, 10, 59)))
        self.assertFalse(due({"synced_at": stamp(16, 23)}, stamp(17, 7, 59)))


class SyncRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_cache_reads_scheduled_refresh_and_manual_override(self):
        import os
        os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
        import server
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, patch
        report = {"attendance": {"data": []}}
        entry = {"providers": {"portal": {"report": report}}, "report": report,
                 "synced_at": stamp(16, 9)}
        request = SimpleNamespace(cookies={server.cookie_name: "sync-test"}, query_params={"cache": "only"})
        server.sessions["sync-test"] = entry
        try:
            with patch("server.time.time", return_value=stamp(16, 10)), patch("server.refresh_providers", new_callable=AsyncMock, return_value=(report, True)) as refresh:
                result = await server.reports(request)
                self.assertTrue(result["sync"]["due"])
                refresh.assert_not_awaited()
                request.query_params = {}
                await server.reports(request)
                await server.reports(request)
                self.assertEqual(refresh.await_count, 1)
                request.query_params = {"force": "1"}
                await server.reports(request)
                self.assertEqual(refresh.await_count, 2)
        finally:
            server.sessions.pop("sync-test", None)
