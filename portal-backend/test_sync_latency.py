import asyncio
import sys
import unittest
from pathlib import Path
import httpx

sys.path.insert(0, str(Path(__file__).parent / 'upstream'))
from core.portal_client import PortalClient, ATT_URL
from provider_flow import refresh


class SyncLatencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_independent_providers_overlap_and_keep_cookie_jars_separate(self):
        entered = set()
        both_started = asyncio.Event()
        entry = {'providers': {name: {'username': 'student', 'cookies': {'provider': name}, 'report': {}}
                               for name in ('portal', 'academia')}}

        async def invoke(request, path, payload):
            name = 'portal' if path == '/portal/refresh' else 'academia'
            self.assertEqual(payload['cookies']['provider'], name)
            entered.add(name)
            if len(entered) == 2:
                both_started.set()
            await asyncio.wait_for(both_started.wait(), 1)
            return httpx.Response(200), {'success': True, 'cookies': {'provider': name},
                                        'attendance': {'data': [{'code': name}]}}

        result, success = await refresh(None, entry, invoke, lambda data, previous: data)
        self.assertTrue(success)
        self.assertEqual(result['attendance']['data'][0]['code'], 'portal')
        self.assertEqual(entry['providers']['academia']['cookies'], {'provider': 'academia'})

    async def test_provider_failure_cancels_and_drains_other_request(self):
        started, cancelled = asyncio.Event(), asyncio.Event()
        entry = {'providers': {name: {'username': 'student', 'cookies': {}} for name in ('portal', 'academia')}}

        async def invoke(request, path, payload):
            if path == '/portal/refresh':
                await started.wait()
                raise RuntimeError('synthetic')
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        with self.assertRaises(RuntimeError):
            await refresh(None, entry, invoke, lambda data, previous: data)
        self.assertTrue(cancelled.is_set())

    async def test_attendance_is_shared_only_within_one_refresh(self):
        calls = []
        async def respond(request):
            self.assertEqual(str(request.url), ATT_URL)
            calls.append(request)
            await asyncio.sleep(.01)
            return httpx.Response(200, text='<table>fresh attendance</table>')
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
            client = object.__new__(PortalClient)
            client.client = http
            first, second = await asyncio.gather(client.get_attendance_html(), client.get_attendance_html())
            self.assertEqual(first, second)
            self.assertEqual(await client.get_attendance_html(), first)
            self.assertEqual(len(calls), 1)
            next_refresh = object.__new__(PortalClient)
            next_refresh.client = http
            await next_refresh.get_attendance_html()
            self.assertEqual(len(calls), 2)
