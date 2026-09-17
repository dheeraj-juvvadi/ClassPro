import asyncio
import io
import os
import sys
import threading
import unittest
from unittest.mock import patch

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import server
from provider_flow import normalize_account


class ConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_same_session_serializes_but_other_sessions_progress(self):
        entered, release, other = asyncio.Event(), asyncio.Event(), asyncio.Event()
        order = []

        async def first(request):
            entered.set()
            await release.wait()
            order.append(1)

        async def second(request):
            order.append(2)

        async def independent(request):
            other.set()

        one = asyncio.create_task(server.dispatch(None, first, "same"))
        await entered.wait()
        two = asyncio.create_task(server.dispatch(None, second, "same"))
        three = asyncio.create_task(server.dispatch(None, independent, "other"))
        await asyncio.wait_for(other.wait(), 1)
        self.assertEqual(order, [])
        release.set()
        await asyncio.gather(one, two, three)
        self.assertEqual(order, [1, 2])
        self.assertEqual(len(server.session_locks), 0)

    async def test_cancelled_ocr_keeps_slot_until_native_worker_exits(self):
        started, finish = threading.Event(), threading.Event()

        def solve(image):
            started.set()
            finish.wait(2)
            return "TEST"

        slots = asyncio.Semaphore(1)
        with patch.object(server, "ocr_slots", slots), patch.object(server.ocr, "solve", solve):
            task = asyncio.create_task(server.solve_image(b"synthetic"))
            try:
                await asyncio.to_thread(started.wait, 1)
                self.assertTrue(started.is_set())
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                self.assertTrue(slots.locked())
            finally:
                finish.set()
            await asyncio.wait_for(slots.acquire(), 2)
            slots.release()

    async def test_upstream_print_is_silent_without_changing_stdout(self):
        output = io.StringIO()
        with patch.object(sys, "stdout", output):
            server.upstream.print("synthetic sensitive value")
            print("safe diagnostic")
            self.assertIs(sys.stdout, output)
        self.assertEqual(output.getvalue(), "safe diagnostic\n")

    def test_shared_id_normalization(self):
        self.assertEqual(normalize_account(" student ", "academia"), "student@srmist.edu.in")
        self.assertEqual(normalize_account("student@SRMIST.EDU.IN", "portal"), "student")
        self.assertEqual(normalize_account("student@srmist.edu.in", "academia"), "student@srmist.edu.in")
        self.assertEqual(normalize_account("student@example.com", "portal"), "student@example.com")
