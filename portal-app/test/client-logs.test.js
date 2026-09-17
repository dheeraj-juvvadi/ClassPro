import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('client errors exclude private messages and analytics require consent', { timeout: 20000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage();
  const batches = [];
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname === '/api/client-events') {
      batches.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, json: { accepted: 1 } });
    }
    return route.fulfill({ json: { authenticated: false, authMode: 'http' } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(async () => {
    dispatchEvent(new ErrorEvent('error', { error: new TypeError('secret-password'),
      message: 'secret-password', filename: `${location.origin}/app.js?cookie=secret-cookie`, lineno: 10, colno: 2 }));
    anonClientLogs.capture({ kind: 'page_view', page: 'home', consent: true });
    await anonClientLogs.flush();
  });
  const events = batches.flatMap(batch => batch.events);
  assert.ok(events.some(event => event.kind === 'runtime_error' && event.code === 'TypeError' && event.source === 'app.js'));
  assert.ok(events.every(event => event.kind !== 'page_view'));
  assert.doesNotMatch(JSON.stringify(batches), /secret-password|secret-cookie|cookie=|message|stack/);
  await page.evaluate(async () => {
    localStorage.setItem('anon.analytics-choice.v1', 'allow');
    anonClientLogs.capture({ kind: 'page_view', page: 'marks', consent: true });
    localStorage.setItem('anon.analytics-choice.v1', 'decline');
    await anonClientLogs.flush();
  });
  assert.ok(batches.flatMap(batch => batch.events).every(event => event.kind !== 'page_view'));
});
