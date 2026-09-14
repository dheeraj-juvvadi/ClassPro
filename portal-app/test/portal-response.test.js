import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { classifyPortalText, inspectPortalResponse, verifyProtectedPage } from '../src/portal-response.js';
import { capturePortalConsole, redactPortalConsole } from '../src/portal-console.js';

test('visible server alert takes priority over incidental body text', async () => {
  const evidence = await inspectPortalResponse({ evaluate: async () => ({ alertText: 'Invalid CAPTCHA', alertCount: 1, text: 'Invalid credentials', dashboard: false }) });
  assert.equal(evidence.code, 'CAPTCHA_INVALID');
  assert.equal(evidence.classification_source, 'visible_alert');
  assert.doesNotMatch(JSON.stringify(evidence), /Invalid CAPTCHA|Invalid credentials/);
  assert.equal(classifyPortalText('Enter valid password'), 'LOGIN_FAILED');
});

test('ambiguous response checks protected page once and requires dashboard markers', async () => {
  let calls = 0;
  const page = {
    async goto() { calls++; return { status: () => 200 }; },
    url: () => 'https://sp.srmist.edu.in/srmiststudentportal/students/template/HRDSystem.jsp',
    locator: selector => ({ count: async () => selector === '#login_form' ? 0 : 1 }),
  };
  assert.equal(await verifyProtectedPage(page, { code: 'LOGIN_REJECTED' }), false);
  assert.equal(calls, 0);
  assert.equal(await verifyProtectedPage(page, { code: 'LOGIN_FAILED' }), true);
  assert.equal(calls, 1);
  page.locator = () => ({ count: async () => 1 });
  assert.equal(await verifyProtectedPage(page, { code: 'LOGIN_FAILED' }), false);
});

test('portal console keeps bounded safe metadata and removes listeners', () => {
  const page = new EventEmitter();
  const capture = capturePortalConsole(page);
  for (let index = 0; index < 30; index++) page.emit('console', {
    type: () => 'error', text: () => 'telemetry.js failed to initialize private-password',
    location: () => ({ url: 'https://sp.srmist.edu.in/resources/secure2.js?secret=private' }),
  });
  const events = capture.drain(['private-password']);
  assert.equal(events.length, 24);
  assert.equal(events[0].category, 'telemetry_initialization');
  assert.equal(events[0].resource, 'secure2.js');
  assert.doesNotMatch(JSON.stringify(events), /private|secret/);
  assert.equal(capture.drain().length, 0);
  capture.close();
  for (const event of ['console', 'pageerror', 'requestfailed', 'response']) assert.equal(page.listenerCount(event), 0);
});

test('console text preserves useful errors while redacting known secrets and URLs', () => {
  const text = redactPortalConsole('TypeError at https://sp.srmist.edu.in/a?token=hidden student123 p%26ss password=unknown', ['student123', 'p&ss']);
  assert.match(text, /TypeError/);
  assert.doesNotMatch(text, /hidden|student123|p%26ss|unknown/);
});
