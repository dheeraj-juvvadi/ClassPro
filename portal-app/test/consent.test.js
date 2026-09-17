import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('optional analytics wait for consent and stop after withdrawal', { timeout: 20000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const scripts = [];
  await page.route('**/_vercel/**', route => {
    scripts.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: '' });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/privacy.html`);
  await page.locator('.consent-banner').waitFor({ state: 'visible' });
  assert.equal(scripts.length, 0);
  await page.getByRole('button', { name: 'Essential only', exact: true }).click();
  await page.reload();
  assert.equal(await page.locator('.consent-banner').isHidden(), true);
  assert.equal(scripts.length, 0);
  await page.locator('[data-consent-open]').click();
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('script[src*="/_vercel/"]').length === 2);
  assert.equal(await page.evaluate(() => localStorage.getItem('anon.analytics-choice.v1')), 'allow');
  const cleaned = await page.evaluate(() => vaq.find(entry => entry[0] === 'beforeSend')[1]({ url: `${location.origin}/?private=example#secret` }));
  assert.ok(!cleaned.url.includes('?') && !cleaned.url.includes('#'));
  await page.locator('[data-consent-open]').click();
  await page.getByRole('button', { name: 'Essential only', exact: true }).click();
  assert.equal(await page.evaluate(() => vaq.find(entry => entry[0] === 'beforeSend')[1]({ url: location.href })), null);
  assert.equal(await page.evaluate(() => siq.find(entry => entry[0] === 'beforeSend')[1]({ url: location.href })), null);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
});
