import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('one ID connects both providers and keeps failures inline', { timeout: 30000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage();
  const requests = [];
  let failed = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { authenticated: false, authMode: 'http' } });
    if (path === '/api/challenge') return route.fulfill({ json: { required: false } });
    if (path === '/api/login/client') {
      const body = route.request().postDataJSON(); requests.push(body);
      if (failed) return route.fulfill({ status: 502, json: { error: { code: 'PORTAL_UNAVAILABLE', message: 'Temporarily unavailable' } } });
      return route.fulfill({ json: { authenticated: true } });
    }
    return route.fulfill({ json: { attendance: { data: [] }, marks: { data: [] }, connections: { academia: { connected: true }, portal: { connected: true } } } });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  await page.locator('#login-view').waitFor({ state: 'visible' });
  await page.locator('#account').fill('student@srmist.edu.in');
  await page.locator('#password').fill('academia secret');
  await page.locator('#portal-password').fill('portal secret');
  // The real Portal challenge advertises serverAuto; use a synthetic image here.
  await page.route('**/api/challenge', route => route.fulfill({ json: route.request().postDataJSON().provider === 'portal'
    ? { required: true, serverAuto: true, image: 'data:image/png;base64,dGVzdA==' } : { required: false } }));
  await page.locator('#sign-in').click();
  await page.locator('#home-view').waitFor({ state: 'visible' });
  assert.deepEqual(requests.map(r => [r.provider, r.account, r.password]), [
    ['academia', 'student@srmist.edu.in', 'academia secret'],
    ['portal', 'student@srmist.edu.in', 'portal secret'],
  ]);
  assert.ok(requests.every(r => !('portalPassword' in r)));
  assert.equal(await page.locator('#password').inputValue(), '');
  assert.equal(await page.locator('#portal-password').inputValue(), '');
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /academia secret|portal secret/);
  failed = true;
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#login-view').waitFor({ state: 'visible' });
  await page.locator('#account').fill('student');
  await page.locator('#password').fill('wrong');
  await page.locator('#sign-in').click();
  await page.locator('#login-message').waitFor({ state: 'visible' });
  assert.match(await page.locator('#login-message').innerText(), /Academia.*Temporarily unavailable/);
  assert.equal(await page.locator('dialog[open]').count(), 0);
});
