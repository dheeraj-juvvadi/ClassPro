import os
import time
import unittest
from unittest.mock import patch
os.environ['APP_ORIGIN'] = 'http://localhost:8089'
import httpx
import server


class SecurityBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        server.sessions.clear()
        server.rates.clear()
        self.lifecycle = server.lifespan(server.app)
        await self.lifecycle.__aenter__()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
            base_url='http://localhost:8089', headers={'Origin': 'http://localhost:8089'})

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.lifecycle.__aexit__(None, None, None)

    async def test_session_isolation_forged_tokens_and_server_key(self):
        for token, name in [('student-a', 'PRIVATE_A'), ('student-b', 'PRIVATE_B')]:
            server.sessions[token] = {'created': time.monotonic(), 'last_seen': time.time(),
                'providers': {'portal': {'report': {}}}, 'report': {'profile': {'name': name}},
                'synced_at': time.time()}
        with patch.object(server, 'required_token', 'server-only-key'):
            denied = await self.client.get('/api/reports', headers={'cookie': 'anon_session=student-a'})
            self.assertEqual(denied.status_code, 401)
            self.client.headers['x-anon-key'] = 'server-only-key'
            result = await self.client.get('/api/reports?cache=only&token=student-b&user=student-b',
                headers={'cookie': 'anon_session=student-a', 'authorization': 'Bearer student-b'})
            self.assertEqual(result.status_code, 200)
            self.assertIn('PRIVATE_A', result.text)
            self.assertNotIn('PRIVATE_B', result.text)
            for cookie in ['', 'anon_session=forged-token']:
                denied = await self.client.get('/api/reports?cache=only', headers={'cookie': cookie})
                self.assertEqual(denied.status_code, 401)
            for path in ['/api/admin', '/api/bridge', '/api/openapi.json', '/api/portal/login']:
                self.assertEqual((await self.client.get(path)).status_code, 404)

    async def test_malformed_body_and_cross_origin_do_not_leak_details(self):
        for raw in ['[]', 'null', '{broken']:
            result = await self.client.post('/api/challenge', content=raw,
                headers={'content-type': 'application/json'})
            self.assertEqual(result.status_code, 400)
            self.assertNotIn('Traceback', result.text)
        rejected = await self.client.post('/api/challenge', json={'provider': 'academia'},
            headers={'Origin': 'https://attacker.test'})
        self.assertEqual(rejected.status_code, 403)
        with patch.object(server, 'secure', True):
            for path in ['/docs', '/redoc', '/openapi.json', '/server.py', '/.env']:
                result = await self.client.get(path)
                self.assertEqual(result.status_code, 404)
                self.assertEqual(result.headers['cache-control'], 'no-store')
