import { chromium } from '../../portal-app/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Kolkata' });
const url = 'http://127.0.0.1:4186/design-preview/planner-calendar/';
const day = value => page.locator(`calendar-month button[part~="date-2026-10-${value}"]`);
const range = () => page.locator('calendar-month button[part~="selected"]').evaluateAll(nodes => nodes.map(node => node.textContent));
async function assertBand(starts, ends) {
  const cells = await page.locator('calendar-month button[part~="selected"]').evaluateAll(nodes => nodes.map(node => {
    const css = getComputedStyle(node), box = node.getBoundingClientRect();
    return { day: node.textContent, fill: css.backgroundColor, ink: css.color, label: getComputedStyle(node, '::after').color,
      top: css.borderTopWidth, bottom: css.borderBottomWidth, border: css.borderTopColor,
      left: css.borderLeftWidth, right: css.borderRightWidth,
      radiusLeft: css.borderTopLeftRadius, radiusRight: css.borderTopRightRadius,
      x: box.x, y: box.y, width: box.width };
  }));
  for (const [index, cell] of cells.entries()) {
    assert.equal(cell.fill, 'rgb(184, 195, 152)'); assert.equal(cell.ink, 'rgb(35, 40, 29)');
    assert.equal(cell.label, 'rgb(66, 75, 53)');
    assert.equal(cell.top, '1px'); assert.equal(cell.bottom, '1px'); assert.equal(cell.border, 'rgb(255, 255, 255)');
    assert.equal(cell.left, starts.includes(cell.day) ? '1px' : '0px');
    assert.equal(cell.right, ends.includes(cell.day) ? '1px' : '0px');
    assert.equal(cell.radiusLeft, starts.includes(cell.day) ? '11px' : '0px');
    assert.equal(cell.radiusRight, ends.includes(cell.day) ? '11px' : '0px');
    const next = cells[index + 1];
    if (next?.y === cell.y && Number(next.day) === Number(cell.day) + 1) assert.ok(Math.abs(cell.x + cell.width - next.x) < 1, 'no gap inside a continuous run');
  }
}
async function captureBand(width, state) {
  await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
  await page.locator('#calendar').screenshot({ path: fileURLToPath(new URL(`../screenshots/planner-sage-${state}-${width}-calendar.png`, import.meta.url)) });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: fileURLToPath(new URL(`../screenshots/planner-sage-${state}-${width}.png`, import.meta.url)) });
  await page.screenshot({ path: fileURLToPath(new URL(`../screenshots/planner-sage-${state}-${width}-full.png`, import.meta.url)), fullPage: true });
}
try {
  for (const layout of ['month']) {
    await page.goto(`${url}?layout=${layout}`);
    await day('10').waitFor();
    await page.locator('#new-range').click();
    await day('10').click();
    assert.equal(await page.locator('#range-through').innerText(), 'Choose end');
    await day('20').click();
    assert.deepEqual(await range(), Array.from({ length: 11 }, (_, i) => String(i + 10)));
    assert.equal(await page.locator('#plan-description').innerText(), '5 teaching days · 6 holidays');
    await page.locator('#review').click();
    const totals = () => page.locator('.subject-hours').evaluateAll(rows => Object.fromEntries(rows.map(row => [row.dataset.code, row.querySelector('strong').textContent])));
    assert.deepEqual(await totals(), { '21CSC202J': '3h', '21CSC201J': '5h', '21CSC302J': '5h', '21MAB204T': '4h', '21LEM202T': '2h' });
    console.log(`${layout}: click 10 → 20 filled 10,11,12,13,14,15,16,17,18,19,20; 5 teaching dates; 6 holidays excluded.`);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [390, 1280]) {
      await captureBand(width, '10-20');
      await assertBand(['10', '12', '19'], ['11', '18', '20']);
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: fileURLToPath(new URL(`../screenshots/planner-${layout}-${width}.png`, import.meta.url)) });
      await page.screenshot({ path: fileURLToPath(new URL(`../screenshots/planner-${layout}-${width}-full.png`, import.meta.url)), fullPage: true });
    }
    await page.locator('#new-range').click();
    await day('20').click(); await day('10').click();
    assert.deepEqual(await range(), Array.from({ length: 11 }, (_, i) => String(i + 10)));
    await page.locator('#review').click();
    await day('15').click();
    assert.equal(await day('15').getAttribute('aria-pressed'), 'false');
    assert.match(await page.locator('#plan-description').innerText(), /4 teaching days/);
    assert.deepEqual(await totals(), { '21CSC202J': '2h', '21CSC201J': '4h', '21CSC302J': '4h', '21MAB204T': '3h', '21LEM202T': '2h' });
    assert.equal(await page.locator('#calculation-context').innerText(), '6 holidays · 1 date excluded');
    for (const width of [390, 1280]) {
      await captureBand(width, 'exclude15');
      await assertBand(['10', '12', '16', '19'], ['11', '14', '18', '20']);
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: fileURLToPath(new URL(`../screenshots/planner-${layout}-${width}-exclude15.png`, import.meta.url)) });
      await page.screenshot({ path: fileURLToPath(new URL(`../screenshots/planner-${layout}-${width}-exclude15-full.png`, import.meta.url)), fullPage: true });
      if (layout === 'month') {
        await page.locator('#calendar').screenshot({ path: fileURLToPath(new URL(`../screenshots/planner-classpro-detail-${width}.png`, import.meta.url)) });
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: fileURLToPath(new URL(`../screenshots/planner-classpro-${width}.png`, import.meta.url)) });
        await page.screenshot({ path: fileURLToPath(new URL(`../screenshots/planner-classpro-${width}-full.png`, import.meta.url)), fullPage: true });
      }
    }
    await day('15').click();
    assert.equal(await day('15').getAttribute('aria-pressed'), 'true');
    await assertBand(['10', '12', '19'], ['11', '18', '20']);
    console.log(`${layout}: reverse 20 → 10 and remove/restore 15 passed.`);
  }
} finally { await browser.close(); }
