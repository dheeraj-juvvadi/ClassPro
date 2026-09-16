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
  app.get('/api/session', (request, response) => {
    sessionChecks += 1;
    setTimeout(() => response.json({ authenticated: true, authMode: 'http', provider: 'academia' }), 2500);
  });
  app.get('/api/reports', (request, response) => {
    if (request.query.cache === 'only') return response.json(reportsPayload);
    response.json(reportsPayload);
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
  await page.evaluate(payload => localStorage.setItem('classpro-reports-cache', JSON.stringify({ ...payload, syncedAt: Date.now() })), reportsPayload);
  await page.reload();
  const waitStart = Date.now();
  await page.locator('#home-view').waitFor({ state: 'visible' });
  const visibleAfter = Date.now() - waitStart;
  assert.ok(visibleAfter < 1000, `cached view took ${visibleAfter}ms, not instant`);
  assert.match(await page.locator('#updated-at').innerText(), /Last synced|Updated/);
  assert.ok(await page.locator('#attendance-content').innerText().then(text => text.includes('CS101')));
  assert.equal(await page.locator('#startup').isHidden(), true);
  await page.waitForTimeout(3200);
  assert.ok(sessionChecks >= 1, 'background session validation never ran');
  assert.equal(await page.locator('#home-view').isHidden(), false, 'session check kicked user off cached view');
  await page.evaluate(() => localStorage.removeItem('classpro-reports-cache'));
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
});
