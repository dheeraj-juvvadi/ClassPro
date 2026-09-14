import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { prepareFingerprintToken } from '../src/fingerprint-handshake.js';

function fixture(response) {
  const token = { name: 'fpToken', value: '' };
  const calls = [];
  const context = vm.createContext({
    location: { origin: 'https://sp.srmist.edu.in' },
    document: { getElementById: id => id === 'fpNonce' ? { value: 'private-nonce' } : token },
    navigator: { userAgent: 'ActualBrowser', platform: 'ActualPlatform', language: 'en-IN' },
    URLSearchParams, AbortSignal,
    fetch: async (url, options) => { calls.push({ url, options }); return response; },
  });
  return { token, calls, page: { evaluate: callback => vm.runInContext(`(${callback})()`, context) } };
}

test('handshake uses actual browser properties and keeps token out of logs', async () => {
  const app = fixture({ ok: true, status: 200, json: async () => ({ fpToken: 'private-token' }) });
  const logs = [];
  await prepareFingerprintToken(app.page, entry => logs.push(entry));
  assert.equal(app.token.value, 'private-token');
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].url, '/srmiststudentportal/fpToken');
  const payload = JSON.parse(app.calls[0].options.body.get('fpPayload'));
  assert.equal(payload.fp.userAgent, 'ActualBrowser');
  assert.equal(payload.fp.platform, 'ActualPlatform');
  assert.equal(payload.nonce, 'private-nonce');
  assert.equal(app.calls[0].options.redirect, 'error');
  assert.doesNotMatch(JSON.stringify(logs), /private-|ActualBrowser/);
});

test('invalid token stops submission without leaking response content', async () => {
  const app = fixture({ ok: true, status: 200, json: async () => ({ error: 'private-server-detail' }) });
  const logs = [];
  await assert.rejects(prepareFingerprintToken(app.page, entry => logs.push(entry)), /could not complete/);
  assert.equal(app.token.value, '');
  assert.doesNotMatch(JSON.stringify(logs), /private-server-detail/);
});
