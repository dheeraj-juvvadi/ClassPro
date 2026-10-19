import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('report syncs never request exams; only the Endsem page does', { timeout: 30000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const exam = { entries: [{ code: 'SYN1', title: 'Sample course', date: '2026-11-20',
    session: 'FN', period: '11_2026', provisional: true }], stale: false,
    checkedAt: new Date().toISOString(), nextCheckAt: Date.now() + 6 * 86400000 };
  const report = { updatedAt: new Date().toISOString(),
    attendance: { data: [{ code: 'SYN1', title: 'Sample course', present: 9, conducted: 10, percent: 90 }] },
    marks: { data: [] }, schedule: { entries: [] }, exams: exam,
    connections: { portal: { connected: true } },
    sync: { syncedAt: Date.now() - 60000, nextAt: Date.now() + 3600000, due: false,
      retry: null, examRetry: null } };
  await page.addInitScript(data => {
    localStorage.setItem('anon-reports-cache', JSON.stringify({ ...data, syncedAt: Date.now() }));
    localStorage.setItem('anon.analytics-choice.v1', 'decline');
  }, report);
  const examURLs = [], reportURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => {
    reportURLs.push(route.request().url());
    return route.fulfill({ json: report });
  });
  await page.route('**/api/exams*', route => {
    examURLs.push(route.request().url());
    return route.fulfill({ json: { exams: exam, connections: report.connections,
      retry: null, nextCheckAt: exam.nextCheckAt } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  assert.equal(examURLs.length, 0);
  assert.equal(await page.evaluate(() => anonExamDates.retry), undefined,
    'no automatic exam retry entry point remains');
  // Main Sync is reports-only.
  await page.locator('#refresh').click();
  await page.waitForFunction(() => !busy && !reportLoad);
  assert.equal(examURLs.length, 0, 'main Sync never requests exams');
  assert.equal(await page.evaluate(() => readReportsCache().exams.entries[0].date), '2026-11-20');
  // Settings Sync is reports-only.
  await page.locator('[data-sidebar-action="open-accounts"]').click();
  await page.locator('#settings-sync').click();
  await page.waitForFunction(() => !document.getElementById('settings-sync').disabled);
  assert.equal(examURLs.length, 0, 'settings Sync never requests exams');
  assert.equal(await page.evaluate(() => readReportsCache().exams.entries[0].date), '2026-11-20',
    'saved date remains through report syncs');
  assert.match(await page.locator('#settings-message').innerText(), /up to date/);
  // Only the Endsem page (or its button) may request the cached endpoint.
  const examFetch = page.waitForRequest('**/api/exams');
  await page.locator('[data-sidebar-action="open-exams"]').click();
  await examFetch;
  await page.waitForFunction(() => !document.getElementById('exam-sync').disabled);
  assert.equal(examURLs.length, 1, 'opening Endsem requests cached dates once');
  assert.match(await page.locator('.exam-weekly').innerText(), /once a week/);
  assert.match(await page.locator('#exam-checked').innerText(), /checked weekly/);
  await page.locator('#exam-sync').click();
  await page.waitForFunction(() => !document.getElementById('exam-sync').disabled);
  assert.equal(examURLs.length, 2, 'Check dates button re-requests the cached endpoint');
  assert.equal(await page.evaluate(() => readReportsCache().exams.entries[0].date), '2026-11-20');
  assert.deepEqual(errors, []);
});
