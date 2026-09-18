import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import '../public/attendance-math.js';
import '../public/home-model.js';
import '../public/schedule-model.js';
import '../public/date-projection.js';

const courses = [{ code: 'CS', present: 18, conducted: 22 }];
const source = { entries: [{ code: 'CS', title: 'Course', room: 'Room', dayOrder: '1', start: '08:00', end: '09:40', hours: 2 }],
  calendar: [13, 14, 15].map(day => ({ date: `2026-09-${day}`, kind: 'teaching', dayOrder: '1' })) };
const today = new Date(2026, 8, 14);

test('leave uses counted timetable hours and includes intervening attended days', () => {
  const result = dateProjection.calculate(courses, source, { '2026-09-15': 'leave' }, today);
  assert.deepEqual(result.courses[0].impact, { attend: 2, miss: 2, od: 0 });
  assert.equal(result.courses[0].prediction.percentage, 76.92);
});
test('past OD corrects absences without adding conducted hours', () => {
  const result = dateProjection.calculate(courses, source, { '2026-09-13': 'od' }, today);
  assert.equal(result.courses[0].prediction.percentage, 90.91);
  assert.equal(result.courses[0].prediction.conducted, 22);
});
test('holidays and unknown dates never manufacture attendance hours', () => {
  const result = dateProjection.calculate(courses, { ...source, calendar: [{ date: '2026-09-15', kind: 'holiday' }] }, { '2026-09-15': 'leave' }, today);
  assert.deepEqual(result.unknown, ['2026-09-14']);
  assert.deepEqual(result.courses[0].impact, { attend: 0, miss: 0, od: 0 });
});

test('open date plans reconcile refreshed records, rollover and sign-out', { timeout: 20000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.goto(`http://127.0.0.1:${server.address().port}/?preview=home`);
  await page.evaluate(() => {
    globalThis.dateTestReport = { data: [{ code: 'DS', title: 'Data Structures', present: 18, conducted: 22 }] };
    globalThis.dateTestSchedule = { timezone: 'Asia/Kolkata',
      entries: [{ code: 'DS', title: 'Data Structures', room: 'Lab', dayOrder: '1', start: '10:30', end: '12:30', hours: 2 }],
      calendar: [13, 14, 15, 16].map(day => ({ date: `2026-09-${day}`, kind: 'teaching', dayOrder: '1' })) };
    classproHome.update(dateTestReport, dateTestSchedule);
  });
  await page.locator('button[data-page="attendance"]').click();
  await page.locator('#calculate-attendance').click();
  const day = value => page.locator(`#projection-calendar button[data-date="2026-09-${value}"]`);
  await day(14).click();
  await day(15).click();
  assert.match(await page.locator('#projection-result').innerText(), /69.23%/);
  await page.evaluate(() => {
    dateTestReport.data[0] = { ...dateTestReport.data[0], present: 20, conducted: 24 };
    classproHome.update(dateTestReport, dateTestSchedule);
  });
  assert.equal(await day(15).evaluate(el => el === document.activeElement), true);
  assert.equal(await day(14).getAttribute('aria-pressed'), 'true');
  assert.equal(await day(15).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#projection-result').innerText(), /71.43%/);
  await day(14).focus();
  await page.evaluate(() => {
    dateTestSchedule.calendar[1] = { date: '2026-09-14', kind: 'holiday' };
    classproHome.update(dateTestReport, dateTestSchedule);
  });
  assert.equal(await day(14).isDisabled(), true);
  assert.equal(await day(14).getAttribute('aria-pressed'), 'false');
  assert.equal(await day(15).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.matches('#projection-calendar button:not(:disabled), #projection-next')), true);
  assert.match(await page.locator('#projection-result').innerText(), /76.92%/);
  assert.match(await page.locator('#projection-period').innerText(), /cleared 1 unavailable date/);
  await page.locator('#date-actions button[data-action="od"]').click();
  await day(13).click();
  await page.evaluate(() => dateAttendance.clock(new Date(2026, 8, 16)));
  assert.equal(await day(15).getAttribute('aria-pressed'), 'false');
  assert.equal(await day(13).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#projection-result').innerText(), /91.67%/);
  await page.locator('#close-projection').click();
  await page.evaluate(() => dateAttendance.open('DS', new Date(2026, 8, 16)));
  assert.equal(await page.locator('#date-actions button[data-action="leave"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await day(16).getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => classproHome.update(dateTestReport, null));
  assert.equal(await page.locator('#projection-calendar [aria-pressed="true"]').count(), 0);
  assert.match(await page.locator('#projection-period').innerText(), /Timetable unavailable/);
  await page.evaluate(() => dateAttendance.clear());
  assert.equal(await page.locator('#projection-dialog').isHidden(), true);
  assert.equal(await page.locator('#projection-result').innerText(), '');
  assert.equal(await page.locator('#date-actions button[data-action="leave"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
});
