import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

function fixture() {
  return {
    attendance: { data: [
      { code: 'A', title: 'Algebra', present: 60, conducted: 80 },
      { code: 'B', title: 'Biology', present: 90, conducted: 100 },
    ] },
    marks: { data: [] },
    schedule: { timezone: 'Asia/Kolkata', calendarSource: 'Verified synthetic calendar', entries: [
      { code: 'A', title: 'Algebra', room: 'Synthetic 1', dayOrder: '1', start: '09:00', end: '11:00', hours: 2 },
      { code: 'B', title: 'Biology', room: 'Synthetic 2', dayOrder: '1', start: '12:00', end: '13:00', hours: 1 },
    ], calendar: Array.from({ length: 25 }, (_, index) => ({
      date: `2026-10-${String(index + 1).padStart(2, '0')}`, kind: 'teaching', dayOrder: '1',
    })) },
    profile: { name: 'Synthetic Student', regNo: 'QUIET-PLANNER-TEST' },
    connections: { portal: { connected: true } }, updatedAt: '2026-10-01T06:00:00Z',
    sync: { due: false, nextAt: 1790834400000 + 3600000, syncedAt: 1790834400000 },
  };
}

async function setup(context) {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const session = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Kolkata', serviceWorkers: 'block' });
  const page = await session.newPage();
  page.setDefaultTimeout(5000);
  await page.clock.setFixedTime(new Date('2026-10-01T06:00:00Z'));
  const errors = [], calendarRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/cally.')) calendarRequests.push(request.url()); });
  const report = fixture();
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/session' ? { authenticated: true, authMode: 'http' }
      : path === '/api/reports' ? report : {} });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('#home-view').waitFor({ state: 'visible' });
  await page.evaluate(report => { globalThis.quietReport = report; }, report);
  await page.locator('button[data-page="attendance"]').click();
  await page.locator('#calculate-attendance').click();
  return { page, errors, calendarRequests };
}

const day = (page, value) => page.locator(`#projection-calendar calendar-month button[part~="date-${value}"]`);

test('schedule editor returns to the calculator draft and manual hours survive the round trip', { timeout: 30000 }, async context => {
  const { page, errors } = await setup(context);
  await selectRange(page, '2026-10-10', '2026-10-12');
  await page.locator('#projection-use-schedule').uncheck();
  await page.locator('#projection-manual-hours input[data-course="A"]').fill('3');
  await page.locator('#projection-edit-schedule').click();
  assert.equal(await page.locator('#projection-dialog').isVisible(), false);
  await page.locator('#schedule-choices input').first().uncheck();
  await page.locator('#schedule-calculator-back').click();
  await page.locator('#projection-dialog').waitFor({ state: 'visible' });
  assert.deepEqual(await selectedDates(page), ['10', '11', '12']);
  assert.equal(await page.locator('#projection-use-schedule').isChecked(), false);
  assert.equal(await page.locator('#projection-manual-hours input[data-course="A"]').inputValue(), '3');
  assert.equal(await hours(page), '3h');
  await page.locator('#projection-edit-schedule').click();
  await page.goBack();
  await page.locator('#projection-dialog').waitFor({ state: 'visible' });
  assert.deepEqual(await selectedDates(page), ['10', '11', '12']);
  await page.locator('#projection-use-schedule').check();
  assert.equal(await page.locator('#projection-live-hours [data-course="A"]').count(), 0);
  await page.locator('#projection-use-schedule').uncheck();
  await page.locator('#projection-review-custom').click();
  assert.equal(await page.locator('#attendance-content [data-course="A"] .attendance-recorded-hours').innerText(), '60 / 83h attended');
  assert.match(await page.locator('#attendance-plan-summary').innerText(), /Entered hours/);
  await page.locator('#calculate-attendance').click();
  assert.equal(await page.locator('#projection-manual-hours input[data-course="A"]').inputValue(), '3');
  await page.locator('#projection-manual-hours input[data-course="A"]').fill('0.5');
  assert.equal(await page.locator('#projection-review-custom').isDisabled(), true);
  assert.match(await page.locator('#projection-range-error').innerText(), /whole hours/);
  await page.evaluate(() => dateAttendance.clear());
  await page.locator('#calculate-attendance').click();
  assert.equal(await page.locator('#projection-use-schedule').isChecked(), true);
  assert.deepEqual(errors, []);
});

