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
  await page.getByRole('button', { name: 'Essential only', exact: true }).click();
  assert.equal(await page.locator('#sign-in canvas').count(), 0);
  assert.equal(await page.locator('script[src*="sign-in-particles"]').count(), 0);
  assert.equal(await page.locator('#manual-captcha-answer').isVisible(), false);
  assert.equal(await page.locator('#sign-in-label').innerText(), 'Continue');
  assert.ok(await page.locator('#sign-in').evaluate(element => parseFloat(getComputedStyle(element).minHeight) >= 44));
  await page.evaluate(() => anonAuth.configure({ authMode: 'http', provider: 'academia' }));
  assert.equal(await page.locator('#provider-choice').isVisible(), false);
  assert.equal(await page.locator('#login-provider').inputValue(), 'academia');
  await page.evaluate(() => anonAuth.usePortal());
  assert.equal(await page.locator('#login-provider').inputValue(), 'portal');
  await page.evaluate(() => anonAuth.configure({ authMode: 'http', provider: 'portal' }));
  assert.equal(await page.locator('#login-provider').inputValue(), 'academia');
  await page.route('**/api/challenge', route => route.fulfill({ json: route.request().postDataJSON().provider === 'portal'
    ? { required: true, serverAuto: true, image: 'data:image/png;base64,dGVzdA==' } : { required: false } }));
  await page.route('**/api/login/client', route => route.fulfill({ status: 502, json: { error: { code: 'LOGIN_REJECTED', message: 'Academia could not respond.' } } }));
  await page.locator('#account').fill('synthetic@srmist.edu.in');
  await page.locator('#sign-in').click();
  await page.locator('#password').fill('test-password');
  await page.locator('#portal-password').fill('test-portal-password');
  await page.locator('#sign-in').click();
  await page.locator('#login-message').waitFor({ state: 'visible' });
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#account').inputValue(), 'synthetic@srmist.edu.in');
  await page.evaluate(() => anonAuth.configure({ authMode: 'http' }));
  await page.route('**/api/login/client', route => route.fulfill({ status: 401, json: { error: { code: 'LOGIN_REJECTED', message: 'Sign-in rejected.' } } }));
  await page.locator('#password').fill('test-password');
  await page.locator('#sign-in').click();
  await page.waitForFunction(() => document.querySelector('#login-message').textContent.includes('Sign-in rejected'));
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await page.goto(`${origin}/?preview=home`);
  await page.locator('#home-view').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#planner-nav > button').count(), 3);
  const menuGeometry = await page.locator('#planner-menu > summary').evaluate(button => {
    const icon = button.querySelector('span'), b = button.getBoundingClientRect(), i = icon.getBoundingClientRect();
    const style = getComputedStyle(button);
    return { dx: Math.abs((b.x + b.width / 2) - (i.x + i.width / 2)), dy: Math.abs((b.y + b.height / 2) - (i.y + i.height / 2)), background: style.backgroundColor, shadow: style.boxShadow };
  });
  assert.ok(menuGeometry.dx < 1 && menuGeometry.dy < 1);
  assert.equal(menuGeometry.background, 'rgba(0, 0, 0, 0)');
  assert.equal(menuGeometry.shadow, 'none');
  await page.locator('#planner-menu > summary').click({ position: { x: 22, y: 22 } });
  assert.equal(await page.locator('#planner-menu').getAttribute('open'), '');
  await page.keyboard.press('Escape');
  await page.locator('button[data-page="marks"]').click();
  assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node).borderTopWidth), '0px');
  assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('#planner-nav').evaluate(node => getComputedStyle(node).position), 'fixed');
  await page.locator('button[data-page="home"]').click();

  assert.match(await page.locator('#schedule-source').innerText(), /Day order 1/);
  assert.equal(await page.locator('.calendar-week button').count(), 7);
  assert.match(await page.locator('#next-class-card').innerText(), /Margin: 2h/);
  assert.match(await page.locator('#next-class-card').innerText(), /81.8%/);
  assert.match(await page.locator('.calendar-month').innerText(), /September 2026/);
  assert.equal(await page.locator('.calendar-week button[aria-pressed="true"]').getAttribute('data-date'), '2026-09-14');
  for (const width of [320, 390, 768, 1000, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const insights = document.querySelector('.attendance-insights').getBoundingClientRect();
      const agenda = document.querySelector('.day-timeline').getBoundingClientRect();
      const list = document.querySelector('#today-classes');
      const cards = [...document.querySelectorAll('.insight-card, #next-class-card, .calendar-week button')];
      return { overflow: document.documentElement.scrollWidth > innerWidth,
        clipped: cards.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className),
        bottomDifference: Math.abs(insights.bottom - agenda.bottom),
        listHeight: list.clientHeight };
    });
    assert.equal(layout.overflow, false, `home overflow at ${width}px`);
    assert.deepEqual(layout.clipped, [], `clipped home cards at ${width}px`);
    if (width >= 1000) {
      assert.ok(layout.bottomDifference < 2, `agenda and insight bottoms align at ${width}px`);
      assert.ok(layout.listHeight > 100, `agenda remains usable at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.evaluate(() => {
    const message = document.querySelector('#home-message');
    message.textContent = 'Sync could not finish. Your last data is still available.';
    message.hidden = false;
  });
  assert.ok(await page.evaluate(() => {
    const agenda = document.querySelector('.day-timeline').getBoundingClientRect();
    const card = document.querySelector('#next-class-card').getBoundingClientRect();
    const insights = document.querySelector('.attendance-insights').getBoundingClientRect();
    return Math.abs(agenda.top - card.top) < 2 && Math.abs(agenda.bottom - insights.bottom) < 2;
  }), 'sync warnings preserve desktop column alignment');
  await page.evaluate(() => { document.querySelector('#home-message').hidden = true; });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#schedule-form').count(), 0);
  await page.evaluate(() => providerConnections.update({ connections: { portal: { connected: true } } }));
  assert.equal(await page.getByRole('button', { name: 'Connect Student Portal', exact: true }).count(), 0);
  assert.match(await page.locator('#provider-connections').textContent(), /Connected/);
  assert.equal(await page.locator('#provider-connections').isVisible(), false);
  await page.locator('#planner-menu summary').click();
  await page.locator('#open-accounts').click();
  assert.equal(await page.locator('#accounts-title').innerText(), 'Settings');
  assert.equal(await page.locator('#settings-courses, #settings-history, .settings-footnote').count(), 0);
  await page.locator('#settings-display-name').fill('Alex');
  await page.locator('#settings-profile-form button').click();
  assert.equal(await page.locator('#settings-name').innerText(), 'Alex');
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
  assert.equal(await page.locator('#calendar-view img, #calendar-view .calendar-cover').count(), 0);
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  assert.equal(await page.locator('.academic-month button').count(), 31);
  assert.match(await page.locator('#calendar-month-title').innerText(), /October 2026/);
  await page.getByRole('button', { name: 'Return to today', exact: true }).click();
  for (const width of [320, 390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator('#calendar-view').evaluate(view => view.scrollWidth <= view.clientWidth), true);
  }

  assert.equal(await page.locator('#calendar-view').isVisible(), true);
  assert.match(page.url(), /#calendar$/);
  assert.equal(await page.locator('#open-schedule').count(), 1);
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
    anonHome.update(attendance, globalThis.testSchedule);
  });
  assert.match(await page.locator('#next-class-card').innerText(), /You are done for the day/);
  assert.equal(await page.locator('#home-insights').isVisible(), false);
  assert.match(await page.locator('#today-classes').innerText(), /Synthetic holiday/);
  await page.locator('.calendar-week button[data-date="2026-09-15"]').click();
  await page.locator('#batch-filter').selectOption('B1');
  assert.equal(await page.locator('#today-classes > li').count(), 1);
  assert.match(await page.locator('#today-classes').innerText(), /12:30/);
  await page.getByRole('button', { name: 'Next week', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Next week');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.evaluate(() => anonHome.update({ data: [] }, { ...globalThis.testSchedule, calendar: [] }));
  assert.match(await page.locator('#schedule-source').innerText(), /unavailable/);
  assert.match(await page.locator('#next-class-card').innerText(), /No next class confirmed/);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${origin}/?preview=home#schedule`);
  await page.reload();
  assert.equal(await page.title(), 'Schedule · Anon');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#schedule-choices input:checked').count(), 4);
  const optional = page.locator('#schedule-choices input').first();
  await optional.uncheck();
  assert.equal(await page.locator('#schedule-choices input:checked').count(), 3);
  await page.locator('button[data-page="home"]').click();
  assert.equal(await page.locator('#next-class-title').textContent(), 'Operating Systems');
  assert.equal(await page.locator('#today-classes > li').count(), 3);
  await page.reload();
  assert.equal(await page.locator('#next-class-title').textContent(), 'Operating Systems');
  await page.locator('[data-sidebar-action="open-schedule"]').click();
  assert.equal(await page.locator('#schedule-choices input').first().isChecked(), false);
  await page.locator('#schedule-include-all').click();
  assert.equal(await page.locator('#schedule-choices input:checked').count(), 4);
  await page.locator('[data-sidebar-action="open-calendar"]').click();
  assert.equal(await page.title(), 'Academic calendar · Anon');
  assert.equal(await page.locator('#calendar-title').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await page.getByText('Day orders, dates & days off.', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Plan attendance for this day', exact: true }).click();
  assert.equal(await page.locator('#projection-customize').evaluate(el => el.open), true, 'day entry opens customization automatically');
  assert.equal(await page.locator('#projection-range-form').isVisible(), true);
  assert.equal(await page.locator('#projection-day-editor').isVisible(), true);
  assert.equal(await page.locator('.day-class-select input:checked').count(), 4);
  assert.equal(await page.locator('#projection-outlook').isHidden(), true);
  await page.locator('#projection-review-custom').click();
  assert.equal(await page.locator('#projection-day-editor').isVisible(), false);
  assert.equal(await page.locator('#projection-outlook').isVisible(), true);
  assert.equal(await page.locator('.date-projection-course > summary').count(), 4);
  await page.locator('#projection-done').click();
  await page.locator('[data-sidebar-action="open-accounts"]').click();
  assert.equal(await page.title(), 'Settings · Anon');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await page.evaluate(() => {
    const report = { profile: { name: 'Test Person', regNo: 'SETTINGS-TEST' }, attendance: { data: [{ code: 'CS', title: 'Computing', present: 8, conducted: 10 }] }, marks: { data: [] } };
    anonSettings.update(report);
    anonSettings.update({ ...report, attendance: { data: [{ code: 'CS', title: 'Computing', present: 9, conducted: 11 }] } });
    globalThis.settingsTestReport = report;
  });
  assert.equal(await page.locator('#planner-menu').isVisible(), false);
  await page.locator('[data-sidebar-action="open-accounts"]').click();
  await page.locator('#settings-display-name').fill('Test nickname');
  await page.locator('#settings-profile-form button').click();
  await page.evaluate(() => { anonSettings.clear(); anonSettings.update(globalThis.settingsTestReport); });
  assert.equal(await page.locator('#settings-name').innerText(), 'Test nickname');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator('#settings-view').evaluate(view => view.scrollWidth <= view.clientWidth), true);
  }
  await page.locator('.settings-detail').filter({ hasText: 'Privacy & storage' }).locator('summary').click();
  await page.locator('#settings-reset').click();
  assert.equal(await page.locator('#settings-name').innerText(), 'Test Person');
  await page.evaluate(() => {
    document.querySelector('button[data-page="attendance"]').click();
    renderAttendance({ data: [{ code: 'CS', title: 'Computing', present: 9, conducted: 11, absent: 2, change24h: { points: 1.82 } }] });
  });
  assert.match(await page.locator('.attendance-change.positive').textContent(), /\+1.8 percentage points/);
  await page.evaluate(() => renderAttendance({ data: [{ code: 'CS', title: 'Computing', present: 7, conducted: 10, absent: 3, change24h: { points: -10 } }] }));
  assert.match(await page.locator('.attendance-change.negative').textContent(), /-10 percentage points/);
  await page.evaluate(() => {
    globalThis.hapticCalls = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: pattern => { hapticCalls.push(pattern); return true; } });
    anonFeedback.setHaptics(false);
    anonFeedback.success('Saved.');
  });
  assert.equal(await page.evaluate(() => hapticCalls.length), 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { anonFeedback.setHaptics(true); anonFeedback.success('Saved.'); });
  assert.equal(await page.evaluate(() => hapticCalls.length), 0);
  assert.deepEqual(failures, []);
});
