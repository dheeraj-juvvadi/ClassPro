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
