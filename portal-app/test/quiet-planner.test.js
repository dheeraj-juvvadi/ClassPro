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

const row = (page, code = 'A') => page.locator(`details.date-projection-course[data-course="${code}"]`);
const day = (page, date) => page.locator(`#projection-calendar calendar-month button[part~="date-${date}"]`);
async function checkpoints(page, code = 'A') {
  return row(page, code).locator('.date-result-checkpoints > div').evaluateAll(nodes => nodes.map(node => ({
    label: node.querySelector('dt').textContent,
    value: node.querySelector('dd').firstChild.textContent,
  })));
}
async function range(page, start = '2026-10-15', end = '2026-10-25') {
  await page.locator('#projection-from').fill(start);
  await page.locator('#projection-through').fill(end);
  await page.locator('#projection-apply').focus();
  await page.keyboard.press('Enter');
  await page.locator('#projection-outlook').waitFor({ state: 'visible' });
}
async function assertFits(page, step) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.locator('#projection-dialog').evaluate(dialog => {
      const bounds = dialog.getBoundingClientRect();
      const visible = [...dialog.querySelectorAll('input, select, button, summary, .date-result-checkpoints')].filter(node => node.getClientRects().length);
      return { left: bounds.left, right: bounds.right, bottom: bounds.bottom,
        overflow: dialog.scrollWidth > dialog.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth,
        clipped: visible.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.id || node.className) };
    });
    assert.ok(layout.left >= 0 && layout.right <= width && layout.bottom <= 844, `${step} bounds at ${width}: ${JSON.stringify(layout)}`);
    assert.equal(layout.overflow, false, `${step} overflow at ${width}`);
    assert.deepEqual(layout.clipped, [], `${step} clipped controls at ${width}`);
    const next = page.locator(step === 'expanded results' ? '#projection-done'
      : step === 'customization' ? '#projection-review-custom' : '#projection-apply');
    await next.scrollIntoViewIfNeeded();
    const actionBounds = await next.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
    });
    assert.ok(actionBounds.top >= -1 && actionBounds.bottom <= 845 && actionBounds.left >= -1 && actionBounds.right <= width + 1,
      `${step} primary action at ${width}: ${JSON.stringify(actionBounds)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test('quiet range shows sparse results and verified checkpoints, preserving expanded focus on refresh', { timeout: 35000 }, async context => {
  const { page, errors, calendarRequests } = await setup(context);
  assert.equal(await page.locator('#projection-range-form').isVisible(), true);
  assert.equal(await page.locator('#projection-from').getAttribute('type'), 'date');
  assert.equal(await page.locator('#projection-through').getAttribute('type'), 'date');
  assert.equal(await page.locator('#projection-customize').evaluate(node => node.open), false);
  assert.equal(await page.locator('#projection-outlook').isHidden(), true);
  assert.equal(calendarRequests.length, 0, 'initial planner must not load the advanced calendar');
  await assertFits(page, 'dates');
  assert.equal(await page.getByLabel('From', { exact: true }).getAttribute('min'), '2026-10-01');
  await page.getByLabel('From', { exact: true }).fill('2026-10-15');
  await page.getByLabel('Through', { exact: true }).fill('2026-10-14');
  assert.equal(await page.locator('#projection-range-form').evaluate(form => form.checkValidity()), false);
  await page.locator('#projection-apply').click();
  assert.equal(await page.locator('#projection-outlook').isHidden(), true, 'native validity prevents a reversed range');
  await page.locator('#projection-through').fill('2026-10-25');
  assert.match(await page.locator('#projection-assumption').innerText(), /14 October/);
  await range(page);
  assert.equal(await page.locator('#projection-title').evaluate(node => node === document.activeElement), true);
  assert.equal(await page.locator('#projection-range-form').isVisible(), false);
  assert.equal(calendarRequests.length, 0, 'normal date planning does not need the advanced calendar');
  assert.equal(await page.locator('.date-projection-course').count(), 2);
  assert.equal(await row(page).evaluate(node => node.open), false);
  assert.equal(await row(page).locator('.date-result-breakdown').isVisible(), false);
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '67.7%');
  assert.equal(await row(page, 'B').locator('.date-result-percentage').textContent(), '83.2%');
  await row(page, 'B').locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await checkpoints(page, 'B'), [
    { label: 'Today', value: '90.0%' },
    { label: '14 Oct · Before leave', value: '91.2%' },
    { label: '25 Oct · After leave', value: '83.2%' },
  ]);
  await page.keyboard.press('Space');
  assert.equal(await row(page, 'B').evaluate(node => node.open), false);
  assert.equal(await page.locator('.date-result-track, .date-result-margin, .date-result-badge').count(), 0);
  await row(page).locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await row(page).evaluate(node => node.open), true);
  assert.deepEqual(await checkpoints(page), [
    { label: 'Today', value: '75.0%' },
    { label: '14 Oct · Before leave', value: '81.5%' },
    { label: '25 Oct · After leave', value: '67.7%' },
  ]);
  assert.match(await row(page).locator('.date-result-impact').innerText(), /28 h attended before/);
  assert.match(await row(page).locator('.date-result-impact').innerText(), /22 h missed during 15 Oct–25 Oct/);
  assert.match(await row(page).locator('.date-result-risk').innerText(), /75% minimum/);
  await assertFits(page, 'expanded results');
  await row(page).locator('summary').focus();
  await page.evaluate(() => {
    quietReport.attendance.data[0] = { ...quietReport.attendance.data[0], present: 62, conducted: 82 };
    anonHome.update(quietReport.attendance, quietReport.schedule);
  });
  assert.equal(await row(page).evaluate(node => node.open), true);
  assert.equal(await row(page).locator('summary').evaluate(node => node === document.activeElement), true);
  assert.equal(await row(page, 'B').evaluate(node => node.open), false);
  assert.deepEqual(await checkpoints(page), [
    { label: 'Today', value: '75.6%' },
    { label: '14 Oct · Before leave', value: '81.8%' },
    { label: '25 Oct · After leave', value: '68.2%' },
  ]);
  await page.keyboard.press('Space');
  assert.equal(await row(page).evaluate(node => node.open), false);
  await page.locator('#projection-change').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#projection-from').inputValue(), '2026-10-15');
  assert.equal(await page.locator('#projection-through').inputValue(), '2026-10-25');
  assert.equal(await page.locator('#projection-outlook').isHidden(), true);
  await page.locator('#projection-customize > summary').focus();
  await page.keyboard.press('Enter');
  await day(page, '2026-10-15').waitFor({ state: 'visible' });
  assert.equal(calendarRequests.length, 1, 'opening customization loads the calendar exactly once');
  await day(page, '2026-10-15').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('#projection-calendar calendar-month').shadowRoot.activeElement?.part.contains('date-2026-10-16'));
  assert.equal(await day(page, '2026-10-16').evaluate(node => node === node.getRootNode().activeElement), true);
  await assertFits(page, 'customization');
  await page.locator('#projection-review-custom').click();
  await page.locator('#projection-done').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#projection-dialog').isHidden(), true);
  assert.equal(await page.locator('#calculate-attendance').evaluate(node => node === document.activeElement), true);
  assert.deepEqual(errors, []);
});

test('unchanged range keeps removed days and class overrides; a new range clears stale edits', { timeout: 30000 }, async context => {
  const { page, errors } = await setup(context);
  await range(page);
  await page.locator('#projection-change').click();
  await page.locator('#projection-customize > summary').click();
  await day(page, '2026-10-17').click();
  await page.locator('#projection-selections button[aria-label="Remove Oct 25"]').click();
  assert.equal(await page.locator('#projection-count').textContent(), '9');
  assert.equal(await day(page, '2026-10-17').getAttribute('aria-pressed'), 'false');
  assert.equal(await day(page, '2026-10-25').getAttribute('aria-pressed'), 'false');
  await page.locator('#projection-selections button[aria-label="Edit classes for Oct 15"]').click();
  await page.locator('#day-class-0').selectOption('partial');
  await page.locator('#day-hours-0').selectOption('1');
  await page.getByRole('button', { name: '← Dates', exact: true }).click();
  await page.locator('#projection-review-custom').click();
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '71.5%');
  await page.locator('#projection-change').click();
  assert.equal(await page.locator('#projection-from').inputValue(), '2026-10-15');
  assert.equal(await page.locator('#projection-through').inputValue(), '2026-10-25', 'removing the final day does not silently shorten the requested range');
  await range(page);
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '71.5%');
  await page.locator('#projection-change').click();
  assert.equal(await page.locator('#projection-count').textContent(), '9');
  assert.equal(await day(page, '2026-10-17').getAttribute('aria-pressed'), 'false');
  assert.equal(await day(page, '2026-10-25').getAttribute('aria-pressed'), 'false');
  await page.locator('#projection-selections button[aria-label="Edit classes for Oct 15"]').click();
  assert.equal(await page.locator('#day-class-0').inputValue(), 'partial');
  assert.equal(await page.locator('#day-hours-0').inputValue(), '1');
  await page.getByRole('button', { name: '← Dates', exact: true }).click();
  await range(page, '2026-10-15', '2026-10-16');
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '78.6%');
  await page.locator('#projection-change').click();
  assert.equal(await page.locator('#projection-count').textContent(), '2');
  assert.deepEqual(await page.locator('#projection-selections button[aria-label^="Edit classes"]').evaluateAll(nodes => nodes.map(node => node.dataset.date)), ['2026-10-15', '2026-10-16']);
  await page.locator('#projection-selections button[aria-label="Edit classes for Oct 15"]').click();
  assert.equal(await page.locator('#day-class-0').inputValue(), 'leave', 'a new range clears class overrides even on retained days');
  assert.equal(await page.locator('.day-class-select input:checked').count(), 2);
  await page.locator('#close-projection').click();
  assert.deepEqual(errors, []);
});

test('native Attend range uses attended hours and mode-aware checkpoints without loading the calendar', { timeout: 20000 }, async context => {
  const { page, errors, calendarRequests } = await setup(context);
  await page.locator('#projection-mode').selectOption('attend');
  assert.equal(await page.locator('#projection-from').getAttribute('min'), '2026-10-01');
  await range(page);
  assert.equal(calendarRequests.length, 0);
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '84.6%');
  assert.equal(await row(page, 'B').locator('.date-result-percentage').textContent(), '92.0%');
  await row(page).locator('summary').click();
  assert.deepEqual(await checkpoints(page), [
    { label: 'Today', value: '75.0%' },
    { label: '14 Oct · Before attending', value: '81.5%' },
    { label: '25 Oct · After attending', value: '84.6%' },
  ]);
  assert.match(await row(page).locator('.date-result-impact').innerText(), /22 h attended during 15 Oct–25 Oct/);
  assert.match(await row(page).locator('.date-result-impact').innerText(), /0 h missed/);
  await page.locator('#projection-change').click();
  assert.equal(await page.locator('#projection-mode').inputValue(), 'attend');
  assert.equal(await page.locator('#projection-through').inputValue(), '2026-10-25');
  await page.locator('#projection-apply').click();
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '84.6%');
  assert.deepEqual(errors, []);
});

test('native OD accepts only past dates and corrects recorded absences without future attendance', { timeout: 20000 }, async context => {
  const { page, errors, calendarRequests } = await setup(context);
  await page.clock.setFixedTime(new Date('2026-10-10T06:00:00Z'));
  await page.evaluate(() => dateAttendance.clock(new Date(2026, 9, 10)));
  await page.locator('#projection-mode').selectOption('od');
  for (const id of ['projection-from', 'projection-through']) {
    assert.equal(await page.locator(`#${id}`).getAttribute('max'), '2026-10-09');
  }
  await page.locator('#projection-from').fill('2026-10-09');
  await page.locator('#projection-through').fill('2026-10-10');
  assert.equal(await page.locator('#projection-range-form').evaluate(form => form.checkValidity()), false);
  await page.locator('#projection-apply').click();
  assert.equal(await page.locator('#projection-outlook').isHidden(), true, 'OD cannot include today');
  await range(page, '2026-10-01', '2026-10-03');
  assert.equal(calendarRequests.length, 0);
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '82.5%');
  assert.equal(await row(page, 'B').locator('.date-result-percentage').textContent(), '93.0%');
  await row(page).locator('summary').click();
  assert.deepEqual(await checkpoints(page), [
    { label: 'Recorded', value: '75.0%' },
    { label: 'After OD correction', value: '82.5%' },
  ]);
  assert.match(await row(page).locator('.date-result-impact').innerText(), /6 h of OD corrections requested; capped at recorded absences/);
  await page.locator('#projection-change').click();
  assert.equal(await page.locator('#projection-mode').inputValue(), 'od');
  await page.locator('#projection-customize > summary').click();
  assert.equal(await page.locator('#date-actions button[data-action="od"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await day(page, '2026-10-10').isDisabled(), true);
  assert.equal(await day(page, '2026-10-09').isDisabled(), false);
  assert.equal(await day(page, '2026-10-03').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
});

test('switching a submitted OD plan to Attend or Leave clears historical bounds before customization', { timeout: 25000 }, async context => {
  const { page, errors } = await setup(context);
  await page.clock.setFixedTime(new Date('2026-10-10T06:00:00Z'));
  await page.evaluate(() => dateAttendance.clock(new Date(2026, 9, 10)));
  for (const [mode, percentage] of [['attend', '76.2%'], ['leave', '71.4%']]) {
    await page.locator('#projection-mode').selectOption('od');
    await range(page, '2026-10-01', '2026-10-03');
    assert.equal(await row(page).locator('.date-result-percentage').textContent(), '82.5%');
    await page.locator('#projection-change').click();
    await page.locator('#projection-mode').selectOption(mode);
    assert.equal(await page.locator('#projection-count').textContent(), '0', `${mode} clears the old OD selections`);
    for (const id of ['projection-from', 'projection-through']) {
      assert.equal(await page.locator(`#${id}`).inputValue(), '2026-10-10');
      assert.equal(await page.locator(`#${id}`).getAttribute('max'), '');
    }
    if (!await page.locator('#projection-customize').evaluate(node => node.open)) {
      await page.locator('#projection-customize > summary').click();
    }
    assert.equal(await day(page, '2026-10-03').isDisabled(), true);
    assert.equal(await day(page, '2026-10-03').getAttribute('aria-pressed'), 'false');
    assert.equal(await day(page, '2026-10-10').isDisabled(), false, `${mode} permits today before native resubmit`);
    assert.equal(await day(page, '2026-10-11').isDisabled(), false, `${mode} permits future dates before native resubmit`);
    await day(page, '2026-10-10').click();
    await day(page, '2026-10-11').click();
    assert.deepEqual(await page.locator('#projection-selections button[aria-label^="Edit classes"]').evaluateAll(nodes => nodes.map(node => node.dataset.date)), ['2026-10-10', '2026-10-11']);
    await page.locator('#projection-review-custom').click();
    assert.equal(await row(page).locator('.date-result-percentage').textContent(), percentage);
    await row(page).locator('summary').click();
    assert.doesNotMatch(await row(page).locator('.date-result-impact').innerText(), /OD corrections/);
    await page.locator('#projection-change').click();
  }
  assert.deepEqual(errors, []);
});

test('an ongoing range resubmits after rollover without restoring removed dates or losing class edits', { timeout: 25000 }, async context => {
  const { page, errors } = await setup(context);
  await range(page);
  await page.locator('#projection-change').click();
  await page.locator('#projection-customize > summary').click();
  await page.locator('#projection-selections button[aria-label="Remove Oct 20"]').click();
  await page.locator('#projection-selections button[aria-label="Edit classes for Oct 18"]').click();
  await page.locator('#day-class-0').selectOption('partial');
  await page.locator('#day-hours-0').selectOption('1');
  await page.getByRole('button', { name: '← Dates', exact: true }).click();
  await page.locator('#projection-review-custom').click();
  await page.clock.setFixedTime(new Date('2026-10-17T06:00:00Z'));
  await page.evaluate(() => dateAttendance.clock(new Date(2026, 9, 17)));
  assert.equal(await page.locator('#projection-outlook').isVisible(), true);
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '64.3%');
  await row(page).locator('summary').click();
  assert.deepEqual((await checkpoints(page)).map(point => point.value), ['75.0%', '—', '64.3%']);
  assert.match(await row(page).locator('.date-result-unavailable').innerText(), /already started/);
  await page.locator('#projection-change').click();
  assert.equal(await page.locator('#projection-through').inputValue(), '2026-10-25');
  assert.equal(await page.locator('#projection-range-form').evaluate(form => form.checkValidity()), true, 'an ongoing plan remains resubmittable');
  await page.locator('#projection-apply').click();
  assert.equal(await page.locator('#projection-outlook').isVisible(), true);
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '64.3%');
  await page.locator('#projection-change').click();
  assert.equal(await day(page, '2026-10-20').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#projection-count').textContent(), '8');
  await page.locator('#projection-selections button[aria-label="Edit classes for Oct 18"]').click();
  assert.equal(await page.locator('#day-class-0').inputValue(), 'partial');
  assert.equal(await page.locator('#day-hours-0').inputValue(), '1');
  assert.deepEqual(errors, []);
});

