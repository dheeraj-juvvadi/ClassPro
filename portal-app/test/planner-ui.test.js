import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('academic UI handles reported timetables, calendar gaps and static sign-in', { timeout: 30000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ json: { authenticated: false } }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  await page.locator('#login-view').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#sign-in canvas').count(), 0);
  assert.equal(await page.locator('script[src*="sign-in-particles"]').count(), 0);
  assert.equal(await page.locator('#manual-captcha-answer').isVisible(), true);
  assert.equal(await page.locator('#sign-in').evaluate(element => getComputedStyle(element).minHeight), '58px');
  await page.evaluate(() => classproAuth.configure({ authMode: 'http', provider: 'academia' }));
  assert.equal(await page.locator('#provider-choice').isVisible(), false);
  assert.equal(await page.locator('#login-provider').inputValue(), 'academia');
  await page.evaluate(() => classproAuth.usePortal());
  assert.equal(await page.locator('#login-provider').inputValue(), 'portal');
  await page.evaluate(() => classproAuth.configure({ authMode: 'http', provider: 'portal' }));
  assert.equal(await page.locator('#login-provider').inputValue(), 'academia');
  await page.route('**/api/challenge', route => route.fulfill({ json: { required: false } }));
  await page.route('**/api/login/client', route => route.fulfill({ status: 502, json: { error: { code: 'LOGIN_REJECTED', message: 'Academia could not respond.' } } }));
  await page.locator('#account').fill('synthetic');
  await page.locator('#password').fill('test-password');
  await page.locator('#sign-in').click();
  await page.locator('#login-fallback-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#password').inputValue(), '');
  await page.locator('#use-student-portal').click();
  assert.equal(await page.locator('#login-provider').inputValue(), 'portal');
  assert.equal(await page.locator('#account').inputValue(), 'synthetic');
  await page.goto(`${origin}/?preview=home`);
  await page.locator('#home-view').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#planner-nav button').count(), 3);
  assert.match(await page.locator('#schedule-source').innerText(), /Day order 1/);
  assert.equal(await page.locator('.calendar-week button').count(), 7);
  assert.match(await page.locator('#next-class-card').innerText(), /Margin: 2h/);
  assert.match(await page.locator('#next-class-card').innerText(), /81.8%/);
  assert.equal(await page.locator('#schedule-form').count(), 0);
  await page.evaluate(() => providerConnections.update({ connections: { portal: { connected: true } } }));
  assert.equal(await page.getByRole('button', { name: 'Connect Student Portal', exact: true }).count(), 0);
  assert.match(await page.locator('#provider-connections').textContent(), /Connected/);
  assert.equal(await page.locator('#provider-connections').isVisible(), false);
  await page.locator('#planner-menu summary').click();
  await page.locator('#open-accounts').click();
  assert.equal(await page.locator('#accounts-title').innerText(), 'Settings.');
  assert.equal(await page.locator('#settings-courses, #settings-history, .settings-footnote').count(), 0);
  await page.locator('#settings-display-name').fill('Dheeraj');
  await page.locator('#settings-profile-form button').click();
  assert.equal(await page.locator('#settings-name').innerText(), 'Dheeraj');
  await page.locator('#settings-theme').selectOption('sand');
  assert.equal(await page.locator('body').getAttribute('data-accent'), 'sand');

  await page.getByRole('button', { name: 'Connect Academia', exact: true }).click();
  const providerRequests = [];
  await page.route('**/api/challenge', route => {
    providerRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: { required: false } });
  });
  await page.route('**/api/login/client', route => {
    providerRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: { authenticated: true } });
  });
  await page.locator('#connect-account').fill('synthetic');
  await page.locator('#connect-password').fill('test-password');
  await page.evaluate(() => {
    globalThis.savedLoadReports = loadReports;
    loadReports = async () => { throw new Error('Reports could not refresh. Try again.'); };
  });
  await page.locator('#connect-submit').click();
  await page.getByText('Reports could not refresh. Try again.', { exact: true }).waitFor();
  assert.equal(await page.locator('#connect-dialog').isVisible(), true);
  assert.equal(providerRequests.length, 2);
  assert.equal(providerRequests[0].provider, 'academia');
  assert.equal(providerRequests[1].provider, 'academia');
  assert.equal(await page.locator('#connect-password').inputValue(), '');
  await page.evaluate(() => { loadReports = async () => ({ connections: { academia: { connected: true } }, schedule: { entries: [] } }); });
  await page.locator('#connect-password').fill('test-password');
  await page.locator('#connect-submit').click();
  await page.getByText('Academia connected, but it returned no timetable. Your attendance is still available. Close this dialog to continue.', { exact: true }).waitFor();
  assert.equal(await page.locator('#connect-dialog').isVisible(), true);
  await page.locator('#close-connect').click();
  await page.evaluate(() => { loadReports = globalThis.savedLoadReports; });
  await page.getByRole('button', { name: 'Attendance', exact: true }).click();
  assert.equal(await page.locator('#monthly-attendance').count(), 0);
  assert.equal(await page.locator('#attendance-overview').count(), 0);
  assert.equal(await page.locator('#allocation-filter').count(), 0);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  assert.equal(await page.locator('.period-plan').count(), 0);
  await page.getByRole('button', { name: 'View attendance', exact: true }).click();
  assert.equal(await page.locator('#attendance-panel').isVisible(), true);
  await page.locator('#planner-menu summary').click();
  await page.locator('#open-calendar').click();
  assert.equal(await page.locator('.academic-month button').count(), 30);
  await page.locator('.academic-month button[data-date="2026-09-14"]').click();
  assert.match(await page.locator('.calendar-detail').innerText(), /Day order 1/);
  assert.equal(await page.locator('.calendar-period').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'View selected day classes' }).count(), 0);
  assert.equal(await page.locator('#calendar-art').evaluate(img => img.complete && img.naturalWidth > 0), true);
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  assert.equal(await page.locator('.academic-month button').count(), 31);
  assert.match(await page.locator('#calendar-month-title').innerText(), /October 2026/);
  await page.getByRole('button', { name: 'Return to today', exact: true }).click();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator('#calendar-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
  }

  await page.locator('#close-calendar').click();
  assert.equal(await page.locator('#open-schedule').count(), 0);
  await page.locator('button[data-page="home"]').click();
  assert.equal(await page.locator('#student-context').count(), 0);
  assert.equal(await page.locator('#open-subjects').count(), 0);
  assert.equal(await page.getByText('What if I miss this class?', { exact: true }).count(), 0);
  await page.evaluate(() => {
    const entry = { code: 'DS', title: 'Data Structures', room: 'Test lab', dayOrder: 'A', start: '10:30', end: '11:30', allocation: 'Theory', batch: 'B1' };
    const attendance = { data: [{ code: 'DS', title: 'Data Structures', present: 18, conducted: 22 }] };
    globalThis.testSchedule = { timezone: 'Asia/Kolkata', entries: [entry,
      { ...entry, start: '11:30', end: '12:30' },
      { ...entry, batch: 'B2', start: '13:30', end: '14:30' }], calendar: [
      { date: '2026-09-14', kind: 'holiday', label: 'Synthetic holiday' },
      { date: '2026-09-15', kind: 'teaching', dayOrder: 'A' },
    ] };
    classproHome.update(attendance, globalThis.testSchedule);
  });
  assert.match(await page.locator('#next-class-card').innerText(), /Tue, Sep 15/);
  assert.match(await page.locator('#today-classes').innerText(), /Synthetic holiday/);
  await page.locator('.calendar-week button[data-date="2026-09-15"]').click();
  await page.locator('#batch-filter').selectOption('B1');
  assert.equal(await page.locator('#today-classes > li').count(), 1);
  assert.match(await page.locator('#today-classes').innerText(), /12:30/);
  await page.getByRole('button', { name: 'Next week', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Next week');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.evaluate(() => classproHome.update({ data: [] }, { ...globalThis.testSchedule, calendar: [] }));
  assert.match(await page.locator('#schedule-source').innerText(), /unavailable/);
  assert.match(await page.locator('#next-class-card').innerText(), /No next class confirmed/);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no overflow at ${width}px`);
  }
  await page.evaluate(() => {
    const report = { profile: { name: 'Test Person', regNo: 'SETTINGS-TEST' }, attendance: { data: [{ code: 'CS', title: 'Computing', present: 8, conducted: 10 }] }, marks: { data: [] } };
    anonSettings.update(report);
    anonSettings.update({ ...report, attendance: { data: [{ code: 'CS', title: 'Computing', present: 9, conducted: 11 }] } });
    globalThis.settingsTestReport = report;
  });
  await page.locator('#planner-menu summary').click();
  await page.locator('#open-accounts').click();
  await page.locator('#settings-display-name').fill('Test nickname');
  await page.locator('#settings-profile-form button').click();
  await page.evaluate(() => { anonSettings.clear(); anonSettings.update(globalThis.settingsTestReport); });
  assert.equal(await page.locator('#settings-name').innerText(), 'Test nickname');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator('#accounts-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
  }
  await page.locator('.settings-detail').filter({ hasText: 'Privacy & storage' }).locator('summary').click();
  await page.locator('#settings-reset').click();
  assert.equal(await page.locator('#settings-name').innerText(), 'Test Person');
  await page.evaluate(() => {
    document.querySelector('#accounts-dialog').close();
    renderAttendance({ data: [{ code: 'CS', title: 'Computing', present: 9, conducted: 11, absent: 2, change24h: { points: 1.82 } }] });
  });
  assert.match(await page.locator('.attendance-change.positive').textContent(), /\+1.8%/);
  await page.evaluate(() => renderAttendance({ data: [{ code: 'CS', title: 'Computing', present: 7, conducted: 10, absent: 3, change24h: { points: -10 } }] }));
  assert.match(await page.locator('.attendance-change.negative').textContent(), /-10%/);
  assert.deepEqual(failures, []);
});
