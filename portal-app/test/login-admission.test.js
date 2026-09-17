import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function harness(random = .5) {
  let now = 0;
  const waits = [];
  const math = Object.create(Math); math.random = () => random;
  const context = vm.createContext({ Math: math, performance: { now: () => now },
    Date: class extends Date { static now() { return 1800000000000 + now; } },
    setTimeout(callback, delay) { waits.push(delay); now += delay; callback(); },
  });
  vm.runInContext(readFileSync(new URL('../public/login-admission.js', import.meta.url), 'utf8'), context);
  return { ...context.classproAdmission, waits, advance: ms => { now += ms; } };
}
const busy = extras => Object.assign(new Error('busy'), {
  code: 'SERVER_BUSY', status: 503, retryable: true, retryAfterMs: 2000, ...extras,
});

test('Retry-After accepts seconds and HTTP dates without shortening a server wait', () => {
  const { retryAfter } = harness();
  assert.equal(retryAfter('15'), 15000);
  assert.equal(retryAfter(new Date(1800000005000).toUTCString()), 5000);
  for (const value of [null, '', 'invalid', '-2', 'Infinity']) assert.equal(retryAfter(value), 0);
});

test('admission retries wait at least Retry-After with jitter and stop after success', async () => {
  const h = harness(); let calls = 0; const notices = [];
  const result = await h.request(async () => { if (++calls === 1) throw busy({ retryAfterMs: 15000 }); return 'signed in'; }, delay => notices.push(delay));
  assert.equal(result, 'signed in'); assert.equal(calls, 2);
  assert.deepEqual(h.waits, [15625]); assert.deepEqual(notices, h.waits);
  const another = harness(.1);
  await another.request(async () => { if (!another.waits.length) throw busy({ retryAfterMs: 15000 }); });
  assert.notEqual(another.waits[0], h.waits[0]);
});

test('password, CAPTCHA, upstream and uncertain network failures are never retried', async () => {
  for (const error of [new TypeError('network'), busy({ retryable: false }), busy({ status: 502 }),
    busy({ code: 'LOGIN_REJECTED', status: 401 }), busy({ code: 'CAPTCHA_REQUIRED', status: 401 }),
    busy({ code: 'PORTAL_UNAVAILABLE', status: 502 })]) {
    const h = harness(); let calls = 0;
    await assert.rejects(h.request(async () => { calls++; throw error; }), err => err === error);
    assert.equal(calls, 1); assert.deepEqual(h.waits, []);
  }
});

test('attempt cap and elapsed deadline prevent unbounded or stale retries', async () => {
  const h = harness(); let calls = 0;
  await assert.rejects(h.request(async () => { calls++; throw busy(); }), /busy/);
  assert.equal(calls, 5); assert.equal(h.waits.length, 4);
  const aged = harness(); calls = 0;
  await assert.rejects(aged.request(async () => { calls++; aged.advance(59000); throw busy(); }), /busy/);
  assert.equal(calls, 1); assert.deepEqual(aged.waits, []);
  const longWait = harness();
  await assert.rejects(longWait.request(async () => { throw busy({ retryAfterMs: 90000 }); }), /busy/);
  assert.deepEqual(longWait.waits, []);
});

test('only explicitly retryable capacity and rate-limit responses share admission recovery', async () => {
  for (const [code, status] of [['CAPACITY', 503], ['RATE_LIMIT', 429]]) {
    const h = harness(); let calls = 0;
    await h.request(async () => { if (++calls === 1) throw busy({ code, status }); });
    assert.equal(calls, 2);
  }
});
