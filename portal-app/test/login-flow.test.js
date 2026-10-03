import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('email-first login keeps the existing authentication lifecycle', { timeout: 90000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function open(subtest, handler = () => null, session = { authenticated: false, authMode: 'http' }) {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    subtest.after(() => page.close());
    const calls = [];
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body = request.postData() ? request.postDataJSON() : null;
      calls.push({ path, body, method: request.method() });
      const response = await handler({ path, body, method: request.method() });
      if (response) return route.fulfill(response);
      if (path === '/api/session') return route.fulfill({ json: session });
      if (path === '/api/challenge') return route.fulfill({ json: body?.provider === 'portal'
        ? { required: true, serverAuto: true, image: 'data:image/png;base64,dGVzdA==' } : { required: false } });
      if (path === '/api/login/client') return route.fulfill({ json: { authenticated: true } });
      return route.fulfill({ json: { attendance: { data: [] }, marks: { data: [] },
        connections: { academia: { connected: true }, portal: { connected: true } } } });
    });
    await page.goto(origin);
    await page.locator('#login-view').waitFor({ state: 'visible' });
    return { page, calls };
  }
  async function expand(page, account = 'student@srmist.edu.in') {
    await page.locator('#account').fill(account);
    await page.locator('#account').press('Enter');
    await page.locator('#password').waitFor({ state: 'visible' });
  }
  const submissions = calls => calls.filter(call => call.path === '/api/login/client');

  await context.test('Continue is local, Change preserves same-account values, reset returns to email', async subtest => {
    const { page, calls } = await open(subtest);
    assert.equal(await page.locator('#account').getAttribute('type'), 'email');
    assert.equal(await page.locator('#password').isVisible(), false);
    assert.equal(await page.locator('#sign-in-label').innerText(), 'Continue');
    assert.notEqual(await page.evaluate(() => document.activeElement.id), 'account');
    await page.locator('#account').fill('invalid');
    await page.locator('#sign-in').click();
    assert.equal(await page.locator('#password').isVisible(), false);
    await expand(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'password');
    assert.equal(await page.locator('#login-account-summary').innerText(), 'student@srmist.edu.in');
    assert.equal(await page.locator('#account').isVisible(), false);
    assert.equal(calls.some(call => call.path !== '/api/session'), false);
    await page.locator('#password').fill(' literal secret ');
    await page.locator('#password-toggle').click();
    await page.locator('#remember').uncheck();
    await page.locator('#login-change-account').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'account');
    await page.locator('#account').press('Enter');
    assert.equal(await page.locator('#password').inputValue(), ' literal secret ');
    assert.equal(await page.locator('#password').getAttribute('type'), 'password');
    assert.equal(await page.locator('#remember').isChecked(), false);
    await page.locator('#login-form').evaluate(form => form.reset());
    assert.equal(await page.locator('#account').inputValue(), '');
    assert.equal(await page.locator('#password').isVisible(), false);
    assert.equal(await page.locator('#sign-in-label').innerText(), 'Continue');
    assert.equal(submissions(calls).length, 0);
  });

  await context.test('both literal passwords reach auth and real busy state recovers after errors', async subtest => {
    let failed = true;
    const { page, calls } = await open(subtest, ({ path }) => path === '/api/login/client' && failed
      ? { status: 502, json: { error: { code: 'PORTAL_UNAVAILABLE', message: 'Try again later.' } } } : null);
    await expand(page);
    const academia = '  academia\tsecret  ';
    const portal = '  ';
    await page.locator('#password').fill(academia);
    await page.locator('#portal-password').fill(portal);
    await page.locator('#sign-in').click();
    await page.locator('#login-message').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#sign-in').isEnabled(), true);
    assert.equal(await page.locator('#login-change-account').isEnabled(), true);
    assert.equal(await page.locator('#login-form').getAttribute('aria-busy'), 'false');
    assert.equal(await page.locator('#password').inputValue(), academia);
    assert.equal(await page.locator('#portal-password').inputValue(), portal);
    assert.deepEqual(submissions(calls).map(call => [call.body.provider, call.body.password]), [
      ['academia', academia], ['portal', portal],
    ]);
    assert.equal(await page.locator('#sign-in-status').innerText(), '');
    failed = false;
    await page.locator('#sign-in').click();
    await page.locator('#home-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#password').inputValue(), '');
    assert.equal(await page.locator('#portal-password').inputValue(), '');
    assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /academia.*secret/);
  });

  await context.test('accepted Academia stays connected through Portal CAPTCHA retries', async subtest => {
    const { page, calls } = await open(subtest, ({ path, body }) => path === '/api/login/client'
      && body.provider === 'portal' && !body.answer
      ? { status: 401, json: { error: { code: 'CAPTCHA_REQUIRED', message: 'Enter the code.',
        image: 'data:image/png;base64,dGVzdA==' } } } : null);
    await expand(page);
    await page.locator('#password').fill('academia secret');
    await page.locator('#portal-password').fill('portal secret');
    await page.locator('#sign-in').click();
    await page.locator('#manual-captcha-answer').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.getElementById('sign-in').disabled);
    assert.equal(await page.locator('#password').inputValue(), '');
    assert.equal(await page.locator('#password').isDisabled(), true);
    assert.equal(await page.locator('#password').evaluate(field => field.required), false);
    assert.equal(await page.locator('#portal-password').evaluate(field => field.required), true);
    assert.equal(await page.locator('#portal-password').inputValue(), 'portal secret');
    await page.locator('#login-change-account').click();
    await page.locator('#account').press('Enter');
    assert.equal(await page.locator('#password').isDisabled(), true);
    await page.locator('#manual-captcha-answer').fill('AB12');
    await page.locator('#sign-in').click();
    await page.locator('#home-view').waitFor({ state: 'visible' });
    assert.deepEqual(submissions(calls).map(call => call.body.provider), ['academia', 'portal', 'portal']);
    assert.equal(submissions(calls).at(-1).body.answer, 'AB12');
    assert.equal(calls.some(call => call.method === 'DELETE'), false);
  });

  await context.test('changing a partial account requires both passwords and delegates session reset to auth', async subtest => {
    const { page, calls } = await open(subtest, ({ path, body }) => path === '/api/login/client'
      && body.account === 'student@srmist.edu.in' && body.provider === 'portal'
      ? { status: 401, json: { error: { code: 'CAPTCHA_REQUIRED', message: 'Enter the code.',
        image: 'data:image/png;base64,dGVzdA==' } } } : null);
    await expand(page);
    await page.locator('#password').fill('first academia');
    await page.locator('#portal-password').fill('first portal');
    await page.locator('#sign-in').click();
    await page.locator('#manual-captcha-answer').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.getElementById('sign-in').disabled);
    await page.locator('#login-change-account').click();
    await expand(page, 'other@srmist.edu.in');
    for (const id of ['password', 'portal-password']) {
      assert.equal(await page.locator(`#${id}`).isEnabled(), true);
      assert.equal(await page.locator(`#${id}`).evaluate(field => field.required), true);
      assert.equal(await page.locator(`#${id}`).inputValue(), '');
    }
    assert.equal(await page.locator('#manual-captcha-answer').isVisible(), false);
    assert.equal(calls.some(call => call.method === 'DELETE'), false, 'Change itself is local');
    await page.locator('#password').fill('second academia');
    await page.locator('#portal-password').fill('second portal');
    await page.locator('#sign-in').click();
    await page.locator('#home-view').waitFor({ state: 'visible' });
    assert.equal(calls.filter(call => call.method === 'DELETE').length, 1);
    assert.deepEqual(submissions(calls).slice(-2).map(call => [call.body.account, call.body.provider]), [
      ['other@srmist.edu.in', 'academia'], ['other@srmist.edu.in', 'portal'],
    ]);
  });
});
