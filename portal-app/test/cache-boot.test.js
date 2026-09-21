import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const reportsPayload = {
  updatedAt: new Date().toISOString(),
  attendance: { data: [{ code: 'CS101', title: 'Synthetic Course', present: 9, conducted: 10, percent: 90 }] },
  marks: { data: [{ code: 'CS101', title: 'Synthetic course', scored: 9, total: 10, components: [] }] },
  schedule: { entries: [{ title: 'Synthetic class', day: 1 }] },
  connections: { portal: { connected: true, expired: false } },
  sync: { nextAt: Date.now() + 3600_000, due: false, syncedAt: Date.now() - 60_000 },
};

test('cache-first boot paints cached reports without waiting for /api/session', { timeout: 45000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  app.use(express.json());
  let sessionChecks = 0;
  let sessionValid = true;
  let offline = false;
  let pending = false;
  let syncedAt = reportsPayload.sync.syncedAt;
  app.get('/api/session', (request, response) => {
    sessionChecks += 1;
    if (offline) return response.status(503).json({ error: { message: 'Offline' } });
    setTimeout(() => response.json({ authenticated: sessionValid, authMode: 'http', provider: 'academia' }), 2500);
  });
  app.get('/api/reports', (request, response) => {
    if (request.query.cache === 'only') return response.json(reportsPayload);
    response.json({ ...reportsPayload, sync: { ...reportsPayload.sync, syncedAt,
      pending, nextAt: pending ? Date.now() + 1000 : reportsPayload.sync.nextAt } });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  assert.match(await page.locator('#startup').innerText(), /Dilly-dallying…/);
  assert.equal(await page.locator('.startup-flower').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('.startup-flower').evaluate(el => el.getAnimations().length), 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.startup-flower').evaluate(el => el.getAnimations().length), 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(payload => localStorage.setItem('classpro-reports-cache', JSON.stringify({ ...payload, syncedAt: Date.now() })), reportsPayload);
  await page.reload();
  const waitStart = Date.now();
  await page.locator('#home-view').waitFor({ state: 'visible' });
  const visibleAfter = Date.now() - waitStart;
  assert.ok(visibleAfter < 1000, `cached view took ${visibleAfter}ms, not instant`);
  assert.equal(await page.evaluate(() => localStorage.getItem('classpro-reports-cache')), null);
  assert.ok(await page.evaluate(() => localStorage.getItem('anon-reports-cache')));
  assert.match(await page.locator('#updated-at').innerText(), /Last synced|Updated/);
  assert.ok(await page.locator('#attendance-content').innerText().then(text => text.includes('CS101')));
  assert.equal(await page.locator('#startup').isHidden(), true);
  assert.equal(await page.locator('.startup-flower').evaluate(el => el.getAnimations().length), 0, 'hidden startup must not keep animating');
  await page.waitForTimeout(3200);
  assert.ok(sessionChecks >= 1, 'background session validation never ran');
  assert.equal(await page.locator('#home-view').isHidden(), false, 'session check kicked user off cached view');
  pending = true;
  await page.locator('[data-page=attendance]:visible').first().click();
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.querySelector('#reports-message').textContent.includes('Sync queued'));
  assert.equal(await page.locator('#attendance-content').isVisible(), true);
  assert.equal(await page.locator('#sync-notice-label').innerText(), 'Dilly-dallying…');
  assert.equal(await page.locator('#refresh').isDisabled(), true, 'queued work must retain the syncing state');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.sync-notice-flower').evaluate(el => el.getAnimations().length), 0);
  pending = false;
  syncedAt = Date.now();
  await page.evaluate(() => { nextAutoSync = 0; resumeSync(); });
  await page.waitForFunction(() => !document.querySelector('#reports-message').textContent.includes('Sync queued'));
  await page.waitForFunction(() => document.querySelector('#sync-notice-label').textContent === 'Synced');
  assert.equal(await page.locator('#refresh').isDisabled(), false);
  offline = true;
  await page.reload();
  await page.locator('#attendance-panel').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#login-form').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#attendance-panel').isVisible(), true, 'network failure should retain cached data and selected section');
  offline = false;
  sessionValid = false;
  await page.reload();
  await page.locator('#login-view').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => localStorage.getItem('anon-reports-cache')), null, 'confirmed expired session must clear cached reports');
});

