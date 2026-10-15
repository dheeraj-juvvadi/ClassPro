import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('compact attendance keeps signed hours, recent deltas, keyboard details and planner integration', { timeout: 30000 }, async context => {
  const app = express(); app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(4000);
  const errors = []; let calls = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  await page.route('**/api/**', route => { calls++; return route.fulfill({ json: {} }); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?preview=home#attendance`);
  const report = { data: [
    { code: 'DS', title: 'Data Structures', present: 18, conducted: 22, credits: 4, faculty: 'Dr. Test', room: 'R1', change24h: { points: -1.2 } },
    { code: 'CN', title: 'Computer Networks', present: 13, conducted: 19, absent: 6, change24h: { points: 1.82 } },
    { code: 'ZERO', title: 'A long course title that wraps naturally across several lines on a narrow screen', present: 3, conducted: 4, change24h: { points: 0 } },
    { code: 'NEW', title: 'New subject', present: 0, conducted: 0 },
    { code: 'UNKNOWN', title: 'Unavailable record', present: null, conducted: null, change24h: { points: 2 } },
    { code: 'ROUND', title: 'Rounded change', present: 9, conducted: 12, change24h: { points: -0.04 } },
    { code: 'NOHISTORY', title: 'No previous record', present: 5, conducted: 6 },
    { code: 'BADHISTORY', title: 'Unconfirmed history', present: 5, conducted: 6, change24h: { points: '2' } },
    { code: 'RECENT', title: 'Recent sync', present: 9, conducted: 11, changeSinceSync: { points: 1.82 } },
    { code: 'REPORTED', title: 'Reported attendance', present: 28, conducted: 38 },
  ] };
  await page.evaluate(report => renderAttendance(report), report);
  const ds = page.locator('.attendance-row[data-course="DS"]');
  const cn = page.locator('.attendance-row[data-course="CN"]');
  assert.equal(await ds.locator('.attendance-main-metric').getAttribute('aria-label'), 'Margin: 2 hours');
  assert.equal(await ds.locator('.attendance-margin-value strong').innerText(), '2');
  assert.equal(await cn.locator('.attendance-main-metric').getAttribute('aria-label'), 'Required: 5 hours');
  assert.equal(await cn.locator('.attendance-margin-value strong').innerText(), '−5');
  assert.equal(await cn.locator('.attendance-margin-value').evaluate(el => getComputedStyle(el).color), 'rgb(237, 166, 143)');
  assert.equal(await page.locator('.attendance-metric-label, .attendance-margin-action').count(), 0);
  assert.equal(await ds.locator('.attendance-recorded-hours').innerText(), '18 / 22h attended');
  assert.equal(await ds.locator('.attendance-percent').isVisible(), true);
  assert.equal(await cn.locator('.attendance-percent').innerText(), '68.4%');
  assert.equal(await ds.locator('.attendance-recorded-rate .attendance-change-value').textContent(), '−1.2');
  assert.equal(await cn.locator('.attendance-recorded-rate .attendance-change-value').textContent(), '+1.8');
  assert.equal(await page.locator('.attendance-change-value small').count(), 0);
  assert.match(await ds.locator('.attendance-change .sr-only').textContent(), /-1.2 percentage points · past 24 hours/);
  const recent = page.locator('.attendance-row[data-course="RECENT"]');
  assert.equal(await recent.locator('.attendance-change-value').textContent(), '+1.8');
  assert.match(await recent.locator('.attendance-change').getAttribute('title'), /since previous sync/);
  for (const code of ['ZERO', 'ROUND']) {
    const row = page.locator(`.attendance-row[data-course="${code}"]`);
    assert.equal(await row.locator('.attendance-change.unchanged .attendance-change-value').textContent(), '0.0');
    assert.equal(await row.locator('.attendance-change').evaluate(el => getComputedStyle(el).color), 'rgb(173, 180, 164)');
  }
  for (const code of ['NEW', 'UNKNOWN', 'NOHISTORY', 'BADHISTORY']) {
    assert.equal(await page.locator(`.attendance-row[data-course="${code}"] .attendance-change`).count(), 0);
  }
  for (const code of ['NEW', 'UNKNOWN']) {
    const row = page.locator(`.attendance-row[data-course="${code}"]`);
    assert.equal(await row.locator('.attendance-percent').innerText(), '—');
    assert.equal(await row.locator('.attendance-rail, .attendance-recorded-hours').count(), 0);
  }
  assert.equal(await ds.getByRole('meter').getAttribute('aria-valuenow'), '81.82');
  assert.equal(await ds.getByRole('meter').getAttribute('aria-valuetext'), '81.8% attendance; target 75%.');
  assert.equal(await ds.locator('.attendance-rail-fill').evaluate(el => el.style.width), '81.82%');
  assert.equal(await page.locator('.attendance-target-key').count(), 0);
  assert.equal(await page.locator('#attendance-panel > .section-heading').isVisible(), false);
  await ds.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await ds.locator('.attendance-percent').innerText(), '81.8%');
  assert.match(await ds.locator('.attendance-course-meta').innerText(), /Dr. Test/);
  assert.match(await ds.locator('.attendance-course-meta').innerText(), /Hours missed\s+4/);
  assert.match(await ds.locator('.attendance-course-meta').innerText(), /Course code\s+DS/);
  assert.equal(await ds.locator('.attendance-explanation').isVisible(), true);
  assert.equal(await page.locator('.recovery-date:not(.sr-only), .recovery-assumption:not(.sr-only)').count(), 0);
  const reported = page.locator('.attendance-row[data-course="REPORTED"]');
  assert.equal(await reported.locator('.attendance-margin-value strong').innerText(), '−2');
  await reported.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.match(await reported.locator('.attendance-explanation').innerText(), /Attend 2 more hours to reach 75% \(30 \/ 40h attended\)/);
  await ds.locator('summary').focus();
  await page.evaluate(report => renderAttendance(report), report);
  assert.equal(await ds.locator('details').getAttribute('open'), '');
  assert.equal(await ds.locator('summary').evaluate(el => el === document.activeElement), true);
  assert.equal(await ds.locator('summary').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
  await page.keyboard.press('Space');
  assert.equal(await ds.locator('details').getAttribute('open'), null);
  await page.keyboard.press('Space');
  assert.equal(await ds.locator('details').getAttribute('open'), '');
  assert.equal(await page.locator('#attendance-panel .attendance-rows').evaluate(el => getComputedStyle(el).borderRadius), '22px');
  assert.equal(await ds.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
  assert.equal(await cn.evaluate(el => getComputedStyle(el).borderTopWidth), '1px');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
    assert.equal(await ds.evaluate(el => el.scrollWidth > el.clientWidth), false);
    const alignment = await page.locator('.attendance-summary').evaluateAll(rows => rows.every(row => {
      const amount = row.querySelector('.attendance-margin-value').getBoundingClientRect();
      const heading = row.querySelector('.attendance-course-heading').getBoundingClientRect();
      const record = row.querySelector('.attendance-record').getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      const rate = row.querySelector('.attendance-recorded-rate');
      const change = rate.querySelector('.attendance-change-value');
      const alignedRate = !change || Math.abs(change.getBoundingClientRect().top - rate.querySelector('.attendance-percent').getBoundingClientRect().top) < 3;
      return Math.abs(bounds.right - amount.right) < 1 && heading.right < amount.left && record.right < amount.left && alignedRate;
    }));
    assert.equal(alignment, true, `hours aligned at right without overlap at ${width}`);
    const railAlignment = await page.locator('.attendance-rail').evaluateAll(rails => rails.every(rail => {
      const bounds = rail.getBoundingClientRect();
      const target = rail.querySelector('.attendance-rail-target').getBoundingClientRect();
      return Math.abs((target.left + target.width / 2 - bounds.left) / bounds.width - 0.75) < 0.001;
    }));
    assert.equal(railAlignment, true, `target remains at 75% at ${width}`);
    if (width >= 390) {
      const height = await ds.locator('summary').evaluate(el => el.getBoundingClientRect().height);
      assert.ok(height >= 99.9 && height < 120, `comfortable row at ${width}: ${height}`);
    }
  }
  assert.equal(await page.locator('#attendance-panel button:visible').count(), 0);
  assert.equal(await ds.locator('summary').evaluate(el => getComputedStyle(el, '::after').content), 'none');
  await page.locator('#calculate-attendance').click();
  assert.equal(await page.locator('#projection-dialog').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#calculate-attendance').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('.attendance-row[data-course="ZERO"] .attendance-margin-value strong').innerText(), '0');
  assert.equal(await page.locator('.attendance-row[data-course="NEW"] .attendance-margin-value strong').innerText(), '—');
  await page.evaluate(() => { location.hash = 'home'; });
  await page.locator('#home-view').waitFor({ state: 'visible' });
  const update = async start => page.evaluate(start => {
    const classes = [
      { code: 'DS', title: 'Only today', dayOrder: '1', start, end: '19:00', room: 'R1' },
      { code: 'CN', title: 'Tomorrow morning', dayOrder: '2', start: '08:00', end: '09:00', room: 'R2' },
      { code: 'LATER', title: 'Three days away', dayOrder: '3', start: '10:00', end: '11:00', room: 'R3' },
    ];
    anonHome.update({ data: classes.map(c => ({ ...c, present: 18, conducted: 20 })) }, {
      timezone: 'Asia/Kolkata', entries: classes,
      calendar: [14, 15, 16, 17].map((day, i) => ({ date: `2026-09-${day}`, kind: i === 2 ? 'holiday' : 'teaching', dayOrder: i === 0 ? '1' : i === 1 ? '2' : '3' })),
    });
  }, start);
  await update('17:58'); // Preview clock is 09:48; next class is 490 minutes away.
  assert.equal(await page.locator('.class-countdown').innerText(), 'Today');
  assert.equal(await page.locator('.class-countdown').evaluate(el => getComputedStyle(el).fontWeight), '700');
  assert.equal(await page.locator('#home-insights .insight-empty-wide').count(), 1);
  assert.equal(await page.locator('#home-insights .ascii-art').count(), 1);
  assert.match(await page.locator('#home-insights').innerText(), /You have only 1 class for the day/);
  assert.doesNotMatch(await page.locator('#home-insights').innerText(), /Tomorrow|Three days/);
  await update('11:48');
  assert.equal(await page.locator('.class-countdown').innerText(), 'Starts in 120 min');
  await update('11:49');
  assert.equal(await page.locator('.class-countdown').innerText(), 'Today');
  await update('09:30');
  assert.equal(await page.locator('.class-countdown').innerText(), 'Ongoing');
  await page.evaluate(() => {
    const entries = [
      { code: 'ONE', title: 'First class', room: 'R1', dayOrder: '1', start: '09:00', end: '09:47' },
      { code: 'TWO', title: 'Second class', room: 'R2', dayOrder: '1', start: '09:30', end: '09:48' },
      { code: 'THREE', title: 'Third class', room: 'R3', dayOrder: '1', start: '09:48', end: '09:49' },
    ];
    globalThis.widgetSchedule = { timezone: 'Asia/Kolkata', entries,
      calendar: [{ date: '2026-09-14', kind: 'teaching', dayOrder: '1' }] };
    anonHome.update({ data: [] }, widgetSchedule);
  });
  assert.match(await page.locator('#next-class-card').innerText(), /Second class/);
  assert.match(await page.locator('#home-insights').innerText(), /Third class/i);
  assert.match(await page.locator('#home-insights').innerText(), /You have only 2 classes left/);
  assert.doesNotMatch(await page.locator('#today-classes').innerText(), /First class/);
  await page.evaluate(() => {
    widgetSchedule.entries = widgetSchedule.entries.map(entry => ({ ...entry, start: '09:00', end: '09:47' }));
    anonHome.update({ data: [] }, widgetSchedule);
  });
  assert.equal(await page.locator('#next-class-title').innerText(), 'You are done for the day');
  assert.equal(await page.locator('#home-insights').isVisible(), false);
  assert.equal(await page.locator('.timeline-row').count(), 0);
  assert.deepEqual(errors, []); assert.equal(calls, 0);
});

test('attendance changes expire independently without sync and cached reports cannot revive them', { timeout: 20000 }, async context => {
  const app = express(); app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage();
  await page.clock.install({ time: new Date('2026-10-15T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-15T12:00:01Z'));
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.goto(`http://127.0.0.1:${server.address().port}/?preview=home#attendance`);
  await page.evaluate(() => {
    const now = Date.now(), day = 86400000;
    globalThis.deltaReport = { data: [
      { code: 'CS', title: 'Computing', present: 9, conducted: 11,
        changeSinceSync: { points: 1.82, to: now - day + 2000, expiresAt: now + 2000 } },
      { code: 'MA', title: 'Mathematics', present: 28, conducted: 38,
        changeSinceSync: { points: -1.2, to: now - day + 4000, expiresAt: now + 4000 } },
    ] };
    renderAttendance(deltaReport);
  });
  const badges = () => page.locator('.attendance-change-value').allTextContents();
  assert.deepEqual(await badges(), ['+1.8', '−1.2']);
  await page.clock.runFor(1000);
  await page.evaluate(() => renderAttendance(deltaReport));
  assert.deepEqual(await badges(), ['+1.8', '−1.2']);
  await page.clock.runFor(1000);
  assert.deepEqual(await badges(), ['−1.2']);
  await page.evaluate(() => {
    deltaReport.data[0].present = 8;
    deltaReport.data[0].changeSinceSync = { points: -9.09, to: Date.now(), expiresAt: Date.now() + 86400000 };
    renderAttendance(deltaReport);
  });
  assert.deepEqual(await badges(), ['−9.1', '−1.2']);
  await page.clock.runFor(2000);
  assert.deepEqual(await badges(), ['−9.1']);
  await page.clock.fastForward(86400000);
  assert.deepEqual(await badges(), []);
  await page.evaluate(() => {
    renderAttendance(deltaReport);
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.deepEqual(await badges(), []);
});

test('ticket preview keeps compact separate cards and removes the target rail', { timeout: 20000 }, async context => {
  const app = express(); app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.goto(`http://127.0.0.1:${server.address().port}/?preview=home&attendance=tickets#attendance`);
  assert.equal(await page.locator('.attendance-row').count(), 4);
  assert.equal(await page.locator('.attendance-rail').count(), 0);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.locator('.attendance-row').evaluateAll(rows => rows.map(row => ({
      height: row.getBoundingClientRect().height, fits: row.scrollWidth <= row.clientWidth,
      background: getComputedStyle(row).backgroundColor,
    })));
    assert.ok(metrics.every(row => row.height >= 94 && row.height <= 120 && row.fits), `compact cards at ${width}`);
    assert.ok(metrics.every(row => row.background === 'rgb(61, 71, 53)'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.locator('.attendance-summary').first().focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.attendance-details').first().getAttribute('open'), '');
  assert.equal(await page.locator('.attendance-explanation').first().isVisible(), true);
});

test('home widgets advance at the minute after class ends without a reload', { timeout: 30000 }, async context => {
  const app = express(); app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(4000);
  await page.clock.install({ time: new Date('2026-09-14T08:29:00Z') });
  await page.clock.pauseAt(new Date('2026-09-14T08:29:59.900Z'));
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  const report = { attendance: { data: [] }, marks: { data: [] }, connections: {},
    sync: { due: false, nextAt: Date.parse('2026-09-16T00:00:00Z') },
    schedule: { timezone: 'Asia/Kolkata',
      calendar: [{ date: '2026-09-14', kind: 'teaching', dayOrder: '1' }],
      entries: [
        { code: 'ONE', title: 'First class', room: 'R1', dayOrder: '1', start: '13:00', end: '14:00' },
        { code: 'TWO', title: 'Second class', room: 'R2', dayOrder: '1', start: '14:00', end: '15:00' },
        { code: 'THREE', title: 'Third class', room: 'R3', dayOrder: '1', start: '15:00', end: '16:00' },
      ] } };
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => route.fulfill({ json: report }));
  await page.goto(`http://127.0.0.1:${server.address().port}/#home`);
  await page.locator('#next-class-title').getByText('First class', { exact: true }).waitFor();
  assert.equal(await page.locator('#home-insights button').count(), 2);
  await page.clock.fastForward(60000);
  assert.equal(await page.locator('#next-class-title').innerText(), 'First class');
  await page.clock.runFor(150);
  assert.equal(await page.locator('#next-class-title').innerText(), 'Second class');
  assert.match(await page.locator('#home-insights').innerText(), /You have only 2 classes left/);
  assert.doesNotMatch(await page.locator('#today-classes').innerText(), /First class/);
  await page.clock.fastForward(3600000);
  assert.equal(await page.locator('#next-class-title').innerText(), 'Third class');
  assert.match(await page.locator('#home-insights').innerText(), /You have only 1 class for the day/);
  await page.clock.fastForward(3600000);
  assert.equal(await page.locator('#next-class-title').innerText(), 'You are done for the day');
  assert.equal(await page.locator('#home-insights').isVisible(), false);
  assert.equal(await page.locator('.timeline-row').count(), 0);
});
