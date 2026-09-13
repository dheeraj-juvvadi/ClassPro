import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const credentials = { account: 'synthetic-netid', password: 'synthetic-secret' };
const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0];

async function fixture(t, { configurePortal = () => {}, ...overrides } = {}) {
  const portals = [];
  const instance = createApp({
    authenticate: (portal, account, password) => portal.login(account, password),
    createSession: () => {
      const portal = {
        id: portals.length + 1, authenticated: false, closeCalls: 0,
        loginCalls: [], reportCalls: 0, logoutCalls: 0,
        async login(...args) {
          this.loginCalls.push(args);
          this.authenticated = true;
          return { authenticated: true };
        },
        async reports() {
          this.reportCalls++;
          assert.equal(this.authenticated, true);
          return { attendance: { data: [{ owner: this.id }] }, marks: { data: [] } };
        },
        async logout() { this.logoutCalls++; },
        async close() { this.closeCalls++; },
      };
      configurePortal(portal);
      portals.push(portal);
      return portal;
    },
    ...overrides,
  });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await instance.close();
    await new Promise(resolve => server.close(resolve));
  });
  const call = (path, method = 'GET', cookie = '', body, origin = url, headers = {}) => fetch(url + path, {
    method, headers: { origin, cookie, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = (body = credentials, cookie = '') => call('/api/login', 'POST', cookie, body);
  return { call, login, portals };
}

function assertPrivate(value) {
  const text = JSON.stringify(value);
  assert.ok(!text.includes(credentials.account));
  assert.ok(!text.includes(credentials.password));
  assert.doesNotMatch(text, /"(?:account|password|captcha|challenge|candidates)"\s*:/i);
  assert.doesNotMatch(text, /data:image/i);
}

test('client OCR challenge is bound to its session and answer is not returned', async t => {
  const { call, portals } = await fixture(t, { configurePortal(p) {
    p.open = async () => 'data:image/png;base64,c3ludGhldGlj';
  } });
  const challenge = await call('/api/challenge', 'POST', '', {});
  const cookie = cookieOf(challenge);
  assert.equal(challenge.status, 200);
  assert.ok((await challenge.json()).image);
  const body = { ...credentials, answer: 'Ab12Cd' };
  assert.equal((await call('/api/login/client', 'POST', '', body)).status, 401);
  const response = await call('/api/login/client', 'POST', cookie, body);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  assert.deepEqual(portals[0].loginCalls[0], [credentials.account, credentials.password, body.answer]);
  assert.equal((await call('/api/reports', 'GET', cookie)).status, 200);
});

test('client challenge retry refreshes its existing browser rather than allocating another', async t => {
  let refreshed = 0;
  const { call, portals } = await fixture(t, { configurePortal(p) {
    p.open = async () => 'first-image';
    p.refreshChallenge = async () => { refreshed++; return 'fresh-image'; };
  } });
  const first = await call('/api/challenge', 'POST', '', {});
  const cookie = cookieOf(first);
  const next = await call('/api/challenge', 'POST', cookie, {});
  assert.equal(next.status, 200);
  assert.deepEqual(await next.json(), { image: 'fresh-image' });
  assert.equal(cookieOf(next), cookie);
  assert.equal(refreshed, 1);
  assert.equal(portals.length, 1);
  assert.equal(portals[0].closeCalls, 0);
});

test('background preparation enters only the challenge and never signs in', async t => {
  const answers = [];
  const { call, portals } = await fixture(t, { configurePortal(p) {
    p.open = async () => 'synthetic-image';
    p.prepareCaptcha = async answer => { answers.push(answer); };
  } });
  assert.equal((await call('/api/challenge/prepare', 'POST', '', { answer: 'Ab12Cd' })).status, 401);
  const first = await call('/api/challenge', 'POST', '', {});
  const cookie = cookieOf(first);
  const prepared = await call('/api/challenge/prepare', 'POST', cookie, { answer: 'Ab12Cd' });
  assert.deepEqual(await prepared.json(), { prepared: true });
  assert.deepEqual(answers, ['Ab12Cd']);
  assert.equal(portals[0].authenticated, false);
  assert.equal(portals[0].loginCalls.length, 0);
  const invalid = await call('/api/challenge/prepare', 'POST', cookie, { answer: '' });
  assert.equal(invalid.status, 400);
  assert.equal(answers.length, 1);
});

test('failed client verification drops its browser and strips image from response', async t => {
  const { call, portals } = await fixture(t, { configurePortal(p) {
    p.open = async () => 'data:image/png;base64,c3ludGhldGlj';
    p.login = async () => ({ authenticated: false, captcha: 'private-image', error: { code: 'LOGIN_REJECTED', message: 'Rejected' } });
  } });
  const challenge = await call('/api/challenge', 'POST', '', {});
  const response = await call('/api/login/client', 'POST', cookieOf(challenge), { ...credentials, answer: 'Ab12Cd' });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).captcha, undefined);
  assert.equal(portals[0].closeCalls, 1);
});

