import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/login-preparation.js';

test('immediate autofill submission shares preparation already in flight', async () => {
  let resolve;
  let calls = 0;
  const preparation = createLoginPreparation({ prepare: () => {
    calls++;
    return new Promise(done => { resolve = done; });
  } });
  const background = preparation.preload();
  const submitted = preparation.take();
  await Promise.resolve();
  resolve({ prediction: { answer: 'Ab12Cd' } });
  assert.deepEqual(await submitted, await background);
  assert.equal(calls, 1);
});

test('manual entry reuses prepared challenge; long entry refreshes an expired one', async () => {
  let clock = 0;
  let calls = 0;
  const preparation = createLoginPreparation({ now: () => clock, ttl: 60000,
    prepare: async () => ({ sequence: ++calls }) });
  await preparation.preload();
  clock = 2000;
  assert.equal((await preparation.take()).sequence, 1);
  await preparation.preload();
  clock = 63000;
  assert.equal((await preparation.take()).sequence, 3);
});

test('failed background preparation can be retried on submit', async () => {
  let calls = 0;
  const preparation = createLoginPreparation({ prepare: async () => {
    if (++calls === 1) throw new Error('temporary failure');
    return { ready: true };
  } });
  await assert.rejects(preparation.preload());
  assert.deepEqual(await preparation.take(), { ready: true });
});
