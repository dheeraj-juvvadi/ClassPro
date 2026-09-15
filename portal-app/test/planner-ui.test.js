import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('planner UI handles manual plans, calendar contracts and static sign-in', { timeout: 30000 }, async context => {
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
  await page.goto(`${origin}/?preview=home`);
  await page.locator('#home-view').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#planner-nav button').count(), 3);
  assert.match(await page.locator('#schedule-source').innerText(), /Manual/);
  assert.equal(await page.locator('.calendar-week button').count(), 7);
  await page.getByRole('button', { name: 'Plan attendance for Data Structures, 2 hours' }).click();
  assert.match(await page.locator('#projection-period').innerText(), /2-hour/);
  assert.match(await page.locator('#projection-result').innerText(), /75%/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#projection-dialog').isVisible(), false);
  assert.match(await page.evaluate(() => document.activeElement.textContent), /Plan 2h/);
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
  assert.deepEqual(failures, []);
});
