import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const sandbox = vm.createContext({});
vm.runInContext(readFileSync(new URL('../public/academic-history-model.js', import.meta.url), 'utf8'), sandbox);
const history = { status: 'ready', source: 'Student Portal', currentCgpa: 8.25, completedCredits: 64,
  requiredCredits: 160, registeredCredits: 67, fetchedAt: '2026-09-20T10:00:00Z',
  semesters: [
    { semester: 1, period: 'DEC/2024', gpa: 7.5, credits: 22, earnedCredits: 22,
      courses: [{ code: 'CS1', title: 'Programming', credits: 4, grade: 'A' }, { code: 'NC1', title: 'Community', credits: 0, grade: 'O' }] },
    { semester: 2, period: 'MAY/2025', gpa: 8.1, credits: 22, earnedCredits: 19,
      courses: [{ code: 'CS2', title: '<img src=x onerror=alert(1)>', credits: 3, grade: 'F' }] },
    { semester: 3, period: 'NOV/2025', gpa: 9.1, credits: 23, earnedCredits: 23,
      courses: [{ code: 'CS3', title: 'Networks', credits: 4, grade: 'O' }] },
  ] };

test('history uses official totals and calculates only descriptive insights', () => {
  const model = sandbox.academicHistoryModel.analyze(history);
  assert.equal(model.currentCgpa, 8.25);
  assert.equal(model.completedCredits, 64);
  assert.equal(model.best.semester, 3);
  assert.equal(model.progress, 40);
  assert.equal(model.remaining, 96);
  assert.ok(Math.abs(model.change - 1.6) < .00001);
  assert.equal(model.semesters[0].courses[1].credits, 0);
  const partial = sandbox.academicHistoryModel.analyze({ semesters: [{ semester: 1, courses: [] }] });
  assert.equal(partial.currentCgpa, null);
  assert.equal(partial.semesters[0].gpa, null);
  assert.equal(partial.change, null);
  assert.equal(sandbox.academicHistoryModel.analyze({ currentCgpa: 12, completedCredits: -2 }).completedCredits, null);
});

test('compact journey, keyboard expansion, auto-fill, safe text, refresh and mobile layout', { timeout: 30000 }, async context => {
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
  await page.goto(`http://127.0.0.1:${server.address().port}/?preview=home#grades`);
  assert.equal(await page.locator('#grades-view #academic-history').count(), 1);
  assert.equal(await page.locator('#marks-panel #academic-history').count(), 0);
  await page.evaluate(() => { location.hash = 'marks'; });
  await page.waitForFunction(() => document.body.dataset.page === 'marks');
  assert.equal(await page.locator('#grades-view').isHidden(), true);
  await page.locator('#planner-menu > summary').click();
  await page.getByRole('button', { name: 'Grade calculator', exact: true }).click();
  assert.equal(new URL(page.url()).hash, '#grades');
  assert.equal(await page.title(), 'Grade calculator · Anon');
  assert.equal(await page.locator('#grades-title').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('#planner-menu').getAttribute('open'), null);
  await page.evaluate(() => anonSettings.update({ connections: { portal: { connected: true } }, academicHistory: { status: 'unavailable' } }));
  assert.match(await page.locator('#academic-history').innerText(), /Student Portal is connected/);
  assert.doesNotMatch(await page.locator('#academic-history').innerText(), /Connect Student Portal/);
  await page.evaluate(history => anonSettings.update({ profile: {}, academicHistory: history }), history);
  const journey = page.locator('#academic-history');
  assert.match(await journey.innerText(), /8.25/);
  assert.match(await journey.innerText(), /40% of credits earned/);
  assert.equal(await journey.isVisible(), true);
  assert.equal(await journey.locator('.journey-details').getAttribute('open'), null);
  assert.ok(await journey.evaluate(el => el.getBoundingClientRect().height < 320));
  assert.equal(await page.locator('#marks-current-cgpa').inputValue(), '8.25');
  assert.equal(await page.locator('#marks-completed-credits').inputValue(), '64');
  await journey.locator('.journey-details > summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await journey.locator('svg[role="img"]').count(), 1);
  const semester = journey.locator('.journey-semester').nth(1);
  await semester.locator('summary').click();
  assert.match(await semester.innerText(), /<img src=x onerror=alert\(1\)>/);
  assert.equal(await semester.locator('img').count(), 0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
    assert.equal(await journey.evaluate(el => el.scrollWidth > el.clientWidth), false);
  }
  await page.locator('.marks-projection-toggle').click();
  await page.locator('#marks-current-cgpa').fill('8.4');
  await page.evaluate(history => anonSettings.update({ profile: { currentCgpa: 8.25, completedCredits: 64 }, academicHistory: { ...history, stale: true } }), history);
  assert.equal(await page.locator('#marks-current-cgpa').inputValue(), '8.4');
  assert.equal(await semester.getAttribute('open'), '');
  assert.match(await journey.locator('.journey-notice').innerText(), /last saved/);
  await page.evaluate(() => anonAcademicHistory.render({ status: 'empty', semesters: [] }));
  assert.match(await journey.innerText(), /haven’t been published/);
  await page.evaluate(() => { anonAcademicHistory.clear(); anonMarksTarget.clear(); });
  assert.equal(await journey.innerText(), '');
  assert.equal(await page.locator('#marks-current-cgpa').inputValue(), '');
  assert.deepEqual(errors, []); assert.equal(calls, 0);
});
