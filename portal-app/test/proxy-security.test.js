import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const proxy = require('../public/api/proxy.js');

function request(path, options = {}) {
  return Object.assign(Readable.from(options.body ? [options.body] : []), {
    method: options.method || 'GET', url: `/api/proxy?__path=${encodeURIComponent(path)}&token=other-user`,
    query: { __path: path }, headers: options.headers || {}, socket: { remoteAddress: '127.0.0.1' },
  });
}
function response() {
  return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; }, send(v) { this.body = v; } };
}

test('exam reads forward only the supported refresh flag', async t => {
  process.env.BACKEND_URL = 'https://backend.test'; process.env.BACKEND_TOKEN = 'server-only-secret';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    return new Response('{"exams":null}', { headers: { 'content-type': 'application/json' } });
  });
  const req = request('exams'); req.url += '&force=1&year=2025';
  const res = response(); await proxy(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ['https://backend.test/api/exams?force=1']);
  const wrong = response(); await proxy(request('exams', { method: 'POST' }), wrong);
  assert.equal(wrong.statusCode, 405);
});

test('proxy rejects internal routes, traversal, wrong methods and oversized bodies', async t => {
  process.env.BACKEND_URL = 'https://backend.test'; process.env.BACKEND_TOKEN = 'server-only-secret';
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
  for (const path of ['../health', '..%2fhealth', 'reports/../../bridge', 'openapi.json', 'admin', 'login', '/reports', 'reports?x=1']) {
    const res = response(); await proxy(request(path), res); assert.equal(res.statusCode, 404, path);
  }
  const wrong = response(); await proxy(request('reports', { method: 'POST' }), wrong); assert.equal(wrong.statusCode, 405);
  const big = response(); await proxy(request('challenge', { method: 'POST', body: 'x'.repeat(8193) }), big); assert.equal(big.statusCode, 413);
  assert.equal(fetch.mock.callCount(), 0);
});

test('report and exam retry IDs survive the proxy without losing retry scope', async t => {
  process.env.BACKEND_URL = 'https://backend.test'; process.env.BACKEND_TOKEN = 'server-only-secret';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(new URL(url));
    return new Response('{}', { headers: { 'content-type': 'application/json' } });
  });
  for (const path of ['reports', 'exams']) {
    for (const id of ['0123456789abcdef', '', 'stale/invalid']) {
      const req = request(path); req.url += `&retry=${encodeURIComponent(id)}&wait=1&year=2025`;
      await proxy(req, response());
      const target = calls.at(-1);
      assert.equal(target.pathname, `/api/${path}`);
      assert.equal(target.searchParams.get('retry'), id);
      assert.equal(target.searchParams.get('wait'), path === 'reports' ? '1' : null);
      assert.equal(target.searchParams.has('token'), false);
      assert.equal(target.searchParams.has('year'), false);
      assert.equal(target.searchParams.has('force'), false);
    }
  }
  const req = request('session'); req.url += '&retry=0123456789abcdef';
  await proxy(req, response());
  assert.equal(calls.at(-1).searchParams.has('retry'), false);
});

test('proxy replaces forged gateway headers and never relays redirect or debug headers', async t => {
  process.env.BACKEND_URL = 'https://backend.test'; process.env.BACKEND_TOKEN = 'server-only-secret';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), ...options });
    return new Response('{"authenticated":false}', { headers: { 'content-type': 'application/json', server: 'private-framework', 'x-anon-key': 'server-only-secret' } });
  });
  const res = response();
  await proxy(request('session', { headers: { 'x-anon-key': 'forged', 'x-ops-gateway': 'forged', authorization: 'Bearer other-user', 'x-anon-client-ip': 'spoofed', cookie: 'anon_session=own-session' } }), res);
  assert.equal(calls[0].headers['x-anon-key'], 'server-only-secret');
  assert.equal(calls[0].headers['x-anon-client-ip'], '127.0.0.1');
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(calls[0].headers['x-ops-gateway'], undefined);
  assert.equal(calls[0].url, 'https://backend.test/api/session');
  assert.equal(res.headers.server, undefined); assert.equal(res.headers['x-anon-key'], undefined);
  assert.equal(res.headers['cache-control'], 'no-store');
  globalThis.fetch = async () => new Response('debug data', { status: 302, headers: { location: 'https://outside.test' } });
  const redirected = response(); await proxy(request('session'), redirected);
  assert.equal(redirected.statusCode, 502); assert.doesNotMatch(JSON.stringify(redirected.body), /debug|outside/);
});
