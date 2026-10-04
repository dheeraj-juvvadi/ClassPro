import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('returning sync distinguishes queue, completion, unchanged data and failures', { timeout: 25000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const report = {
    updatedAt: new Date().toISOString(),
    attendance: { data: [{ code: 'CS101', title: 'Synthetic course', present: 9, conducted: 10, percent: 90 }] },
    marks: { data: [] }, schedule: { entries: [] },
    connections: { portal: { connected: true } },
    sync: { syncedAt: Date.now() - 86400000, nextAt: 1, due: true },
  };
  await page.addInitScript(payload => {
    localStorage.setItem('anon-reports-cache', JSON.stringify({ ...payload, syncedAt: Date.now() }));
    localStorage.setItem('anon.consent.v1', 'declined');
  }, report);
  let mode = 'queued', requests = 0, latest = report.sync.syncedAt, completionWait = false;
  const requestURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => {
    requests++;
    requestURLs.push(route.request().url());
    if (mode === 'error') return route.fulfill({ status: 503, json: { error: { message: 'Synthetic unavailable' } } });
    return route.fulfill({ json: { ...report,
      warnings: mode === 'partial' ? ['One portal did not update.'] : [],
      sync: { syncedAt: latest, nextAt: Date.now() + (mode === 'queued' ? 250 : 3600000),
        due: false, pending: mode === 'queued', waitForCompletion: completionWait },
    } });
  });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('#sync-progress').textContent === 'Syncing reports…');
  assert.equal(requests, 1, 'returning app checks the saved server report and observes queued work');
  assert.equal(await page.locator('#refresh').isDisabled(), true);
  assert.equal(await page.locator('#refresh').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('#sync-notice').isVisible(), false, 'queued sync has no floating progress box');
  assert.equal(await page.locator('#reports-message').isVisible(), false, 'queued sync has no duplicate report banner');
  mode = 'completed'; latest = Date.now();
  const completionStarted = Date.now();
  await page.waitForFunction(() => document.querySelector('#sync-notice-label').textContent === 'Synced');
  assert.ok(Date.now() - completionStarted < 1500, 'completion should honor the short server hint without an artificial two-second wait');
  assert.equal(requests, 2);
  assert.equal(await page.locator('#sync-progress').textContent(), '');
  assert.match(requestURLs[0], /cache=only/);
  assert.match(requestURLs[1], /cache=only/);
  assert.equal(await page.locator('.sync-notice-flower').evaluate(el => el.getAnimations().length), 0);
  await page.evaluate(() => loadReports({ force: true }));
  await page.waitForFunction(() => document.querySelector('#sync-notice-label').textContent === 'Up to date');
  mode = 'queued'; completionWait = true;
  await page.evaluate(() => { pendingSyncChecks = 8; return loadReports({ force: true, followup: true }); });
  mode = 'completed'; latest += 1000;
  const awaitedCompletion = Date.now();
  await page.waitForFunction(() => document.querySelector('#sync-notice-label').textContent === 'Synced');
  assert.ok(Date.now() - awaitedCompletion < 1500, 'server completion wait must bypass the five-second polling backoff');
  assert.match(requestURLs.at(-1), /cache=only&wait=1/);
  completionWait = false;
  mode = 'partial';
  await page.evaluate(() => loadReports({ force: true }));
  await page.waitForFunction(() => document.querySelector('#sync-notice').dataset.state === 'error');
  assert.equal(await page.locator('#sync-notice-label').innerText(), 'Some data couldn’t sync');
  mode = 'error';
  await page.evaluate(() => loadReports({ silent: true }));
  await page.waitForFunction(() => document.querySelector('#sync-notice-label').textContent === 'Couldn’t sync · try again');
  assert.equal(await page.locator('#home-view').isVisible(), true);
  assert.equal(await page.locator('#refresh').isDisabled(), false);
  mode = 'queued';
  await page.evaluate(() => loadReports({ force: true }));
  await page.context().setOffline(true);
  await page.waitForFunction(() => document.querySelector('#sync-notice').dataset.state === 'offline');
  assert.equal(await page.locator('#home-view').isVisible(), true);
  await page.context().setOffline(false);
  mode = 'completed'; latest += 1000;
  await page.evaluate(() => { nextAutoSync = 0; resumeSync(); });
  await page.waitForFunction(() => document.querySelector('#sync-notice-label').textContent === 'Synced');
  await page.locator('#sync-notice').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.sync-notice-flower').evaluate(el => el.getAnimations().length), 0);
  assert.deepEqual(errors, []);
});
