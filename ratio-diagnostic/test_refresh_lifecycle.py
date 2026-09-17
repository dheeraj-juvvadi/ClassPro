import asyncio
import io
import json
import os
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault('APP_ORIGIN', 'http://localhost:8089')
import server


class RefreshLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def entry(self):
        return {'last_seen': time.time(), 'remember': False, 'providers': {'portal': {}}, 'report': {}}

    def request(self, age=0):
        return SimpleNamespace(state=SimpleNamespace(queued_at=time.monotonic() - age,
                                                     diagnostic_id='synthetic-request'))

    async def test_expired_session_does_not_refresh_even_without_sweep(self):
        entry = self.entry()
        entry['last_seen'] -= 1900
        server.sessions['expired-job'] = entry
        try:
            with patch.object(server, 'refresh_providers', new_callable=AsyncMock) as refresh:
                self.assertFalse(await server.refresh_job('expired-job', entry, self.request()))
                refresh.assert_not_awaited()
        finally:
            server.sessions.pop('expired-job', None)

    async def test_memory_wait_has_deadline_and_safe_log(self):
        entry = self.entry()
        entry['providers']['portal']['password'] = 'synthetic-private-value'
        server.sessions['private-token'] = entry
        output = io.StringIO()
        try:
            with patch.object(server, 'can_admit', return_value=False), patch('sys.stdout', output):
                self.assertFalse(await server.refresh_job('private-token', entry,
                                 self.request(server.REFRESH_QUEUE_WAIT + 1)))
            self.assertTrue(entry['sync_failed'])
            event = json.loads(output.getvalue())
            self.assertEqual(event['outcome'], 'queue_timeout')
            self.assertGreaterEqual(event['queue_ms'], server.REFRESH_QUEUE_WAIT * 1000)
            self.assertNotIn('private-token', output.getvalue())
            self.assertNotIn('synthetic-private-value', output.getvalue())
        finally:
            server.sessions.pop('private-token', None)

    async def test_removed_session_releases_memory_wait(self):
        entry = self.entry()
        server.sessions['removed-job'] = entry
        async def pause(seconds):
            server.sessions.pop('removed-job', None)
        with patch.object(server, 'can_admit', return_value=False), patch('server.asyncio.sleep', pause):
            self.assertFalse(await server.refresh_job('removed-job', entry, self.request()))

    async def test_busy_session_lock_respects_queue_deadline(self):
        entry = self.entry()
        server.sessions['busy-job'] = entry
        lock = asyncio.Lock()
        await lock.acquire()
        server.session_locks['busy-job'] = lock
        output = io.StringIO()
        try:
            with patch.object(server, 'REFRESH_QUEUE_WAIT', .025), patch.object(server, 'can_admit', return_value=True), patch.object(server, 'refresh_providers', new_callable=AsyncMock) as refresh, patch('sys.stdout', output):
                result = await asyncio.wait_for(server.refresh_job('busy-job', entry, self.request()), .5)
            self.assertFalse(result)
            self.assertTrue(lock.locked(), 'A timed-out waiter must not release another task’s lock')
            refresh.assert_not_awaited()
            event = json.loads(output.getvalue())
            self.assertEqual(event['outcome'], 'queue_timeout')
            self.assertGreaterEqual(event['queue_ms'], 25)
            self.assertEqual(event['duration_ms'], 0)
        finally:
            lock.release()
            server.sessions.pop('busy-job', None)

    async def test_memory_is_rechecked_under_lock_and_lock_is_released(self):
        entry = self.entry()
        server.sessions['memory-job'] = entry
        lock = asyncio.Lock()
        server.session_locks['memory-job'] = lock
        checks = iter([True, False])
        try:
            with patch.object(server, 'REFRESH_QUEUE_WAIT', .025), patch.object(server, 'can_admit', side_effect=lambda _: next(checks, False)), patch.object(server, 'refresh_providers', new_callable=AsyncMock) as refresh:
                self.assertFalse(await asyncio.wait_for(server.refresh_job('memory-job', entry, self.request()), .5))
            self.assertFalse(lock.locked())
            refresh.assert_not_awaited()
        finally:
            server.sessions.pop('memory-job', None)

    async def test_success_timing_excludes_admission_wait(self):
        entry = self.entry()
        server.sessions['timed-job'] = entry
        output = io.StringIO()
        try:
            with patch.object(server, 'can_admit', return_value=True), patch.object(server, 'refresh_providers', new_callable=AsyncMock, return_value=(entry['report'], True)), patch('sys.stdout', output):
                self.assertTrue(await server.refresh_job('timed-job', entry, self.request(age=2)))
            event = json.loads(output.getvalue())
            self.assertEqual(event['outcome'], 'success')
            self.assertGreaterEqual(event['queue_ms'], 2000)
            self.assertLess(event['duration_ms'], 1000)
        finally:
            server.sessions.pop('timed-job', None)
