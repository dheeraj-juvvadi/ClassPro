import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWorker } from './worker.mjs';

const token = 'test-worker-token-with-at-least-32-characters';
const firstSession = 'a'.repeat(64);
const secondSession = 'b'.repeat(64);

async function fixture(t, overrides = {}) {
  const logs = [];
  let opened = 0;
  let closed = 0;
  const worker = createWorker({ token, createSession: () => ({
    authenticated: false,
    async open() { opened++; return 'image'; },
    async refreshChallenge() { return 'image'; },
    async prepareCaptcha() {},
    async login() { this.authenticated = true; return { authenticated: true }; },
    async reports() { return { attendance: { data: [] }, marks: { data: [] } }; },
    async close() { closed++; },
    ...overrides,
  }), logger: event => logs.push(event) });
  worker.server.listen(0, '127.0.0.1');
  await once(worker.server, 'listening');
  t.after(async () => { worker.server.closeAllConnections(); await new Promise(resolve => worker.server.close(resolve)); await worker.close(); });
  const base = `http://127.0.0.1:${worker.server.address().port}`;
  const rpc = (action, session = firstSession, payload = {}) => fetch(`${base}/rpc`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, session, payload }),
  });
  return { base, rpc, logs, opened: () => opened, closed: () => closed };
}

test('worker rejects unauthenticated access and unknown operations', async t => {
  const app = await fixture(t);
  assert.equal((await fetch(`${app.base}/rpc`, { method: 'POST' })).status, 401);
  assert.equal((await app.rpc('arbitrary-fetch')).status, 400);
  assert.equal((await app.rpc('challenge', '../../other')).status, 400);
  assert.equal(app.opened(), 0);
});

test('worker passes special characters and password whitespace unchanged', async t => {
  const password = '  synthetic&+=%<>"\'\\é🙂  ';
  let matched = false;
  const app = await fixture(t, { async login(account, suppliedPassword, answer) {
    matched = account === 'student@srmist.edu.in' && suppliedPassword === password && answer === 'Ab12';
    return { authenticated: true };
  } });
  await app.rpc('challenge');
  const response = await app.rpc('login', firstSession, { account:'student@srmist.edu.in', password, answer:'Ab12' });
  assert.equal(response.status, 200);
  assert.equal(matched, true);
  assert.doesNotMatch(JSON.stringify(app.logs), /synthetic|student@srmist/);
});

test('worker preserves challenge, prepare, login and logout contracts', async t => {
  const app = await fixture(t);
  assert.deepEqual(await (await app.rpc('challenge')).json(), { image: 'image' });
  assert.deepEqual(await (await app.rpc('prepare', firstSession, { answer: 'ABCD' })).json(), { prepared: true });
  assert.equal((await app.rpc('reports', secondSession)).status, 401);
  assert.deepEqual(await (await app.rpc('login', firstSession, { account: 'student', password: 'secret', answer: 'ABCD' })).json(), { authenticated: true });
  assert.equal((await app.rpc('reports')).status, 200);
  assert.equal((await app.rpc('close')).status, 200);
  assert.equal((await app.rpc('reports')).status, 401);
  assert.equal(app.closed(), 1);
});

test('worker strips unexpected exception messages and drops failed session', async t => {
  const app = await fixture(t, { async login() { throw new Error('password-secret upstream body'); } });
  await app.rpc('challenge');
  const response = await app.rpc('login', firstSession, { account: 'student', password: 'secret', answer: 'ABCD' });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /password-secret|upstream body/);
  assert.ok(app.logs.some(event => event.event === 'worker_error'));
  assert.doesNotMatch(JSON.stringify(app.logs), /password-secret|upstream body/);
  assert.equal((await app.rpc('reports')).status, 401);
});

test('worker serializes a single browser context', async t => {
  let release;
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const app = await fixture(t, { async refreshChallenge() { entered(); await wait; return 'image'; } });
  await app.rpc('challenge');
  const pending = app.rpc('challenge');
  await ready;
  assert.equal((await app.rpc('close')).status, 409);
  release();
  assert.equal((await pending).status, 200);
});

test('stuck close is bounded and cannot release leaked browser capacity', async t => {
  let failures = 0;
  const worker = createWorker({ token, maxSessions: 1, closeTimeoutMs: 15,
    onCloseTimeout: () => { failures++; },
    createSession: () => ({ async open() { return 'image'; }, async close() { await new Promise(() => {}); } }),
  });
  worker.server.listen(0, '127.0.0.1');
  await once(worker.server, 'listening');
  t.after(async () => { worker.server.closeAllConnections(); await new Promise(resolve => worker.server.close(resolve)); await worker.close(); });
  const rpc = (action, session) => fetch(`http://127.0.0.1:${worker.server.address().port}/rpc`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, session, payload: {} }),
  });
  await rpc('challenge', firstSession);
  await rpc('close', firstSession);
  assert.equal(failures, 1);
  assert.equal((await rpc('challenge', secondSession)).status, 503);
});
