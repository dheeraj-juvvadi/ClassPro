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

test('calendar plans preserve edits through refresh, holidays, rollover and sign-out', { timeout: 30000 }, async context => {
  const app = express(); app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(4000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.goto(`http://127.0.0.1:${server.address().port}/?preview=home#attendance`);
  assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.includes('/cally.'))), false);
  await page.evaluate(() => {
    globalThis.dateTestReport = { data: [{ code: 'DS', title: 'Data Structures', present: 18, conducted: 22 }] };
    globalThis.dateTestSchedule = { timezone: 'Asia/Kolkata', entries: [
      { code: 'DS', title: 'Data Structures', room: 'Lab', dayOrder: '1', start: '10:30', end: '12:30', hours: 2 },
    ], calendar: [13,14,15,16,17,18].map(day => ({ date: `2026-09-${day}`, kind: 'teaching', dayOrder: '1' })) };
    anonHome.update(dateTestReport, dateTestSchedule);
  });
  const day = number => page.locator(`#projection-calendar calendar-month button[part~="date-2026-09-${number}"]`);
  await page.locator('#calculate-attendance').click();
  await day(14).waitFor(); await day(14).click(); await day(15).click();
  assert.match(await page.locator('#projection-live-hours').innerText(), /4h/);
  const projection = async value => {
    await page.locator('#projection-review-custom').click();
    await page.locator('#attendance-panel').waitFor();
    assert.equal(await page.locator('#attendance-content .attendance-percent').innerText(), value);
    await page.locator('#calculate-attendance').click();
  };
  await projection('69.2%');
  await day(15).focus();
  await page.evaluate(() => {
    dateTestReport.data[0].present = 20; dateTestReport.data[0].conducted = 24;
    anonHome.update(dateTestReport, dateTestSchedule);
  });
  assert.equal(await day(14).getAttribute('aria-pressed'), 'true');
  assert.equal(await day(15).getAttribute('aria-pressed'), 'true');
  await projection('71.4%');
  await page.evaluate(() => {
    dateTestSchedule.calendar[1] = { date: '2026-09-14', kind: 'holiday' };
    anonHome.update(dateTestReport, dateTestSchedule);
  });
  assert.equal(await day(14).isDisabled(), false);
  assert.equal(await day(14).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#projection-live-meta').innerText(), /1 holiday/);
  assert.match(await page.locator('#projection-live-hours').innerText(), /2h/);
  await projection('76.9%');
  await page.evaluate(() => dateAttendance.clock(new Date(2026,8,16)));
  assert.equal(await page.locator('#projection-count').textContent(), '0');
  await page.locator('#date-actions [data-action="od"]').click();
  await day(13).click(); await projection('91.7%');
  await page.locator('#date-actions [data-action="leave"]').click();
  await day(16).click(); await day(18).click(); await day(17).click();
  await page.evaluate(() => dateAttendance.update(dateTestReport.data, dateTestSchedule, new Date(2026,8,16), {}));
  assert.equal(await day(17).getAttribute('aria-pressed'), 'false');
  await page.locator('#projection-class-options summary').click();
  await page.locator('#projection-selections button[aria-label="Edit classes for Sep 16"]').click();
  await page.locator('#day-class-0').selectOption('partial');
  await page.locator('#day-hours-0').selectOption('1');
  await page.getByRole('button', { name: '← Dates', exact: true }).click();
  assert.match(await page.locator('#projection-live-hours').innerText(), /3h/);
  await page.evaluate(() => dateAttendance.update(dateTestReport.data, null, new Date(2026,8,16), {}));
  assert.match(await page.locator('#projection-live-meta').innerText(), /unconfirmed/);
  await page.locator('#projection-review-custom').click();
  assert.equal(await page.locator('#attendance-content .attendance-percent').innerText(), '—');
  await page.evaluate(() => showLogin());
  assert.equal(await page.locator('#attendance-panel').isVisible(), false);
  assert.equal(await page.locator('#attendance-content').innerText(), '');
  assert.deepEqual(errors, []);
});
test('past OD corrects absences without adding conducted hours', () => {
  const result = dateProjection.calculate(courses, source, { '2026-09-13': 'od' }, today);
  assert.equal(result.courses[0].prediction.percentage, 90.91);
  assert.equal(result.courses[0].prediction.conducted, 22);
});
test('holidays and unknown dates never manufacture attendance hours', () => {
  const result = dateProjection.calculate(courses, { ...source, calendar: [{ date: '2026-09-15', kind: 'holiday' }] }, { '2026-09-15': 'leave' }, today);
  assert.deepEqual(result.unknown, []);
  assert.deepEqual(result.courses[0].impact, { attend: 0, miss: 0, od: 0 });
});

test('individual classes and partial hours preserve counted totals', () => {
  const morning = source.entries[0];
  const afternoon = { ...morning, start: '13:00', end: '15:00' };
  const timetable = { ...source, entries: [morning, afternoon] };
  const plan = { action: 'attend', classes: { [dateProjection.entryKey(afternoon)]: { mode: 'leave' } } };
  let result = dateProjection.calculate(courses, timetable, { '2026-09-14': plan }, today);
  assert.deepEqual(result.courses[0].impact, { attend: 2, miss: 2, od: 0 });
  plan.classes[dateProjection.entryKey(morning)] = { mode: 'partial', hours: 1 };
  result = dateProjection.calculate(courses, timetable, { '2026-09-14': plan }, today);
  assert.deepEqual(result.courses[0].impact, { attend: 1, miss: 3, od: 0 });
  assert.equal(result.courses[0].prediction.conducted, 26);
  plan.classes[dateProjection.entryKey(afternoon)] = { mode: 'od', hours: 1 };
  result = dateProjection.calculate(courses, timetable, { '2026-09-13': plan }, today);
  assert.deepEqual(result.courses[0].impact, { attend: 0, miss: 0, od: 1 });
  assert.equal(result.courses[0].prediction.conducted, 22);
});