test('a report refresh expires a completed future plan instead of retaining stale results', { timeout: 20000 }, async context => {
  const { page, errors } = await setup(context);
  await range(page);
  await page.clock.setFixedTime(new Date('2026-10-26T06:00:00Z'));
  await page.evaluate(() => {
    quietReport.attendance.data[0] = { ...quietReport.attendance.data[0], present: 62, conducted: 82 };
    anonHome.update(quietReport.attendance, quietReport.schedule);
  });
  assert.equal(await page.locator('#projection-range-form').isVisible(), true);
  assert.equal(await page.locator('#projection-outlook').isHidden(), true);
  assert.equal(await page.locator('#projection-from').inputValue(), '2026-10-26');
  assert.equal(await page.locator('#projection-through').inputValue(), '2026-10-26');
  assert.equal(await page.locator('#projection-count').textContent(), '0');
  assert.equal(await page.locator('#projection-range-form').evaluate(form => form.checkValidity()), true);
  assert.deepEqual(errors, []);
});

test('an unknown range end suppresses complete percentages without losing the verified before checkpoint', { timeout: 20000 }, async context => {
  const { page, errors } = await setup(context);
  await page.evaluate(() => {
    quietReport.schedule.calendar = quietReport.schedule.calendar.filter(day => day.date !== '2026-10-25');
    anonHome.update(quietReport.attendance, quietReport.schedule);
  });
  await range(page);
  assert.match(await page.locator('#projection-summary').innerText(), /dates are unavailable.*Incomplete estimates/);
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '—');
  assert.equal(await row(page, 'B').locator('.date-result-percentage').textContent(), '—');
  assert.equal(await row(page).getAttribute('data-tone'), 'unknown');
  await row(page).locator('summary').click();
  assert.deepEqual(await checkpoints(page), [
    { label: 'Today', value: '75.0%' },
    { label: '14 Oct · Before leave', value: '81.5%' },
    { label: '25 Oct · After leave', value: '—' },
  ]);
  assert.match(await row(page).locator('.date-result-impact').innerText(), /28 h attended before/);
  assert.match(await row(page).locator('.date-result-unavailable').innerText(), /Missing dates are not counted/);
  assert.equal(await row(page).locator('.date-result-risk').count(), 0, 'an incomplete projection is not classified as known risk');
  await page.locator('#projection-change').click();
  assert.equal(await page.locator('#projection-through').inputValue(), '2026-10-25');
  await page.locator('#projection-customize > summary').click();
  assert.equal(await day(page, '2026-10-25').isDisabled(), true);
  assert.equal(await day(page, '2026-10-24').getAttribute('aria-pressed'), 'true');
  await page.locator('#projection-review-custom').click();
  assert.equal(await row(page).locator('.date-result-percentage').textContent(), '—');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#projection-dialog').isHidden(), true);
  assert.deepEqual(errors, []);
});
