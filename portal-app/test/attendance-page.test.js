import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('attendance prioritizes hours, keeps details on refresh, and home uses only today', { timeout: 30000 }, async context => {
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
    { code: 'CN', title: 'Computer Networks', present: 13, conducted: 19, absent: 6 },
    { code: 'ZERO', title: 'A long course title that wraps naturally across several lines on a narrow screen', present: 3, conducted: 4 },
    { code: 'NEW', title: 'New subject', present: 0, conducted: 0 },
  ] };
  await page.evaluate(report => renderAttendance(report), report);
  const ds = page.locator('.attendance-row[data-course="DS"]');
  const cn = page.locator('.attendance-row[data-course="CN"]');
  assert.equal(await ds.locator('.attendance-main-metric').getAttribute('aria-label'), 'Margin: 2 hours');
  assert.equal(await ds.locator('.attendance-margin-value strong').innerText(), '2');
  assert.equal(await cn.locator('.attendance-main-metric').getAttribute('aria-label'), 'Required: 5 hours');
  assert.equal(await cn.locator('.attendance-margin-value strong').innerText(), '5');
  assert.equal(await page.locator('.attendance-metric-label').count(), 0);
  assert.match(await ds.locator('.attendance-record').innerText(), /4 missed/);
  assert.equal(await ds.locator('.attendance-percent').isVisible(), true);
  assert.equal(await cn.locator('.attendance-percent').innerText(), '68.4%');
  await ds.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await ds.locator('.attendance-percent').innerText(), '81.8%');
  assert.match(await ds.locator('.attendance-course-meta').innerText(), /Dr. Test/);
  assert.match(await ds.locator('.attendance-change').innerText(), /-1.2 percentage points/);
  await page.evaluate(report => renderAttendance(report), report);
  assert.equal(await ds.locator('details').getAttribute('open'), '');
  assert.equal(await ds.locator('summary').evaluate(el => el === document.activeElement), true);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
    assert.equal(await ds.evaluate(el => el.scrollWidth > el.clientWidth), false);
    const alignment = await page.locator('.attendance-summary').evaluateAll(rows => rows.every(row => {
      const amount = row.querySelector('.attendance-margin-value').getBoundingClientRect();
      const heading = row.querySelector('.attendance-course-heading').getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      return Math.abs(bounds.right - amount.right - 8) < 1 && heading.right < amount.left;
    }));
    assert.equal(alignment, true, `hours aligned at right without overlap at ${width}`);
  }
  assert.equal(await page.locator('#attendance-panel button').count(), 0);
  assert.equal(await ds.locator('summary').evaluate(el => getComputedStyle(el, '::after').content), 'none');
  await page.locator('#calculate-attendance').click();
  assert.equal(await page.locator('#projection-dialog').isVisible(), true);
  await page.keyboard.press('Escape');
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
