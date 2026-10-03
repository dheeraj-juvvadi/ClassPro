import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const worker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
test('offline worker excludes APIs, external requests, queries and private assets', () => {
  const handlers = {};
  const context = vm.createContext({ URL, Set, self: { location: { origin: 'https://anon.example' },
    addEventListener: (type, handler) => { handlers[type] = handler; } } });
  vm.runInContext(worker, context);
  for (const [path, method, mode] of [
    ['/api/reports', 'GET', 'cors'], ['/api/session', 'GET', 'cors'], ['/api/login/client', 'POST', 'cors'],
    ['/_vercel/insights/script.js', 'GET', 'cors'], ['/ocr/portal-alnum.onnx', 'GET', 'cors'],
    ['/?private=token', 'GET', 'navigate'], ['/missing', 'GET', 'navigate'], ['/unknown.js', 'GET', 'cors'],
    ['https://external.example/image.png', 'GET', 'cors'],
  ]) {
    let intercepted = false;
    handlers.fetch({ request: { url: new URL(path, 'https://anon.example').href, method, mode }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false, path);
  }
});

test('failed installation drains work before cleanup and activation prunes only old Anon caches', async () => {
  const handlers = {}, events = [];
  let active = 0, maximum = 0;
  const context = vm.createContext({ URL, Set, Request,
    caches: {
      open: async () => ({ add: async request => {
        active++; maximum = Math.max(maximum, active);
        await new Promise(resolve => setTimeout(resolve, 1)); active--;
        if (request.url.endsWith('/')) throw new Error('synthetic failure');
      } }),
      delete: async key => { events.push([key, active]); },
      keys: async () => ['unrelated-cache', 'anon-shell-old'],
    },
    self: { location: { origin: 'https://anon.example' }, clients: { claim: async () => events.push(['claim', active]) },
      addEventListener: (type, handler) => { handlers[type] = handler; } },
  });
  // Relative Request URLs are resolved by the service-worker environment.
  context.Request = class extends Request { constructor(url, options) { super(new URL(url, 'https://anon.example'), options); } };
  vm.runInContext(worker, context);
  let install;
  handlers.install({ waitUntil(promise) { install = promise; } });
  await assert.rejects(install, /synthetic failure/);
  assert.ok(maximum <= 3);
  assert.equal(events[0][1], 0, 'cleanup must wait for all in-flight downloads');
  let activation;
  handlers.activate({ waitUntil(promise) { activation = promise; } });
  await activation;
  assert.ok(events.some(([key]) => key === 'anon-shell-old'));
  assert.ok(events.every(([key]) => key !== 'unrelated-cache'));
  assert.equal(events.at(-1)[0], 'claim');
});

test('installed shell reopens saved reports offline and never caches private API data', { timeout: 30000 }, async context => {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const report = { attendance: { data: [{ code: 'CS101', title: 'Offline course', present: 9, conducted: 10 }] },
    marks: { data: [] }, schedule: { timezone: 'Asia/Kolkata',
      entries: [{ code: 'CS101', title: 'Offline course', room: 'Lab 1', dayOrder: '1', start: '10:00', end: '11:00', hours: 1 }],
      calendar: [{ date: day, kind: 'teaching', dayOrder: '1' }] }, profile: { name: 'Synthetic Student', regNo: 'OFFLINE-TEST' },
    connections: { portal: { connected: true } }, updatedAt: new Date().toISOString(),
    sync: { due: false, nextAt: Date.now() + 3600000, syncedAt: Date.now() } };
  const app = express();
  app.get('/api/session', (req, res) => res.json({ authenticated: true, authMode: 'http' }));
  app.get('/api/reports', (req, res) => res.json(report));
  app.post('/api/client-events', (req, res) => res.json({ accepted: true }));
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const session = await browser.newContext();
  const page = await session.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  await page.locator('#home-view').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const keys = (await (await caches.open(names.find(n => n.startsWith('anon-shell-')))).keys()).map(r => new URL(r.url).pathname);
    return { names, keys };
  });
  assert.equal(cached.names.filter(n => n.startsWith('anon-shell-')).length, 1);
  assert.ok(cached.keys.includes('/index.html') || cached.keys.includes('/'));
  assert.ok(cached.keys.every(path => !/^\/(api|_vercel|ocr)\//.test(path)));
  const cachedReport = await page.evaluate(() => JSON.parse(localStorage.getItem('anon-reports-cache')));
  assert.deepEqual(cachedReport.schedule, report.schedule, 'timetable itself is stored in this browser');
  await page.locator('[data-sidebar-action="open-schedule"]').click();
  assert.equal(await page.locator('#schedule-choices input').count(), 1);
  await page.locator('#schedule-choices input').uncheck();
  await page.locator('button[data-page="attendance"]').click();
  await session.setOffline(true);
  await page.reload();
  await page.locator('#attendance-panel').waitFor({ state: 'visible' });
  assert.match(await page.locator('#attendance-content').innerText(), /Offline course/);
  assert.equal(await page.locator('#sync-notice-label').innerText(), 'Offline · showing saved data');
  assert.equal(await page.locator('#startup').isHidden(), true);
  await page.locator('[data-sidebar-action="open-schedule"]').click();
  assert.equal(await page.locator('#schedule-choices input').count(), 1, 'cached timetable opens offline');
  assert.equal(await page.locator('#schedule-choices input').isChecked(), false, 'optional-period choices persist offline');
  await page.locator('#schedule-include-all').click();
  await page.locator('button[data-page="attendance"]').click();
  await page.locator('#calculate-attendance').click();
  assert.equal(await page.locator('#projection-range-form').isVisible(), false);
  assert.equal(await page.locator('#projection-customize').evaluate(el => el.open), true);
  await page.locator('#projection-calendar').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#projection-outlook').isHidden(), true);
  await page.locator(`calendar-month button[part~="date-${day}"]`).click();
  assert.match(await page.locator('#projection-live-hours').innerText(), /1h/);
  await page.locator('#projection-review-custom').click();
  assert.equal(await page.locator('#attendance-panel').isVisible(), true);
  assert.equal(await page.locator('#attendance-content .attendance-percent').textContent(), '81.8%');
  await page.locator('#calculate-attendance').click();
  await page.locator('#projection-calendar').waitFor({ state: 'visible' });
  assert.equal(await page.locator('calendar-month button').count() > 27, true, 'calendar component lazy-loads offline');
  assert.equal(await page.locator('calendar-month button[aria-current="date"]').isDisabled(), false);
  assert.equal(await page.locator('calendar-month button[aria-current="date"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#projection-review-custom').click();
  assert.equal(await page.evaluate(async () => { try { await fetch('/api/reports'); return false; } catch { return true; } }), true);
  await page.evaluate(() => { clearReportsCache(); showLogin('Signed out locally.'); });
  await page.reload();
  await page.locator('#login-view').waitFor({ state: 'visible' });
  assert.match(await page.locator('#login-message').innerText(), /offline/);
  assert.equal(await page.evaluate(() => localStorage.getItem('anon-reports-cache')), null);
  assert.equal(await page.locator('#attendance-content').innerText(), '');
  assert.deepEqual(errors, []);
});