test('manual calculation works with an unavailable timetable and keeps OD totals fixed', { timeout: 20000 }, async context => {
  const { page, errors } = await setup(context);
  await page.evaluate(() => anonHome.update(quietReport.attendance, null));
  await page.locator('#projection-use-schedule').uncheck();
  await day(page, '2026-10-10').click();
  await page.locator('#projection-manual-hours input[data-course="A"]').fill('2');
  await page.locator('#projection-review-custom').click();
  assert.equal(await page.locator('#attendance-content [data-course="A"] .attendance-recorded-hours').innerText(), '60 / 82h attended');
  await page.locator('#calculate-attendance').click();
  await page.locator('#date-actions [data-action="od"]').click();
  await day(page, '2026-09-30').click();
  await page.locator('#projection-manual-hours input[data-course="A"]').fill('2');
  await page.locator('#projection-review-custom').click();
  assert.equal(await page.locator('#attendance-content [data-course="A"] .attendance-recorded-hours').innerText(), '62 / 80h attended');
  assert.deepEqual(errors, []);
});
const hours = (page, code = 'A') => page.locator(`#projection-live-hours [data-course="${code}"] strong`).innerText();
async function selectRange(page, first = '2026-10-10', last = '2026-10-20') {
  await day(page, first).click(); await day(page, last).click();
}
async function selectedDates(page) {
  return page.locator('calendar-month button[aria-pressed="true"]').evaluateAll(nodes => nodes.map(node => node.textContent));
}
test('Calculate applies recovery hours to attendance after date selection', { timeout: 30000 }, async context => {
  const { page, errors } = await setup(context);
  const baseline = await page.locator('#attendance-content').innerHTML();
  await selectRange(page);
  assert.equal(await page.locator('#attendance-content').innerHTML(), baseline);
  assert.equal(await page.evaluate(() => {
    const button = document.getElementById('projection-review-custom');
    return !!(document.getElementById('projection-date-picker').compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
      && !!(button.compareDocumentPosition(document.getElementById('projection-live-hours')) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), true, 'Calculate follows dates and precedes the hours');
  assert.deepEqual(await selectedDates(page), Array.from({ length: 11 }, (_, i) => String(10 + i)));
  assert.equal(await hours(page), '22h');
  await day(page, '2026-10-21').click();
  assert.equal(await hours(page), '24h');
  await day(page, '2026-10-25').click();
  assert.equal(await hours(page), '26h');
  assert.equal(await day(page, '2026-10-22').getAttribute('aria-pressed'), 'false');
  assert.equal(await day(page, '2026-10-24').getAttribute('aria-pressed'), 'false');
  await day(page, '2026-10-24').click();
  assert.equal(await hours(page), '28h');
  await day(page, '2026-10-15').click();
  assert.equal(await hours(page), '26h');
  for (const [value, left, right] of [['14', false, true], ['16', true, false], ['24', true, false], ['25', false, true]]) {
    const css = await day(page, `2026-10-${value}`).evaluate(node => {
      const s = getComputedStyle(node); return [s.backgroundColor, s.borderLeftWidth, s.borderRightWidth, s.borderTopLeftRadius, s.borderTopRightRadius];
    });
    assert.deepEqual(css, ['rgb(184, 195, 152)', left ? '1px' : '0px', right ? '1px' : '0px', left ? '999px' : '0px', right ? '999px' : '0px']);
  }
  await page.evaluate(() => anonHome.update(quietReport.attendance, quietReport.schedule));
  assert.equal(await day(page, '2026-10-15').getAttribute('aria-pressed'), 'false');
  assert.equal(await day(page, '2026-10-22').getAttribute('aria-pressed'), 'false');
  assert.equal(await hours(page), '26h');
  await day(page, '2026-10-15').click(); assert.equal(await hours(page), '28h');
  await page.locator('#projection-review-custom').click();
  await page.locator('#attendance-panel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#leaves-view').isVisible(), false);
  const projected = page.locator('#attendance-content [data-course="A"]');
  assert.equal(await projected.locator('.attendance-margin-value').textContent(), '−62h');
  assert.equal(await projected.locator('.attendance-percent').innerText(), '63.1%');
  assert.equal(await projected.locator('.attendance-recorded-hours').innerText(), '82 / 130h attended');
  assert.equal(await projected.locator('.attendance-margin-value').evaluate(node => getComputedStyle(node).color), 'rgb(237, 166, 143)');
  assert.match(await page.locator('#attendance-plan-summary').innerText(), /10 Oct.*25 Oct/);
  assert.equal(await page.evaluate(() => quietReport.attendance.data[0].present), 60);
  await page.locator('#calculate-attendance').click();
  assert.equal(await hours(page), '28h');
  await page.locator('#projection-clear').click();
  await selectRange(page, '2026-10-20', '2026-10-10');
  assert.equal(await hours(page), '22h');
  assert.equal(await projected.locator('.attendance-margin-value').textContent(), '−62h', 'draft edits do not change applied results');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset plan', exact: true }).click();
  assert.equal(await projected.locator('.attendance-margin-value').textContent(), '0h');
  assert.equal(await page.locator('#attendance-plan').isVisible(), false);
  await page.locator('#calculate-attendance').click();
  assert.deepEqual(await selectedDates(page), []);
  assert.equal(await page.locator('#projection-live-hours').textContent(), '');
  assert.equal(await page.locator('#projection-review-custom').isDisabled(), true);
  assert.equal(await page.locator('#projection-class-options').evaluate(node => node.open), false);
  assert.deepEqual(errors, []);
});

test('holidays and unconfirmed dates outside the range toggle without fabricated hours', { timeout: 20000 }, async context => {
  const { page, errors } = await setup(context);
  await page.evaluate(() => {
    quietReport.schedule.calendar[24] = { date: '2026-10-25', kind: 'holiday', label: 'Calendar holiday' };
    anonHome.update(quietReport.attendance, quietReport.schedule);
  });
  await selectRange(page);
  await day(page, '2026-10-25').click();
  assert.equal(await day(page, '2026-10-25').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#projection-live-meta').innerText(), /1 holiday/);
  assert.equal(await hours(page), '22h');
  await day(page, '2026-10-26').click();
  assert.match(await page.locator('#projection-live-meta').innerText(), /1 unconfirmed/);
  assert.equal(await hours(page), '22h');
  await page.locator('#projection-review-custom').click();
  assert.equal(await page.locator('#attendance-content [data-course="A"] .attendance-percent').innerText(), '—');
  assert.equal(await page.locator('#attendance-content [data-course="A"] .attendance-margin-value').innerText(), '—');
  assert.deepEqual(errors, []);
});

test('native keyboard, responsive controls, Attend and past OD keep records unchanged', { timeout: 30000 }, async context => {
  const { page, errors } = await setup(context);
  await day(page, '2026-10-10').click();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('calendar-month').shadowRoot.activeElement?.getAttribute('part')?.includes('date-2026-10-11'));
  await page.keyboard.press('PageDown'); await day(page, '2026-11-11').waitFor();
  await page.keyboard.press('PageUp'); await day(page, '2026-10-11').waitFor();
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const sizing = await page.locator('#projection-dialog').evaluate(dialog => {
      const month = document.querySelector('calendar-month');
      const controls = [...dialog.querySelectorAll('button'), ...month.shadowRoot.querySelectorAll('button')].filter(node => node.getClientRects().length);
      return { overflow: dialog.scrollWidth > dialog.clientWidth + 1, small: controls.filter(node => { const b = node.getBoundingClientRect(); return b.width < 43.9 || b.height < 43.9; }).map(node => node.id || node.textContent) };
    });
    assert.equal(sizing.overflow, false, `overflow at ${width}`);
    assert.deepEqual(sizing.small, [], `touch targets at ${width}`);
  }
  await page.locator('#date-actions [data-action="attend"]').click();
  await selectRange(page, '2026-10-10', '2026-10-11');
  assert.equal(await hours(page), '4h');
  await page.locator('#projection-review-custom').click();
  assert.match(await page.locator('#attendance-plan-summary').innerText(), /After planned attendance/);
  assert.equal(await page.locator('#attendance-content [data-course="A"] .attendance-margin-value').textContent(), '7h');
  assert.equal(await page.locator('#attendance-content [data-course="A"] .attendance-recorded-hours').innerText(), '82 / 102h attended');
  await page.locator('#calculate-attendance').click();
  await page.evaluate(() => {
    quietReport.schedule.calendar.push({ date: '2026-09-30', kind: 'teaching', dayOrder: '1' });
    anonHome.update(quietReport.attendance, quietReport.schedule);
  });
  await page.locator('#date-actions [data-action="od"]').click();
  await day(page, '2026-09-30').click();
  assert.equal(await hours(page), '2h');
  await page.locator('#projection-review-custom').click();
  assert.match(await page.locator('#attendance-plan-summary').innerText(), /After OD correction/);
  assert.equal(await page.locator('#attendance-content [data-course="A"] .attendance-percent').innerText(), '77.5%');
  assert.equal(await page.locator('#attendance-content [data-course="A"] .attendance-margin-value').textContent(), '2h');
  await page.locator('#calculate-attendance').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await day(page, '2026-09-30').click(); await page.keyboard.press('PageUp');
  await day(page, '2026-08-30').waitFor();
  assert.equal(await page.locator('calendar-month').evaluate(node => node.getAnimations().length), 0);
  assert.deepEqual(errors, []);
});

test('refresh and rollover preserve class overrides, removed dates, and sign-out clears projections', { timeout: 20000 }, async context => {
  const { page, errors } = await setup(context);
  await selectRange(page, '2026-10-15', '2026-10-25');
  await day(page, '2026-10-20').click();
  await page.locator('#projection-class-options > summary').click();
  await page.getByRole('button', { name: 'Edit classes for Oct 18', exact: true }).click();
  await page.locator('#day-class-0').selectOption('partial');
  await page.locator('#day-hours-0').selectOption('1');
  await page.getByRole('button', { name: '← Dates', exact: true }).click();
  assert.equal(await hours(page), '19h');
  await page.locator('#projection-review-custom').click();
  await page.clock.setFixedTime(new Date('2026-10-17T06:00:00Z'));
  await page.evaluate(() => {
    dateAttendance.clock(new Date(2026, 9, 17));
    anonHome.update(quietReport.attendance, quietReport.schedule);
  });
  assert.equal(await page.locator('#attendance-content [data-course="A"] .attendance-margin-value').textContent(), '−42h');
  await page.locator('#calculate-attendance').click();
  assert.equal(await day(page, '2026-10-20').getAttribute('aria-pressed'), 'false');
  await page.getByRole('button', { name: 'Edit classes for Oct 18', exact: true }).click();
  assert.equal(await page.locator('#day-class-0').inputValue(), 'partial');
  assert.equal(await page.locator('#day-hours-0').inputValue(), '1');
  await page.evaluate(() => dateAttendance.clear());
  assert.equal(await page.locator('#projection-dialog').isHidden(), true);
  assert.equal(await page.locator('#leaves-rows').textContent(), '');
  assert.equal(await page.locator('#attendance-plan').isVisible(), false);
  assert.deepEqual(errors, []);
});