test('login alone creates an opaque private session and replaces a supplied cookie', async t => {
  const { call, login, portals } = await fixture(t);
  const supplied = `portal_session=${'a'.repeat(64)}`;
  const response = await login(credentials, supplied);
  assert.equal(response.status, 200);
  const header = response.headers.get('set-cookie');
  assert.match(header, /^portal_session=[a-f0-9]{64};/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const cookie = cookieOf(response);
  assert.notEqual(cookie, supplied);
  const body = await response.json();
  assert.deepEqual(body, { authenticated: true });
  assertPrivate(body);
  assert.equal(portals.length, 1);
  assert.deepEqual(portals[0].loginCalls, [[credentials.account, credentials.password]]);
  const session = await (await call('/api/session', 'GET', cookie)).json();
  assert.deepEqual(session, { authenticated: true });
  assertPrivate(session);
  assert.equal((await call('/api/reports', 'GET', supplied)).status, 401);
});

test('anonymous requests cannot read reports or allocate a challenge session', async t => {
  const { call, portals } = await fixture(t);
  for (const cookie of ['', 'portal_session=unknown']) {
    assert.equal((await call('/api/reports', 'GET', cookie)).status, 401);
    assert.deepEqual(await (await call('/api/session', 'GET', cookie)).json(), { authenticated: false });
  }
  assert.equal((await call('/api/session', 'POST', '', {})).status, 404);
  assert.equal(portals.length, 0);
});

test('users have isolated portals and logout only closes the local session', async t => {
  const { call, login, portals } = await fixture(t);
  const first = cookieOf(await login());
  const second = cookieOf(await login({ account: 'other-netid', password: 'other-secret' }));
  assert.notEqual(first, second);
  assert.equal(portals.length, 2);
  for (const [index, cookie] of [first, second].entries()) {
    const response = await call('/api/reports', 'GET', cookie);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.attendance.data, [{ owner: index + 1 }]);
    assertPrivate(body);
  }
  const logout = await call('/api/session', 'DELETE', first);
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { success: true });
  assert.match(logout.headers.get('set-cookie'), /^portal_session=;/);
  assert.equal(portals[0].closeCalls, 1);
  assert.equal(portals[1].closeCalls, 0);
  assert.equal(portals[0].logoutCalls, 0);
  assert.equal((await call('/api/reports', 'GET', first)).status, 401);
  assert.equal((await call('/api/reports', 'GET', second)).status, 200);
  assert.equal((await call('/api/session', 'DELETE', first)).status, 200);
  assert.equal(portals[0].closeCalls, 1);
  const fresh = cookieOf(await login(credentials, first));
  assert.notEqual(fresh, first);
});

test('missing or malformed credentials return 400 without allocating a portal', async t => {
  const { login, portals } = await fixture(t);
  const invalid = [null, {}, { account: 'a' }, { password: 'b' },
    { account: ' ', password: 'b' }, { account: 'a', password: '' },
    { account: 123, password: 'b' }, { account: 'a', password: 123 },
    { account: 'a'.repeat(257), password: 'b' }, { account: 'a', password: 'b'.repeat(257) }];
  for (const body of invalid) {
    const response = await login(body);
    assert.equal(response.status, 400);
    assert.equal(cookieOf(response), undefined);
  }
  assert.equal(portals.length, 0);
});

