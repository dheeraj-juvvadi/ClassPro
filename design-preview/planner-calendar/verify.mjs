import { chromium } from '../../portal-app/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Kolkata' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = 'http://127.0.0.1:4186/design-preview/planner-calendar/';
const day = date => page.locator(`calendar-month button[part~="date-${date}"]`);
try {
  await page.goto(url);
  await day('2026-10-15').waitFor();
  await day('2026-10-10').click(); await day('2026-10-20').click();
  assert.equal(await day('2026-10-15').getAttribute('aria-pressed'), 'true');
  assert.match(await day('2026-10-15').getAttribute('aria-label'), /Day order 3/);
  assert.match(await day('2026-10-02').getAttribute('aria-label'), /Gandhi Jayanthi/);
  assert.match(await page.locator('#plan-description').innerText(), /5 teaching days · 6 holidays/);
  await day('2026-10-16').click();
  assert.equal(await day('2026-10-16').getAttribute('aria-pressed'), 'false');
  await day('2026-10-16').click();
  assert.equal(await day('2026-10-16').getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await day('2026-10-15').click(); await day('2026-10-23').click();
  assert.match(await page.locator('#plan-description').innerText(), /5 teaching days/);
  await day('2026-10-15').click();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('calendar-month').shadowRoot.activeElement?.getAttribute('part')?.includes('date-2026-10-16'));
  assert.equal(await day('2026-10-16').evaluate(node => node === node.getRootNode().activeElement), true);
  await page.keyboard.press('PageDown');
  await day('2026-11-16').waitFor();
  await page.waitForFunction(() => document.querySelector('calendar-month').shadowRoot.activeElement?.getAttribute('part')?.includes('date-2026-11-16'));
  assert.equal(await day('2026-11-16').evaluate(node => node === node.getRootNode().activeElement), true);
  await page.keyboard.press('PageDown'); await day('2026-12-16').waitFor();
  assert.match(await day('2026-12-16').getAttribute('aria-label'), /Unconfirmed/);
  assert.equal(await day('2026-12-16').getAttribute('aria-disabled'), null, 'unknown date can bound a range without adding hours');
  await page.keyboard.press('PageUp'); await day('2026-11-16').waitFor();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await day('2026-10-15').waitFor();
  await page.locator('[data-mode="od"]').click();
  assert.equal(await day('2026-10-15').getAttribute('aria-disabled'), 'true');
  assert.equal(await day('2026-10-01').getAttribute('aria-disabled'), null);
  await day('2026-10-01').click();
  await page.locator('[data-mode="attend"]').click();
  assert.equal(await day('2026-10-01').getAttribute('aria-disabled'), 'true');
  await day('2026-10-15').click(); await day('2026-10-16').click();
  await page.locator('#review').click();
  assert.equal(await page.locator('#calculation').isVisible(), true);
  assert.equal(await page.locator('#calculation-title').innerText(), 'Attended hours');
  for (const layout of ['month', 'split']) {
    await page.goto(`${url}?layout=${layout}`);
    await day('2026-10-15').waitFor();
    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      const measurements = await page.evaluate(() => {
        const month = document.querySelector('calendar-month');
        const calendar = document.querySelector('calendar-multi');
        const buttons = [...document.querySelectorAll('button'), ...month.shadowRoot.querySelectorAll('button'), ...calendar.shadowRoot.querySelectorAll('button')];
        const small = buttons.filter(node => node.getClientRects().length).filter(node => { const box = node.getBoundingClientRect(); return box.width < 43.9 || box.height < 43.9; }).map(node => node.outerHTML.slice(0, 100));
        return { overflow: document.documentElement.scrollWidth > innerWidth, small };
      });
      assert.equal(measurements.overflow, false, `overflow: ${layout} ${width}`);
      assert.deepEqual(measurements.small, [], `touch targets: ${layout} ${width}`);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await day('2026-10-15').click(); await page.keyboard.press('PageDown'); await day('2026-11-15').waitFor();
  assert.equal(await page.locator('calendar-month').evaluate(node => node.getAnimations().length), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: range, direct toggles, source labels, unconfirmed dates, Leave/Attend/OD, native arrow/PageUp/PageDown, inline results, 44px controls, 320/390/430/1280, reduced motion; no page errors.');
} finally { await browser.close(); }
