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

test('inline grade plans stay local, independent and current after refresh', { timeout: 25000 }, async context => {
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
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  await page.route('**/api/**', route => { calls++; return route.fulfill({ json: {} }); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?preview=home#marks`);
  const plan = page.locator('.mark-plan[data-course="DS"]');
  const field = name => plan.locator(`[data-field="${name}"]`);
  const grade = name => plan.locator('.mark-grade-stops').getByRole('button', { name, exact: true });
  assert.equal(await plan.isVisible(), true);
  assert.equal(await page.locator('#marks-target-dialog, .marks-target-button').count(), 0);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await grade('A+').getAttribute('aria-pressed'), 'true');
  assert.match(await plan.locator('.mark-result-detail').innerText(), /Choose your marking scheme/);
  await field('scheme').selectOption('theory');
  await grade('O').click();
  assert.equal(await plan.locator('.mark-result-number').innerText(), 'Out of reach');
  await grade('A').click();
  assert.equal(await plan.locator('.mark-result-number').innerText(), '52.5');
  await field('grade').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await grade('A+').getAttribute('aria-pressed'), 'true');
  assert.equal(await field('grade').getAttribute('aria-valuetext'), 'A+, 81 out of 100');
  await plan.locator('.mark-custom-toggle').click();
  await field('target').fill('80');
  await field('expected').fill('999');
  assert.equal(await field('expected').getAttribute('aria-invalid'), 'true');
  await field('expected').fill('0');
  assert.equal(await plan.locator('.mark-plan-error').isHidden(), true);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
    assert.equal(await plan.evaluate(el => el.scrollWidth > el.clientWidth), false);
    assert.ok(await grade('O').evaluate(el => el.getBoundingClientRect().height >= 44));
  }
  await page.locator('.mark-course[data-course="DS"] > .course-details > summary').click();
  assert.equal(await page.locator('.mark-course[data-course="DS"] .assessment-row').count(), 2);
  await field('scheme').selectOption('custom');
  await field('internalMax').fill('40');
  assert.equal(await plan.locator('.mark-plan-error').isVisible(), true);
  await field('internalMax').fill('60');
  await field('examMax').fill('100');
  assert.equal(await plan.locator('.mark-result-number').innerText(), '92.5');
  assert.equal(await page.locator('.mark-plan[data-course="CN"] [data-field="scheme"]').inputValue(), '');
  await field('expected').focus();
  await page.evaluate(() => renderMarks({ data: [
    { code: 'DS', title: 'Data Structures', scored: 52, total: 60, components: [] },
    { code: 'CN', title: 'Computer Networks', scored: 40, total: 50, components: [] },
  ] }));
  assert.equal(await plan.locator('.mark-result-number').innerText(), '70');
  assert.equal(await field('expected').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('.mark-course[data-course="DS"] > details').getAttribute('open'), '');
  assert.match(await page.locator('.mark-course[data-course="DS"] .course-score').innerText(), /52/);
  await page.evaluate(() => renderMarks({ data: [{ code: 'CN', title: 'Computer Networks', scored: 40, total: 50 }] }));
  assert.equal(await plan.count(), 0);
  await page.evaluate(() => { anonMarksTarget.clear(); renderMarks({ data: [{ code: 'DS', title: 'Data Structures', scored: 52, total: 60 }] }); });
  assert.equal(await field('scheme').inputValue(), '');
  assert.equal(await grade('A+').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
  assert.equal(calls, 0, 'local target planning must not request the server');
});
