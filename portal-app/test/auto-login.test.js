import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLogin } from '../src/auto-login.js';

function fixture(results = [{ authenticated: true }]) {
  const calls = { open: 0, refresh: 0, login: [], solve: [] };
  const portal = {
    authenticated: false,
    async open() { calls.open++; return 'first-image'; },
    async refreshChallenge() { calls.refresh++; return 'second-image'; },
    async login(...args) {
      calls.login.push(args);
      const result = results[Math.min(calls.login.length - 1, results.length - 1)];
      if (result instanceof Error) throw result;
      this.authenticated = !!result.authenticated;
      return result;
    },
  };
  const solve = async image => {
    calls.solve.push(image);
    return [{ answer: image === 'first-image' ? 'abc12' : 'def34', votes: 2, confidence: 90 }];
  };
  const run = (solver = solve) => autoLogin(portal, 'test-netid', 'test-secret', solver);
  return { calls, portal, solve, run };
}
const failure = code => ({ authenticated: false, error: { code, message: 'Sign-in failed.' } });

function assertNoSecrets(result) {
  assert.doesNotMatch(JSON.stringify(result), /test-netid|test-secret|abc12|def34|first-image|second-image/);
  assert.equal(Object.hasOwn(result, 'captcha'), false);
}

test('autoLogin uses its injected solver and returns only successful authentication metadata', async () => {
  const { calls, run } = fixture();
  const result = await run();
  assert.equal(result.authenticated, true);
  assert.ok(Number.isInteger(result.elapsedMs) && result.elapsedMs >= 0);
  assert.deepEqual(Object.keys(result).sort(), ['authenticated', 'elapsedMs']);
  assert.deepEqual(calls, { open: 1, refresh: 0, solve: ['first-image'],
    login: [['test-netid', 'test-secret', 'abc12']] });
  assertNoSecrets(result);
});

test('CAPTCHA_INVALID refreshes once and can succeed on the second submission', async () => {
  const { calls, run } = fixture([failure('CAPTCHA_INVALID'), { authenticated: true }]);
  const result = await run();
  assert.equal(result.authenticated, true);
  assert.equal(calls.open, 1);
  assert.equal(calls.refresh, 1);
  assert.deepEqual(calls.solve, ['first-image', 'second-image']);
  assert.deepEqual(calls.login, [['test-netid', 'test-secret', 'abc12'], ['test-netid', 'test-secret', 'def34']]);
  assertNoSecrets(result);
});

test('rejected captcha attempts stop after at most two submissions', async () => {
  const rejected = failure('CAPTCHA_INVALID');
  const { calls, run } = fixture([rejected]);
  assert.deepEqual(await run(), rejected);
  assert.equal(calls.login.length, 2);
  assert.equal(calls.solve.length, 2);
  assert.equal(calls.open, 1);
  assert.equal(calls.refresh, 1);
});

test('invalid credentials, session limits and unknown failures never retry', async () => {
  for (const code of ['INVALID_CREDENTIALS', 'SESSION_LIMIT', 'LOGIN_FAILED', 'UNRECOGNIZED']) {
    const rejected = failure(code);
    const { calls, run } = fixture([rejected]);
    assert.deepEqual(await run(), rejected);
    assert.equal(calls.login.length, 1, code);
    assert.equal(calls.solve.length, 1, code);
    assert.equal(calls.refresh, 0, code);
  }
  const { calls, run } = fixture([{ authenticated: false }]);
  assert.equal((await run()).error.code, 'LOGIN_FAILED');
  assert.equal(calls.login.length, 1);
  assert.equal(calls.refresh, 0);
});

test('unreadable challenges are bounded to two solver calls with no submissions', async () => {
  const solvers = [
    async () => { throw Object.assign(new Error('Unreadable'), { code: 'CAPTCHA_UNREADABLE' }); },
    async () => [],
    async () => [{ answer: 'uncertain', votes: 1, confidence: 64 }],
  ];
  for (const solver of solvers) {
    const { calls, run } = fixture();
    let attempts = 0;
    const result = await run(async image => { attempts++; return solver(image); });
    assert.equal(result.authenticated, false);
    assert.equal(result.error.code, 'CHALLENGE_FAILED');
    assert.equal(attempts, 2);
    assert.equal(calls.open, 1);
    assert.equal(calls.refresh, 1);
    assert.deepEqual(calls.login, []);
    assertNoSecrets(result);
  }
});

test('an unreadable first challenge can recover without submitting its answer', async () => {
  const { calls, run, solve } = fixture();
  let attempts = 0;
  const result = await run(async image => {
    if (++attempts === 1) throw Object.assign(new Error('Unreadable'), { code: 'CAPTCHA_UNREADABLE' });
    return solve(image);
  });
  assert.equal(result.authenticated, true);
  assert.equal(attempts, 2);
  assert.equal(calls.refresh, 1);
  assert.deepEqual(calls.login, [['test-netid', 'test-secret', 'def34']]);
});

test('unknown solver errors and thrown login failures propagate without retry', async () => {
  const solverError = new Error('Solver offline');
  const first = fixture();
  let solves = 0;
  await assert.rejects(first.run(async () => { solves++; throw solverError; }), error => error === solverError);
  assert.equal(solves, 1);
  assert.equal(first.calls.refresh, 0);
  assert.deepEqual(first.calls.login, []);
  const loginError = new Error('Unknown portal error');
  const second = fixture([loginError]);
  await assert.rejects(second.run(), error => error === loginError);
  assert.equal(second.calls.login.length, 1);
  assert.equal(second.calls.refresh, 0);
});

test('an already authenticated portal is reused without opening, solving or submitting', async () => {
  const { portal, calls, run } = fixture();
  portal.authenticated = true;
  assert.deepEqual(await run(), { authenticated: true, reused: true });
  assert.deepEqual(calls, { open: 0, refresh: 0, login: [], solve: [] });
});

test('a repeated zero-confidence guess is never submitted', async () => {
  const { calls, run } = fixture();
  let attempts = 0;
  const result = await run(async () => { attempts++; return [{ answer: 'aaaa1', votes: 6, confidence: 0 }]; });
  assert.equal(result.authenticated, false);
  assert.equal(result.error.code, 'CHALLENGE_FAILED');
  assert.equal(attempts, 2);
  assert.deepEqual(calls.login, []);
  assertNoSecrets(result);
});

test('a lone high-confidence read without corroboration is not submitted', async () => {
  const { calls, run } = fixture();
  const result = await run(async () => [{ answer: 'zzzz9', votes: 1, confidence: 99 }]);
  assert.equal(result.authenticated, false);
  assert.equal(result.error.code, 'CHALLENGE_FAILED');
  assert.equal(calls.login.length, 0);
  assertNoSecrets(result);
});

test('an eligible candidate is submitted even when ranked below an ineligible one', async () => {
  const { calls, run } = fixture();
  const result = await run(async () => [
    { answer: 'bad11', votes: 5, confidence: 12 },
    { answer: 'good2', votes: 2, confidence: 88 },
  ]);
  assert.equal(result.authenticated, true);
  assert.deepEqual(calls.login, [['test-netid', 'test-secret', 'good2']]);
  assertNoSecrets(result);
});
