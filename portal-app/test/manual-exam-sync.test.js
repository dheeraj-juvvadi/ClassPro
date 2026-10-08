import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('manual sync includes exams after queued reports; automatic sync does not', { timeout: 30000 }, async context => {
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
  const report = { updatedAt: new Date().toISOString(),
    attendance: { data: [{ code: 'SYN1', title: 'Sample course', present: 9, conducted: 10, percent: 90 }] },
    marks: { data: [] }, schedule: { entries: [] },
    connections: { portal: { connected: true } },
    sync: { syncedAt: Date.now() - 60000, nextAt: Date.now() + 3600000, due: false } };
  await page.addInitScript(data => {
    localStorage.setItem('anon-reports-cache', JSON.stringify({ ...data, syncedAt: Date.now() }));
    localStorage.setItem('anon.analytics-choice.v1', 'decline');
  }, report);
  let queued = false, examError = false, portal = true, examCalls = 0, forcedReports = 0;
  let releaseExam;
  const exam = { entries: [{ code: 'SYN1', title: 'Sample course', date: '2026-11-20',
    session: 'FN', period: '11_2026', provisional: true }], stale: false, checkedAt: new Date().toISOString() };
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => {
    if (new URL(route.request().url()).searchParams.has('force')) forcedReports++;
    return route.fulfill({ json: { ...report, connections: portal ? report.connections : { academia: { connected: true } },
      sync: { ...report.sync, pending: queued, nextAt: Date.now() + (queued ? 30000 : 3600000) } } });
  });
  await page.route('**/api/exams*', async route => {
    examCalls++;
    assert.equal(new URL(route.request().url()).searchParams.get('force'), '1');
    if (examError) return route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } });
    await new Promise(resolve => { releaseExam = resolve; });
    return route.fulfill({ json: { exams: exam, connections: report.connections } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  assert.equal(examCalls, 0);
  queued = true;
  await page.locator('#refresh').click();
  await page.waitForFunction(() => !busy && !reportLoad && pendingExamSync);
  assert.equal(forcedReports, 1);
  assert.equal(examCalls, 0, 'exam request waits for Portal recovery');
  queued = false;
  const examStarted = page.waitForRequest('**/api/exams?force=1');
  const finished = page.evaluate(() => loadReports({ cacheOnly: true, followup: true }));
  await examStarted;
  assert.equal(await page.locator('#refresh').isDisabled(), true);
  releaseExam(); await finished;
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  assert.equal(examCalls, 1);
  assert.equal(await page.evaluate(() => readReportsCache().exams.entries[0].date), '2026-11-20');
  await page.evaluate(() => loadReports({ silent: true }));
  assert.equal(examCalls, 1, 'automatic/background sync does not refetch exams');
  await page.locator('[data-sidebar-action="open-accounts"]').click();
  examError = true;
  await page.locator('#settings-sync').click();
  await page.waitForFunction(() => !document.getElementById('settings-sync').disabled);
  assert.equal(examCalls, 2);
  assert.match(await page.locator('#settings-message').innerText(), /Some data could not refresh/);
  portal = false;
  await page.evaluate(() => loadReports({ force: true, includeExams: true }));
  assert.equal(examCalls, 2, 'Academia-only users do not request Portal exams');
  portal = true; examError = false;
  const nextExam = page.waitForRequest('**/api/exams?force=1');
  const signingOut = page.evaluate(() => loadReports({ force: true, includeExams: true }));
  await nextExam;
  await page.evaluate(() => { clearReportsCache(); showLogin(); });
  releaseExam(); await signingOut;
  assert.equal(await page.evaluate(() => readReportsCache()), null, 'in-flight exams cannot restore signed-out reports');
  assert.equal(await page.locator('.exam-row').count(), 0);
  assert.deepEqual(errors, []);
});
