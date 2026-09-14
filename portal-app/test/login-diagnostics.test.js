import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSubmission, observeLogin } from '../src/login-diagnostics.js';
import { EventEmitter } from 'node:events';

test('submission diagnostics expose only booleans and detect altered fields', () => {
  const expected = { account: 'secret-netid', password: 'private-password', captcha: 'ABC123' };
  const telemetry = { keystrokeCount: 25, typingSpeedMs: 2300, webdriver: false, private: 'private-telemetry' };
  const body = new URLSearchParams({ username: expected.account, password: expected.password, captcha: expected.captcha,
    csrfPreventionSalt: 'private-csrf', domain: 'private-domain', interaction: 'private-interaction',
    telemetryPayload: Buffer.from(JSON.stringify(telemetry)).toString('base64') });
  const summarize = () => summarizeSubmission(body.toString(), expected, { domain: 'domain', interaction: 'interaction' },
    'https://sp.srmist.edu.in', 'https://sp.srmist.edu.in/login', 'HeadlessChrome');
  const result = summarize();
  assert.equal(result.accountMatches, true);
  assert.equal(result.passwordMatches, true);
  assert.equal(result.captchaMatches, true);
  assert.equal(result.telemetryPresent, true);
  assert.ok(Object.values(result).every(value => typeof value === 'boolean'));
  assert.doesNotMatch(JSON.stringify(result), /secret-netid|private-|ABC123/);
  body.set('username', 'truncated');
  body.delete('telemetryPayload');
  assert.equal(summarize().accountMatches, false);
  assert.equal(summarize().telemetryPresent, false);
});

test('observation removes request listeners and never logs page errors or URLs', async () => {
  const page = new EventEmitter();
  page.evaluate = async () => ({ telemetryReady: true, domain: 'domain', interaction: 'interaction' });
  const logs = [];
  const observer = await observeLogin(page, {}, record => logs.push(record));
  page.emit('pageerror', new Error('private-password'));
  await observer.finish('LOGIN_REJECTED');
  observer.close();
  assert.equal(logs[0].script_errors, 1);
  assert.equal(logs[0].submission_observed, false);
  assert.doesNotMatch(JSON.stringify(logs), /private-password/);
  for (const event of ['request', 'response', 'pageerror', 'requestfailed']) assert.equal(page.listenerCount(event), 0);
});

test('submission detects security-field differences without exposing values', () => {
  const expected = { account: 'student', password: 'secret', captcha: 'ABCD' };
  const body = new URLSearchParams({ username: 'student', password: 'secret', captcha: 'ABCD', ph_random: 'trap-secret', fpPayload: 'payload-secret', fpToken: 'token-secret', domain: Buffer.from('ni.ude.tsimrs.ps').toString('base64') });
  body.append('username', 'extra-secret');
  const result = summarizeSubmission(body.toString(), expected, { domain: 'domain' });
  assert.equal(result.honeypotEmpty, false);
  assert.equal(result.duplicateAccount, true);
  assert.equal(result.domainProofMatches, true);
  assert.equal(result.fingerprintTokenPresent, true);
  assert.doesNotMatch(JSON.stringify(result), /secret|student|ABCD/);
});
