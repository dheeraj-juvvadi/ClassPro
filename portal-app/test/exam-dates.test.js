import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('endsem dates handle new sessions, unpublished dates, cached fallback and calendar markers', { timeout: 30000 }, async context => {
  const app = express(); app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-02T06:00:00Z') });
  page.setDefaultTimeout(5000);
  const errors = []; let calls = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  await page.route('**/api/**', route => { calls++; return route.fulfill({ json: {} }); });
  const home = `http://127.0.0.1:${server.address().port}/?preview=home`;
  await page.goto(home);
  assert.equal(await page.locator('#home-exam-link').isVisible(), true);
  await page.reload();
  assert.equal(await page.locator('#home-exam-link').isVisible(), true);
  await page.locator('#home-exam-link').click();
  await page.locator('#exams-view').waitFor();
  await page.goto(home);
  assert.equal(await page.locator('#home-exam-link').isHidden(), true);
  await page.locator('#planner-menu summary').click();
  await page.locator('#open-exams').click();
  await page.locator('#exams-view').waitFor();
  assert.equal(await page.locator('#exams-title').innerText(), 'View your endsem dates');
  assert.match(await page.locator('#exam-status').innerText(), /Connect Student Portal/);
  const report = { status: 'published', checkedAt: '2026-10-02T06:00:00Z', stale: false,
    provisional: true, source: 'Student Portal · Scribe Request', sessions: [
      { value: '11_2026', label: 'Nov 2026' }, { value: '12_2026', label: 'Dec 2026' },
      { value: '4_2027', label: 'Apr 2027' }, { value: '5_2027', label: 'May 2027' },
    ], entries: [
      { code: 'DS', title: 'Data Structures', date: '2026-11-10', session: 'FN', period: '11_2026', periodLabel: 'Nov 2026', provisional: true },
      { code: 'CN', title: 'Computer Networks', date: null, session: null, period: '12_2026', periodLabel: 'Dec 2026', provisional: true },
      { code: 'OS', title: 'Operating Systems', date: '2027-04-14', session: 'AN', period: '4_2027', periodLabel: 'Apr 2027', provisional: false },
      { code: 'MATH', title: '<img src=x onerror=alert(1)>', date: '2027-05-07', session: 'FN', period: '5_2027', periodLabel: 'May 2027', provisional: true },
    ] };
  await page.evaluate(data => anonExamDates.update(data), report);
  assert.equal(await page.locator('.exam-row').count(), 4);
  assert.equal(await page.locator('.exam-pending').innerText(), 'Not published');
  assert.equal(await page.locator('#exam-list img').count(), 0);
  assert.match(await page.locator('#exam-status').innerText(), /Provisional/);
  assert.equal(await page.locator('#exam-period option').count(), 5);
  for (const width of [320,390,430,1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.selectOption('#exam-period', '5_2027');
  assert.equal(await page.locator('.exam-row').count(), 1);
  assert.match(await page.locator('.exam-when').innerText(), /2027/);
  await page.selectOption('#exam-period', '12_2026');
  assert.match(await page.locator('#exam-status').innerText(), /not been published/);
  await page.selectOption('#exam-period', '4_2027');
  assert.equal(await page.locator('#exam-status').innerText(), 'Student Portal timetable');
  await page.evaluate(data => anonExamDates.update({ ...data, stale: true }), report);
  assert.match(await page.locator('#exam-status').innerText(), /Cached dates/);
  assert.equal(await page.locator('.exam-row').count(), 1);
  await page.evaluate(data => anonExamDates.update({ ...data, sessions: [], entries: [] }), report);
  assert.equal(await page.locator('#exam-period').inputValue(), '');
  assert.match(await page.locator('#exam-status').innerText(), /no exam subjects/);
  await page.evaluate(data => anonExamDates.update({ ...data,
    entries: data.entries.map(row => ({ ...row, date: null, session: null })) }), report);
  assert.match(await page.locator('#exam-status').innerText(), /Subjects loaded.*not been published/);
  await page.evaluate(data => anonExamDates.update(data), report);
  assert.equal(await page.evaluate(() => anonExamDates.forDate(new Date(2026,10,10,12)).length), 1);
  await page.setViewportSize({ width:390,height:844 });
  await page.locator('#planner-menu summary').click();await page.locator('#open-calendar').click();
  // Sample calendar opens September; navigate to the published November exam.
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  const day = page.locator('#academic-calendar [data-date="2026-11-10"]');
  assert.equal(await day.getAttribute('data-kind'), 'exam');await day.click();
  assert.match(await page.locator('.calendar-exam').innerText(), /Data Structures/);
  await page.locator('#planner-menu summary').click();await page.locator('#open-exams').click();
  assert.equal(await page.locator('#exams-title').evaluate(el => el === document.activeElement), true);
  const examRequests = [];
  await page.route('**/api/exams*', route => {
    examRequests.push(route.request().url());
    return route.fulfill({ json: { exams: report, connections: { portal: { connected: true } } } });
  });
  // Exercise the real page fetch while keeping login/report APIs isolated.
  await page.evaluate(() => history.replaceState(null, '', '/#exams'));
  await page.evaluate(() => anonExamDates.refresh());
  assert.equal(examRequests.length, 1);
  assert.equal(new URL(examRequests[0]).pathname, '/api/exams');
  assert.match(await page.locator('#exam-list').innerText(), /Data Structures/);
  await page.locator('#exam-sync').click();
  await page.waitForFunction(() => !document.getElementById('exam-sync').disabled);
  assert.equal(new URL(examRequests[1]).search, '?force=1');
  await page.evaluate(data => anonExamDates.update(data, { portal: { connected: true, expired: true } }), report);
  assert.match(await page.locator('#exam-status').innerText(), /Reconnect Student Portal/);
  assert.equal(await page.locator('.exam-row').count(), 4);
  await page.route('**/api/exams*', route => route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } }));
  await page.evaluate(() => anonExamDates.refresh(true));
  assert.match(await page.locator('#exam-status').innerText(), /showing saved dates/);
  await page.evaluate(() => anonExamDates.clear());
  await page.evaluate(() => anonExamDates.refresh(true));
  assert.equal(await page.locator('#exam-status').innerText(), 'Could not check dates. Try Sync again.');
  await page.evaluate(() => showLogin());
  assert.equal(await page.locator('#exams-view').isVisible(), false);
  assert.equal(await page.locator('.exam-row').count(), 0);
  assert.deepEqual(errors, []);assert.equal(calls, 0);
});
