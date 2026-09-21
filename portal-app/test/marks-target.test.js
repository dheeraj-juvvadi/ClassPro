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

test('Grade presets use verified thresholds and preserve weighted targets', () => {
  const grades = Array.from(context.marksTargetMath.grades, ({ label, min }) => [label, min]);
  assert.deepEqual(grades, [['O', 91], ['A+', 81], ['A', 71], ['B+', 61], ['B', 56], ['C', 50]]);
  assert.equal(calculate({ target: grades[0][1] }).possible, false);
  assert.equal(calculate({ target: grades[1][1] }).required, 58.13);
  assert.equal(calculate({ target: grades[2][1], examMax: 40 }).required, 21);
});

test('course suffix and credit-weighted projection never invent missing credits', () => {
  const math = context.marksTargetMath;
  assert.equal(math.scheme('21CSC314P').internalMax, 100);
  assert.equal(math.scheme(' 21csc314p ').examMax, 0);
  assert.equal(math.scheme('21CSC301T').examMax, 75);
  assert.equal(math.projection([{ credits: 4, target: 91 }, { credits: 2, target: 71 }]).value, 56 / 6);
  assert.equal(math.projection([{ credits: 0, target: 50 }, { credits: 4, target: 81 }]).value, 9);
  assert.equal(math.projection([{ credits: 4, target: 91 }, { credits: 2, target: 0 }]).value, 40 / 6);
  assert.equal(math.projection([{ credits: 4, target: 91 }, { credits: 2, target: 0, excluded: true }]).value, 10);
  assert.equal(math.initialTarget({ code: 'CS1T', scored: 43, total: 50 }), 91);
  assert.equal(math.initialTarget({ code: 'CS1P', scored: 65, total: 80 }), 81);
  for (const credits of [undefined, null, '', 'N/A']) assert.equal(math.projection([{ credits, target: 81 }]).value, null);
  assert.equal(math.cumulative(8, 60, 9, 20).value, 8.25);
  assert.equal(math.cumulative(0, 0, 9, 20).value, 9);
  assert.equal(math.cumulative('', 60, 9, 20).value, null);
  assert.equal(math.cumulative(11, 60, 9, 20).value, null);
  assert.equal(math.cumulative(8, -1, 9, 20).value, null);
});

test('simple plans update projection and preserve inputs across report refresh', { timeout: 25000 }, async context => {
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
  await page.evaluate(() => renderMarks({ data: [
    { code: 'DS', title: 'Data Structures', scored: 43, total: 50, components: [{ name: 'Test', scored: 43, total: 50 }] },
    { code: '21CSC314P', title: 'Lab', scored: 65, total: 80 },
  ] }, { DS: { credits: 4 }, '21CSC314P': { credits: 2 } }));
  const plan = page.locator('.mark-plan[data-course="DS"]');
  const grade = name => plan.getByRole('button', { name, exact: true });
  const projection = page.locator('#marks-projection-value');
  assert.equal(await projection.textContent(), '9.67');
  const overall = page.getByRole('slider', { name: 'Overall grade target' });
  assert.equal(await overall.isVisible(), false);
  assert.equal(await page.locator('#marks-summary-gpa').innerText(), '9.67');
  await page.locator('.marks-projection-toggle').click();
  assert.equal(await overall.isVisible(), true);
  assert.equal(await overall.inputValue(), '6');
  assert.equal(await page.locator('#marks-overall-label').innerText(), 'Max possible');
  await overall.focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await projection.innerText(), '9.00');
  await page.keyboard.press('End');
  assert.equal(await projection.innerText(), '9.67');
  assert.equal(await page.locator('.mark-plan[data-course="21CSC314P"] .mark-plan-selected').innerText(), 'A+');
  await page.locator('#marks-current-cgpa').fill('8');
  await page.locator('#marks-completed-credits').fill('18');
  assert.equal(await page.locator('#marks-cgpa-value').innerText(), '8.42');
  assert.equal(await page.locator('.mark-plan select, .mark-custom-toggle, .mark-plan input[type="number"]').count(), 0);
  assert.equal(await plan.getAttribute('open'), null);
  await plan.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await plan.locator('.mark-result-number').innerText(), '71.25');
  await grade('O').click(); assert.equal(await projection.innerText(), '9.67');
  assert.equal(await page.locator('#marks-cgpa-value').innerText(), '8.42');
  assert.equal(await plan.locator('.mark-result-number').innerText(), '71.25');
  await plan.locator('[data-field="expected"]').evaluate(input => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await plan.locator('.mark-result-number').innerText(), 'Out of reach');
  const lab = page.locator('.mark-plan[data-course="21CSC314P"]');
  await lab.locator('summary').click();
  assert.equal(await lab.locator('.mark-scheme-label').innerText(), 'Internal only');
  assert.equal(await lab.locator('.mark-result-number').innerText(), '16');
  assert.match(await lab.locator('.mark-result-detail').innerText(), /no final exam/);
  await plan.locator('[data-field="grade"]').focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await grade('A+').getAttribute('aria-pressed'), 'true');
  assert.equal(await projection.innerText(), '9.00');
  await lab.locator('.mark-include input').uncheck();
  assert.equal(await projection.innerText(), '9.00');
  await grade('O').click();
  assert.equal(await projection.innerText(), '10.00');
  await grade('A+').click();
  await lab.locator('.mark-include input').check();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
    assert.equal(await plan.evaluate(el => el.scrollWidth > el.clientWidth), false);
    assert.ok(await grade('O').evaluate(el => el.getBoundingClientRect().height >= 44));
  }
  await page.locator('.mark-course[data-course="DS"] > .course-details > summary').click();
  await plan.locator('[data-field="expected"]').focus();
  await page.evaluate(() => renderMarks({ data: [
    { code: 'DS', title: 'Data Structures', scored: 52, total: 60, credits: 4 },
    { code: '21CSC314P', title: 'Lab', scored: 65, total: 80, credits: 2 },
  ] }));
  assert.equal(await plan.getAttribute('open'), '');
  assert.equal(await plan.locator('.mark-result-number').innerText(), '54.38');
  assert.equal(await page.locator('.mark-course[data-course="DS"] > .course-details').getAttribute('open'), '');
  await page.evaluate(() => renderMarks({ data: [{ code: 'DS', title: 'Data Structures', scored: 52, total: 60 }] }));
  assert.equal(await projection.innerText(), '—');
  assert.match(await page.locator('#marks-projection-note').innerText(), /credits unavailable/);
  await page.evaluate(() => anonMarksTarget.clear());
  assert.equal(await page.locator('#marks-projection').isHidden(), true);
  assert.equal(await page.locator('#marks-current-cgpa').inputValue(), '');
  assert.deepEqual(errors, []);
  assert.equal(calls, 0, 'local planning must not request the server');
});
