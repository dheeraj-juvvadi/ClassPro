import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../public/marks-target-math.js', import.meta.url), 'utf8'), context);
const calculate = input => context.marksTargetMath.calculate({ scored: 42, recorded: 50, internalMax: 60, examMax: 75, expected: 8, target: 80, ...input });
test('weighted target rounds upward and distinguishes impossible and internal-only outcomes', () => {
  assert.equal(calculate({}).required, 56.25);
  assert.equal(calculate({ target: 50.001 }).required, 0.01);
  assert.equal(calculate({ target: 95 }).possible, false);
  assert.equal(calculate({ target: 95 }).ceiling, 90);
  assert.equal(calculate({ target: 95 }).best, 92);
  assert.equal(calculate({ examMax: 40 }).required, 30);
  const internal = calculate({ scored: 65, recorded: 80, internalMax: 100, examMax: 0, expected: 17, target: 80 });
  assert.equal(internal.internalOnly, true);
  assert.equal(internal.projected, 82);
  assert.equal(internal.possible, true);
  assert.equal(calculate({ target: 45 }).required, 0);
});
test('marks planner rejects unavailable marks, wrong schemes and out-of-range assumptions', () => {
  for (const input of [{ scored: null }, { recorded: '' }, { scored: 'N/A' }, { expected: '' },
    { scored: 51 }, { internalMax: 40 }, { expected: 11 }, { target: 101 }, { target: -1 },
    { internalMax: 0 }, { examMax: 0 }, { expected: Infinity }]) {
    assert.equal(calculate(input).valid, false, JSON.stringify(input));
  }
  assert.equal(calculate({ scored: '42.5', expected: '7.5' }).required, 56.25);
});

test('ClassPro grade presets use verified thresholds and preserve weighted targets', () => {
  const grades = Array.from(context.marksTargetMath.grades, ({ label, min }) => [label, min]);
  assert.deepEqual(grades, [['O', 91], ['A+', 81], ['A', 71], ['B+', 61], ['B', 56], ['C', 50]]);
  assert.equal(calculate({ target: grades[0][1] }).possible, false);
  assert.equal(calculate({ target: grades[1][1] }).required, 58.13);
  assert.equal(calculate({ target: grades[2][1], examMax: 40 }).required, 21);
});

test('marks target dialog remains local, accessible and responsive', { timeout: 20000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(4000);
  const errors = []; let calls = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => { calls++; return route.fulfill({ json: {} }); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?preview=home`);
  await page.locator('button[data-page="marks"]').click();
  await page.locator('.course-details > summary').first().click();
  const trigger = page.locator('.marks-target-button').first();
  await trigger.click();
  const grade = name => page.locator('#target-grade-options').getByRole('button', { name, exact: true });
  assert.equal(await page.locator('#target-grade-options button').count(), 7);
  assert.equal(await grade('A+').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#target-scheme').evaluate(el => el === document.activeElement), true);
  assert.match(await page.locator('#marks-target-result').innerText(), /Choose your marking scheme/);
  await page.selectOption('#target-scheme', 'theory');
  await grade('O').click();
  assert.equal(await page.locator('#target-total').inputValue(), '91');
  assert.match(await page.locator('#marks-target-result').innerText(), /Beyond this scenario/);
  assert.match(await page.locator('#target-grade-help').innerText(), /91/);
  await grade('A').click();
  assert.equal(await grade('A').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#marks-target-result').innerText(), /52.5 \/ 75 in the final/);
  await grade('Custom').click();
  assert.equal(await page.locator('#target-total').isVisible(), true);
  assert.equal(await page.locator('#target-total').evaluate(el => el === document.activeElement), true);
  await page.locator('#target-total').fill('80');
  assert.equal(await grade('Custom').getAttribute('aria-pressed'), 'true');
  await page.locator('#target-expected').fill('999');
  assert.equal(await page.locator('#target-expected').getAttribute('aria-invalid'), 'true');
  await page.locator('#target-expected').fill('0');
  assert.equal(await page.locator('#marks-target-error').isHidden(), true);
  await grade('A+').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#target-total').inputValue(), '81');
  assert.equal(await page.locator('#target-total-field').isHidden(), true);
  await page.keyboard.press('Escape');
  await trigger.click();
  assert.equal(await grade('A+').getAttribute('aria-pressed'), 'true', 'grade target survives reopening');
  await grade('Custom').click();
  await page.locator('#target-total').fill('80');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.locator('#marks-target-dialog').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: innerWidth, overflow: el.scrollWidth > el.clientWidth };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.width && !layout.overflow, JSON.stringify(layout));
    assert.ok(await grade('O').evaluate(el => el.getBoundingClientRect().height >= 44));
  }
  await page.keyboard.press('Escape');
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
  await trigger.click();
  assert.equal(await page.locator('#target-scheme').inputValue(), 'theory');
  await page.selectOption('#target-scheme', 'custom');
  await page.locator('#target-internal-max').fill('40');
  assert.equal(await page.locator('#marks-target-error').isVisible(), true);
  await page.locator('#target-internal-max').fill('60');
  await page.locator('#target-exam-max').fill('100');
  assert.match(await page.locator('#marks-target-result').innerText(), /92.5 \/ 100 in the final/);
  await page.evaluate(() => anonMarksTarget.update([{ code: 'DS', title: 'Data Structures', scored: 52, total: 60 }]));
  assert.match(await page.locator('#marks-target-recorded').innerText(), /52 \/ 60/);
  assert.match(await page.locator('#marks-target-result').innerText(), /70 \/ 100 in the final/);
  await page.evaluate(() => anonMarksTarget.update([{ code: 'CS201', title: 'Updated marks', scored: 52, total: 60 }]));
  assert.equal(await page.locator('#marks-target-dialog').isHidden(), true, 'removed courses must close their outdated plan');
  await trigger.click();
  await page.evaluate(() => anonMarksTarget.clear());
  await trigger.click();
  assert.equal(await page.locator('#target-scheme').inputValue(), '', 'clearing the session must clear plans');
  assert.equal(await grade('A+').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#target-total').inputValue(), '81');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  assert.equal(calls, 0, 'local target planning must not request the server');
});
