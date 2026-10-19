import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('mini marks preserve pending, zero and labels while planning lives on its own page', { timeout: 25000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(4000);
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  const errors = []; let calls = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => { calls++; return route.fulfill({ json: {} }); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?preview=home#marks`);
  await page.locator('#marks-panel').waitFor();
  await page.evaluate(() => renderMarks({ data: [
    { code: 'DS', title: 'Data Structures', scored: 21, total: 50, credits: 4, components: [
      { name: 'FT-1', scored: 21, total: 25 }, { name: 'FT-2', scored: 0, total: 25 },
      { name: 'Assignment', scored: null, total: 10 },
    ] },
    { code: 'OS', title: 'Operating Systems', scored: 78, total: 105, credits: 4, components: [
      { name: 'Cycle test 1', scored: 18, total: 25 }, { name: 'Cycle test 2', scored: 21, total: 25 },
      { name: 'Lab evaluation', scored: 22, total: 25 }, { name: 'Quiz', scored: 9, total: 10 },
      { name: 'Assignment', scored: null, total: 10 }, { name: 'Viva', scored: 8, total: 10 },
    ] },
    { code: 'CN', title: 'Computer Networks', scored: null, total: null, components: [] },
  ] }));
  assert.equal(await page.locator('#marks-content .assessment-row').count(), 9);
  assert.equal(await page.locator('#marks-content .assessment-row [data-pending="true"]').count(), 2);
  assert.match(await page.locator('#marks-content .assessment-row').nth(1).innerText(), /FT-2\s*0\s*\/25/);
  const neutral = page.locator('#marks-content .m2.neutral .m-score');
  assert.equal((await neutral.innerText()).trim(), '—');
  assert.ok(Number.parseFloat(await neutral.evaluate(el => getComputedStyle(el).fontSize)) <= 18);
  assert.equal(await page.locator('#marks-content .mark-plan,#marks-content details').count(), 0);
  assert.equal(await page.locator('#academic-history').isVisible(), false);
  assert.equal(await page.locator('#grades-view').isVisible(), false);
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const result = await page.locator('#marks-content .assessment-row').evaluateAll(rows => ({
      heights: rows.map(row => row.getBoundingClientRect().height),
      clipped: rows.some(row => row.scrollWidth > row.clientWidth + 1),
      wrapped: rows.filter(row => {
        const name = row.querySelector('.assessment-name');
        return name && name.getClientRects().length > 1;
      }).length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(result.overflow, false); assert.equal(result.clipped, false);
    assert.equal(result.wrapped, 0);
    assert.equal(result.heights.length, 9);
    assert.ok(result.heights.every(height => height <= 36), JSON.stringify(result));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#planner-menu summary').click();
  await page.locator('#open-grades').click();
  assert.equal(await page.locator('#grades-view').isVisible(), true);
  assert.equal(await page.locator('#marks-panel').isVisible(), false);
  assert.equal(await page.locator('#grades-content .mark-plan').count(), 3);
  await page.goBack(); await page.locator('#marks-panel').waitFor();
  assert.equal(await page.locator('#grades-view').isVisible(), false);
  await page.evaluate(() => renderMarks({ data: [{ code: 'SPLIT', title: 'Split widths', scored: 5, total: 35,
    components: [
      { name: 'Narrow pending assessment', scored: null, total: 10 },
      { name: 'Wide scored assessment', scored: 5, total: 25 },
    ] }] }));
  const widths = await page.locator('#marks-content .assessment-row').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().width));
  assert.ok(widths[0] < widths[1] * 0.75, JSON.stringify(widths));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.evaluate(() => renderMarks({ data: [{ code: 'LONG', title: 'Networks', scored: 5, total: 10,
    components: [{ name: 'UnbrokenAssessmentLabelForNarrowScreenVerification', scored: 5, total: 10 }] }] }));
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const longName = await page.locator('#marks-content .assessment-name').evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    return {
      title: el.title, lines: range.getClientRects().length,
      ellipsis: getComputedStyle(el).textOverflow, height: el.getBoundingClientRect().height,
    };
  });
  assert.ok(longName.height <= 17, JSON.stringify(longName));
  assert.equal(longName.ellipsis, 'ellipsis');
  assert.equal(longName.title, 'UnbrokenAssessmentLabelForNarrowScreenVerification');
  assert.deepEqual(errors, []); assert.equal(calls, 0);
});
