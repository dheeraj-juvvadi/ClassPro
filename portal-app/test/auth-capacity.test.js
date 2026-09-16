import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness() {
  const elements = new Map();
  const context = vm.createContext({
    document: { addEventListener() {}, getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: id === 'login-provider' ? 'portal' : '', focus() {} });
      return elements.get(id);
    } },
    setTimeout(callback) { callback(); },
  });
  vm.runInContext(readFileSync(new URL('../public/auth-client.js', import.meta.url), 'utf8'), context);
  return context.classproAuth;
}

test('challenge capacity retries are bounded and never submit credentials', async () => {
  const auth = harness();
  let calls = 0;
  await assert.rejects(auth.prepare(async path => {
    assert.equal(path, '/api/challenge');
    calls++;
    throw Object.assign(new Error('busy'), { code: 'SERVER_BUSY' });
  }, false), /busy/);
  assert.equal(calls, 5);
});

test('overlapping challenge requests share one in-flight request', async () => {
  const auth = harness();
  let complete;
  let calls = 0;
  const api = () => { calls++; return new Promise(resolve => { complete = resolve; }); };
  const first = auth.prepare(api, false);
  const second = auth.prepare(api, false);
  assert.equal(first, second);
  complete({ image: 'data:image/png;base64,test' });
  await first;
  assert.equal(calls, 1);
});

test('non-capacity failures are not retried', async () => {
  let calls = 0;
  await assert.rejects(harness().prepare(async () => {
    calls++;
    throw Object.assign(new Error('upstream'), { code: 'PORTAL_UNAVAILABLE' });
  }, false), /upstream/);
  assert.equal(calls, 1);
});
