import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import httpx
import server
from core.client_lifecycle import client_scope, track, retain, gather_complete
from core.session import SessionHandler
from core import portal_client


class ClientLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_request_cleanup_preserves_retained_challenge(self):
        first = SimpleNamespace(aclose=AsyncMock())
        pending = SimpleNamespace(aclose=AsyncMock())
        other = SimpleNamespace(aclose=AsyncMock())
        entered, release = asyncio.Event(), asyncio.Event()

        @client_scope
        async def one():
            track(first)
            track(pending)
            retain(pending)
            entered.set()
            await release.wait()

        @client_scope
        async def two():
            track(other)

        task = asyncio.create_task(one())
        await entered.wait()
        await two()
        other.aclose.assert_awaited_once()
        first.aclose.assert_not_awaited()
        release.set()
        await task
        first.aclose.assert_awaited_once()
        pending.aclose.assert_not_awaited()

    async def test_cancellation_drains_child_requests_before_client_cleanup(self):
        order = []
        entered = asyncio.Event()
        client = SimpleNamespace(aclose=AsyncMock(side_effect=lambda: order.append('closed')))

        async def slow():
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                order.append('child stopped')

        @client_scope
        async def request():
            track(client)
            await gather_complete(slow(), asyncio.Event().wait())

        task = asyncio.create_task(request())
        await entered.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(order, ['child stopped', 'closed'])

    async def test_academia_reconnect_closes_old_jar_without_closing_shared_pool(self):
        pool = httpx.MockTransport(lambda request: httpx.Response(200, json={"status": "fail", "error": {"msg": "synthetic rejection"}}))
        with patch.object(portal_client, '_shared_transport', pool):
            handler = SessionHandler({'JSESSIONID': 'old'})
            previous = handler.client
            with self.assertRaisesRegex(Exception, 'synthetic rejection'):
                await handler.login('synthetic', 'test-only')
            self.assertTrue(previous.is_closed)
            self.assertFalse(handler.client.is_closed)
            self.assertNotIn('JSESSIONID', handler.client.cookies)
            await handler.client.aclose()
            response = await pool.handle_async_request(httpx.Request('GET', 'https://synthetic.invalid/'))
            self.assertEqual(response.status_code, 200)

    async def test_real_refresh_route_closes_client_on_success_and_upstream_failure(self):
        created = []
        def capture(client):
            created.append(client)
            return track(client)

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.upstream.app), base_url='http://portal-internal') as api:
            with patch.object(portal_client, 'track', capture), \
                 patch.object(portal_client.PortalClient, 'keepalive', new_callable=AsyncMock), \
                 patch.object(portal_client.PortalClient, 'get_attendance_html', new_callable=AsyncMock, return_value='<table></table>') as attendance, \
                 patch.object(portal_client.PortalClient, 'get_marks_data', new_callable=AsyncMock, return_value=[]), \
                 patch.object(portal_client.PortalClient, 'get_timetable_html', new_callable=AsyncMock, return_value=None), \
                 patch.object(portal_client.PortalClient, 'get_profile_html', new_callable=AsyncMock, return_value=None), \
                 patch.object(portal_client.PortalClient, 'get_academic_history', new_callable=AsyncMock, return_value={"status": "unavailable"}):
                result = await api.post('/portal/refresh', json={'cookies': {'JSESSIONID': 'synthetic'}})
                self.assertEqual(result.status_code, 200)
                self.assertTrue(created[-1].is_closed)
                attendance.return_value = None
                result = await api.post('/portal/refresh', json={'cookies': {'JSESSIONID': 'synthetic'}})
                self.assertEqual(result.status_code, 401)
                self.assertTrue(created[-1].is_closed)
        self.assertEqual(len(created), 2)

    async def test_login_keeps_retryable_challenge_but_closes_uncertain_failure(self):
        api = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.upstream.app), base_url='http://portal-internal')
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200)))
        session = SimpleNamespace(client=client, login=AsyncMock(return_value={'ok': False, 'reason': 'wrong_captcha'}))
        server.upstream._portal_captcha_sessions['synthetic-code'] = session
        payload = {'username': 'synthetic', 'password': 'test-only', 'captcha': 'CODE', 'cdigest': 'synthetic-code'}
        try:
            result = await api.post('/portal/login', json=payload)
            self.assertEqual(result.status_code, 401)
            self.assertFalse(client.is_closed)
            self.assertIs(server.upstream._portal_captcha_sessions['synthetic-code'], session)
            session.login.side_effect = httpx.ConnectError('synthetic failure')
            result = await api.post('/portal/login', json=payload)
            self.assertEqual(result.status_code, 503)
            self.assertTrue(client.is_closed)
            self.assertNotIn('synthetic-code', server.upstream._portal_captcha_sessions)
        finally:
            server.upstream._portal_captcha_sessions.pop('synthetic-code', None)
            await client.aclose()
            await api.aclose()

    async def test_ocr_password_rejection_is_not_reported_as_a_captcha_error(self):
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200)))
        session = SimpleNamespace(client=client, captcha_bytes=b'synthetic',
                                  login=AsyncMock(return_value={'ok': False, 'reason': 'invalid_credentials'}))
        server.upstream._portal_captcha_sessions['synthetic-rejection'] = session
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.upstream.app), base_url='http://portal-internal') as api:
                with patch.object(server.upstream, 'solve_captcha_ocr_bytes', AsyncMock(return_value=(True, 'CODE', None))), \
                     patch.object(server.upstream.asyncio, 'sleep', AsyncMock()):
                    response = await api.post('/portal/login', json={
                        'username': 'synthetic', 'password': 'test-only', 'cdigest': 'synthetic-rejection'})
            self.assertEqual(response.status_code, 401)
            self.assertIn('invalid credentials', response.json()['detail'])
            session.login.assert_awaited_once()
            self.assertFalse(client.is_closed)
        finally:
            server.upstream._portal_captcha_sessions.pop('synthetic-rejection', None)
            await client.aclose()
