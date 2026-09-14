import test from 'node:test';
import assert from 'node:assert/strict';
import { submitThroughHttp } from '../src/submission-transport.js';

test('forwards the original request once without changing headers or body', async () => {
  let handler;
  let removed = false;
  let calls = 0;
  const logs = [];
  const response = { status: () => 302 };
  const page = {
    async route(url, callback) { assert.equal(new URL(url).hostname, 'sp.srmist.edu.in'); handler = callback; },
    async unroute(url, callback) { assert.equal(callback, handler); removed = true; },
  };
  const route = {
    request: () => ({ method: () => 'POST', isNavigationRequest: () => true }),
    async fetch(options) { calls++; assert.deepEqual(options, { maxRedirects: 0, maxRetries: 0, timeout: 30000 }); return response; },
    async fulfill(options) { assert.equal(options.response, response); },
  };
  await submitThroughHttp(page, () => handler(route), record => logs.push(record));
  assert.equal(calls, 1);
  assert.equal(removed, true);
  assert.equal(logs[0].upstream_status, 302);
});

test('transport failure is sanitized and removes the handler', async () => {
  let handler;
  let removed = false;
  let aborted = false;
  const page = { async route(url, callback) { handler = callback; }, async unroute() { removed = true; } };
  const route = {
    request: () => ({ method: () => 'POST', isNavigationRequest: () => true }),
    async fetch() { throw new Error('private-password'); },
    async abort() { aborted = true; },
  };
  await assert.rejects(submitThroughHttp(page, () => handler(route)), error => {
    assert.doesNotMatch(error.message, /private-password/);
    return true;
  });
  assert.equal(removed, true);
  assert.equal(aborted, true);
});
