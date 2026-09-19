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

test('open date plans reconcile refreshed records, rollover and sign-out', { timeout: 25000 }, async context => {
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
  assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.includes('/cally.'))), false, 'calendar is loaded on demand');
  await page.evaluate(() => {
    globalThis.dateTestReport = { data: [{ code: 'DS', title: 'Data Structures', present: 18, conducted: 22 }] };
    globalThis.dateTestSchedule = { timezone: 'Asia/Kolkata',
      entries: [{ code: 'DS', title: 'Data Structures', room: 'Lab', dayOrder: '1', start: '10:30', end: '12:30', hours: 2 }],
      calendar: [13, 14, 15, 16].map(day => ({ date: `2026-09-${day}`, kind: 'teaching', dayOrder: '1' })) };
    classproHome.update(dateTestReport, dateTestSchedule);
  });
  await page.locator('button[data-page="attendance"]').click();
  await page.locator('#calculate-attendance').click();
  const day = value => page.locator(`#projection-calendar calendar-month button[part~="date-2026-09-${value}"]`);
  const focusDate = () => page.locator('#projection-calendar calendar-month').evaluate(el => el.shadowRoot.activeElement?.getAttribute('part'));
  await day(14).waitFor({ state: 'visible' });
  await day(14).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('calendar-month').shadowRoot.activeElement?.part.contains('date-2026-09-15'));
  await page.keyboard.press('Enter');
  assert.equal(await day(15).getAttribute('aria-pressed'), 'true');
  await page.locator('#projection-selections button[aria-label="Remove Sep 15"]').click();
  assert.equal(await page.locator('#projection-count').textContent(), '0');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await page.evaluate(() => {
      const dialog = document.querySelector('#projection-dialog');
      const rect = dialog.getBoundingClientRect();
      const footer = document.querySelector('.date-planner-footer').getBoundingClientRect();
      const month = document.querySelector('calendar-month');
      return { left: rect.left, right: rect.right, bottom: rect.bottom, overflow: dialog.scrollWidth > dialog.clientWidth,
        doneVisible: footer.bottom <= innerHeight && footer.top >= 0, monthOverflow: month.scrollWidth > month.clientWidth };
    });
    assert.ok(geometry.left >= 0 && geometry.right <= width && geometry.bottom <= 844 && geometry.doneVisible && !geometry.overflow && !geometry.monthOverflow, JSON.stringify({width, ...geometry}));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('#projection-dialog').evaluate(el => getComputedStyle(el).animationName), 'none');
  await day(14).click();
  await day(15).click();
  assert.match(await page.locator('#projection-result').innerText(), /69.23%/);
  await page.evaluate(() => {
    dateTestReport.data[0] = { ...dateTestReport.data[0], present: 20, conducted: 24 };
    classproHome.update(dateTestReport, dateTestSchedule);
  });
  assert.match(await focusDate(), /date-2026-09-15/);
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
  assert.match(await focusDate(), /date-2026-09-14/);
  assert.match(await page.locator('#projection-result').innerText(), /76.92%/);
  assert.match(await page.locator('#projection-period').innerText(), /cleared 1 unavailable date/);
  await page.locator('#date-actions button[data-action="od"]').click();
  await day(13).click();
  await page.evaluate(() => dateAttendance.clock(new Date(2026, 8, 16)));
  assert.equal(await day(15).getAttribute('aria-pressed'), 'false');
  assert.equal(await day(13).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#projection-result').innerText(), /91.67%/);
  await page.locator('#projection-done').click();
  assert.equal(await page.locator('#projection-dialog').isHidden(), true);
  assert.equal(await page.locator('#calculate-attendance').evaluate(el => el === document.activeElement), true);
  await page.evaluate(() => dateAttendance.open('DS', new Date(2026, 8, 16)));
  assert.equal(await page.locator('#date-actions button[data-action="leave"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await day(16).getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => classproHome.update(dateTestReport, null));
  await page.waitForFunction(() => !document.querySelector('calendar-month').shadowRoot.querySelector('[aria-pressed="true"]'));
  assert.equal(await page.locator('#projection-calendar calendar-month [aria-pressed="true"]').count(), 0);
  assert.match(await page.locator('#projection-period').innerText(), /Timetable unavailable/);
  await page.evaluate(() => dateAttendance.clear());
  assert.equal(await page.locator('#projection-dialog').isHidden(), true);
  assert.equal(await page.locator('#projection-result').innerText(), '');
  assert.equal(await page.locator('#date-actions button[data-action="leave"]').getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => {
    dateTestSchedule.calendar = [14, 15, 16, 17, 18].map(day => ({ date: `2026-09-${day}`, kind: 'teaching', dayOrder: '1' }));
    dateTestSchedule.entries.push({ ...dateTestSchedule.entries[0], start: '13:30', end: '15:30' });
    classproHome.update(dateTestReport, dateTestSchedule);
  });
  await page.locator('#calculate-attendance').click();
  await day(15).click();
  assert.match(await page.locator('#projection-action-hint').innerText(), /end date/);
  await day(18).click();
  assert.equal(await page.locator('#projection-count').textContent(), '4');
  for (const n of [15, 16, 17, 18]) assert.equal(await day(n).getAttribute('aria-pressed'), 'true');
  await page.locator('#projection-selections button[aria-label="Edit classes for Sep 15"]').click();
  assert.equal(await page.locator('.day-class-select input:checked').count(), 2);
  await page.locator('.day-class-select input').first().uncheck();
  assert.equal(await page.locator('#day-class-0').inputValue(), 'attend');
  await page.locator('#day-class-1').selectOption('partial');
  await page.locator('#day-hours-1').selectOption('1');
  assert.equal(await page.locator('input[type="time"]').count(), 0);
  await page.getByRole('button', { name: '← Dates', exact: true }).click();
  await day(18).click(); await day(15).click();
  assert.equal(await page.locator('#projection-count').textContent(), '4');
  await page.locator('#projection-selections button[aria-label="Edit classes for Sep 15"]').click();
  assert.equal(await page.locator('#day-class-0').inputValue(), 'attend');
  assert.equal(await page.locator('#day-hours-1').inputValue(), '1');
  await page.evaluate(() => {
    dateTestSchedule.calendar[2] = { date: '2026-09-16', kind: 'holiday' };
    classproHome.update(dateTestReport, dateTestSchedule);
  });
  await page.getByRole('button', { name: '← Dates', exact: true }).click();
  assert.equal(await page.locator('#projection-count').textContent(), '3');
  assert.equal(await day(16).isDisabled(), true);
  await page.locator('#projection-clear').click();
  await day(15).click(); await day(18).click();
  assert.equal(await page.locator('#projection-count').textContent(), '3');
  await page.locator('#projection-done').click();
  assert.deepEqual(errors, []);
});
