import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('issue submission confirms only accepted reports and public pages fit mobile', { timeout: 25000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let accepted = 0, requests = [];
  await page.route('**/api/client-events', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 202, json: { accepted } });
  });
  await page.goto(origin + '/thank-you.html');
  assert.equal(await page.locator('#issue-thanks-confirmed').isHidden(), true);
  await page.goto(origin + '/report-issue.html');
  await page.selectOption('#issue-category', 'LAYOUT_PROBLEM');
  await page.selectOption('#issue-page', 'home');
  await page.locator('#issue-send').click();
  await page.waitForFunction(() => document.querySelector('#issue-status').textContent.includes('wasn’t saved'));
  assert.ok(page.url().endsWith('/report-issue.html'));
  await page.context().setOffline(true);
  await page.locator('#issue-send').click();
  assert.match(await page.locator('#issue-status').innerText(), /offline/);
  assert.equal(requests.length, 1);
  await page.context().setOffline(false);
  accepted = 1;
  await page.locator('#issue-send').click();
  await page.waitForURL('**/thank-you.html');
  assert.equal(await page.locator('#issue-thanks-confirmed').isVisible(), true);
  assert.deepEqual(Object.keys(requests[1].events[0]).sort(), ['code', 'kind', 'page', 'release', 'viewport']);
  assert.equal(requests[1].events[0].code, 'LAYOUT_PROBLEM');
  for (const path of ['privacy.html', 'terms.html', 'report-issue.html', 'thank-you.html', '404.html']) {
    await page.goto(origin + '/' + path);
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, path + ' at ' + width);
    }
    assert.ok(await page.locator('meta[property="og:image"]').getAttribute('content'));
  }
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: false, authMode: 'http' } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await page.locator('#login-view').waitFor({ state: 'visible' });
  const signIn = await page.locator('#sign-in').boundingBox();
  assert.ok(signIn.y >= 0 && signIn.y + signIn.height <= 844, JSON.stringify(signIn));
  await page.setViewportSize({ width: 320, height: 568 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'small phone login');
  assert.equal(await page.locator('#sign-in-label').innerText(), 'Continue');
  assert.equal(await page.locator('#password').isVisible(), false);
  await page.locator('#account').focus();
  assert.equal(await page.locator('#sign-in').evaluate(el => getComputedStyle(el).position), 'relative');
  await page.locator('#account').blur();
  await page.evaluate(() => { document.querySelector('.consent-banner').hidden = false; });
  assert.equal(await page.locator('#sign-in').evaluate(el => getComputedStyle(el).position), 'relative');
  await page.getByRole('button', { name: 'Essential only', exact: true }).click();
  const smallCTA = await page.locator('#sign-in').boundingBox();
  assert.ok(smallCTA.y + smallCTA.height <= 568, JSON.stringify(smallCTA));
  assert.equal(await page.locator('#sign-in').isVisible(), true);
});