test('overlapping work rejects reports, login and logout without duplicate portal work', async t => {
  const { call, login, portals } = await fixture(t);
  const cookie = cookieOf(await login());
  let release, entered;
  const active = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let reportCalls = 0;
  portals[0].reports = async () => {
    reportCalls++;
    entered();
    await blocked;
    return { attendance: { data: [] }, marks: { data: [] } };
  };
  const first = call('/api/reports', 'GET', cookie);
  await active;
  try {
    for (const response of [await call('/api/reports', 'GET', cookie),
      await login(credentials, cookie), await call('/api/session', 'DELETE', cookie)]) {
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, 'BUSY');
    }
    assert.equal(reportCalls, 1);
    assert.equal(portals.length, 1);
    assert.equal(portals[0].loginCalls.length, 1);
    assert.equal(portals[0].closeCalls, 0);
  } finally { release(); }
  assert.equal((await first).status, 200);
  assert.equal((await call('/api/reports', 'GET', cookie)).status, 200);
  assert.equal(reportCalls, 2);
});

test('authenticated login reuses its portal without submitting credentials again', async t => {
  const { login, portals } = await fixture(t);
  const cookie = cookieOf(await login());
  const response = await login(credentials, cookie);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  assert.equal(portals.length, 1);
  assert.equal(portals[0].loginCalls.length, 1);
});

test('invalid login closes its portal and frees capacity for a new login', async t => {
  const { call, login, portals } = await fixture(t, {
    maxSessions: 1,
    configurePortal(portal) {
      if (portal.id === 1) portal.login = async () => ({ authenticated: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' } });
    },
  });
  const failed = await login();
  assert.equal(failed.status, 401);
  const body = await failed.json();
  assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  assertPrivate(body);
  assert.equal(cookieOf(failed), undefined);
  assert.equal(portals[0].closeCalls, 1);
  assert.equal((await call('/api/reports')).status, 401);
  assert.equal((await login()).status, 200);
  assert.equal(portals.length, 2);
});

test('unexpected login failures are sanitized and release the allocated portal', async t => {
  const { login, portals } = await fixture(t, {
    maxSessions: 1,
    configurePortal(portal) {
      if (portal.id === 1) portal.login = async () => { throw new Error(credentials.password); };
    },
  });
  const response = await login();
  assert.equal(response.status, 502);
  assertPrivate(await response.json());
  assert.equal(cookieOf(response), undefined);
  assert.equal(portals[0].closeCalls, 1);
  assert.equal((await login()).status, 200);
});

test('cross-origin mutations return 403 before allocating or closing sessions', async t => {
  const { call, login, portals } = await fixture(t);
  for (const origin of ['https://untrusted.example', '', 'invalid']) {
    assert.equal((await call('/api/login', 'POST', '', credentials, origin)).status, 403);
  }
  assert.equal((await call('/api/login', 'POST', '', credentials, undefined,
    { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal(portals.length, 0);
  const cookie = cookieOf(await login());
  assert.equal((await call('/api/session', 'DELETE', cookie, undefined, 'https://untrusted.example')).status, 403);
  assert.equal(portals[0].closeCalls, 0);
  assert.equal((await call('/api/reports', 'GET', cookie)).status, 200);
});

test('session capacity is bounded and logout frees a slot', async t => {
  const { call, login, portals } = await fixture(t, { maxSessions: 1 });
  const cookie = cookieOf(await login());
  const full = await login();
  assert.equal(full.status, 503);
  assert.equal((await full.json()).error.code, 'CAPACITY');
  assert.equal(portals.length, 1);
  await call('/api/session', 'DELETE', cookie);
  assert.equal((await login()).status, 200);
  assert.equal(portals.length, 2);
});

test('expired sessions return 401, close the portal and receive a fresh cookie on login', async t => {
  let clock = 0;
  const { call, login, portals } = await fixture(t, { maxSessions: 1, now: () => clock });
  const cookie = cookieOf(await login());
  clock = 30 * 60 * 1000 + 1;
  const expired = await call('/api/reports', 'GET', cookie);
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).error.code, 'SESSION_EXPIRED');
  assert.equal(portals[0].closeCalls, 1);
  assert.equal(portals[0].reportCalls, 0);
  assert.deepEqual(await (await call('/api/session', 'GET', cookie)).json(), { authenticated: false });
  const fresh = await login(credentials, cookie);
  assert.equal(fresh.status, 200);
  assert.notEqual(cookieOf(fresh), cookie);
});