test('installed app context exposes manifest wiring', { timeout: 20000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const manifestLink = await page.locator('link[rel="manifest"]').getAttribute('href');
  assert.ok(manifestLink, 'index.html must link a web app manifest for install');
  const manifest = await (await page.request.get(new URL(manifestLink, `http://127.0.0.1:${server.address().port}`).href)).json();
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons?.length >= 2, 'manifest needs icons for install prompt');
  assert.deepEqual(manifest.launch_handler.client_mode, ['focus-existing', 'auto']);
  assert.deepEqual(manifest.shortcuts.map(item => item.url), ['/#home', '/#attendance', '/#marks']);
});

test('installed-app shortcuts reuse cached views, respect forms and support back navigation', { timeout: 20000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  let reportRequests = 0, valid = true;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { authenticated: valid, authMode: 'http' } });
    if (path === '/api/reports') {
      assert.equal(new URL(route.request().url()).searchParams.get('cache'), 'only');
      reportRequests++;
      return route.fulfill({ json: { ...reportsPayload, academicHistory: { status: 'ready', currentCgpa: 8.48, completedCredits: 130, semesters: [] } } });
    }
    return route.fulfill({ json: { success: true } });
  });
  await page.addInitScript(payload => {
    localStorage.setItem('anon-reports-cache', JSON.stringify({ ...payload, syncedAt: Date.now() }));
    localStorage.setItem('anon.analytics-choice.v1', 'decline');
    Object.defineProperty(window, 'launchQueue', { configurable: true, value: {
      setConsumer(callback) { window.deliverLaunch = callback; },
    } });
  }, reportsPayload);
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/#attendance`);
  await page.locator('#attendance-panel').waitFor({ state: 'visible' });
  assert.equal(await page.title(), 'Attendance · Anon');
  await page.waitForFunction(() => document.querySelector('#login-form').getAttribute('aria-busy') === 'false');
  assert.equal(reportRequests, 1, 'boot revalidates saved server data without an upstream sync');
  assert.equal(await page.locator('#marks-current-cgpa').inputValue(), '8.48');
  assert.equal(await page.locator('#marks-completed-credits').inputValue(), '130');
  await page.locator('[data-page="marks"]:visible').click();
  assert.match(page.url(), /#marks$/);
  await page.goBack();
  await page.locator('#attendance-panel').waitFor({ state: 'visible' });
  await page.evaluate(() => deliverLaunch({ targetURL: `${location.origin}/#marks` }));
  await page.locator('#marks-panel').waitFor({ state: 'visible' });
  await page.evaluate(() => deliverLaunch({ targetURL: 'https://untrusted.invalid/#home' }));
  assert.equal(await page.locator('#marks-panel').isVisible(), true);
  await page.evaluate(() => { document.getElementById('connect-dialog').showModal(); deliverLaunch({ targetURL: `${location.origin}/#home` }); });
  assert.equal(await page.locator('#marks-panel').isVisible(), true, 'launch must preserve an open form');
  await page.evaluate(() => document.getElementById('connect-dialog').close());
  await page.locator('#home-view').waitFor({ state: 'visible' });
  assert.equal(reportRequests, 1, 'relaunch must reuse the document and report cache');
  valid = false;
  await page.reload();
  await page.locator('#login-view').waitFor({ state: 'visible' });
  await page.evaluate(() => deliverLaunch({ targetURL: `${location.origin}/#marks` }));
  assert.equal(await page.locator('#login-view').isVisible(), true, 'shortcut does not bypass sign-in');
});
