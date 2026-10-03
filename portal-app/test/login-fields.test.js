import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const passwordIds = ['password', 'portal-password'];

async function assertReveal(page, id, visible) {
  assert.equal(await page.locator(`#${id}`).getAttribute('type'), visible ? 'text' : 'password');
  const toggle = page.locator(`#${id}-toggle`);
  assert.equal(await toggle.innerText(), visible ? 'Hide' : 'Show');
  assert.equal(await toggle.getAttribute('aria-pressed'), String(visible));
  assert.equal(await toggle.getAttribute('aria-controls'), id);
  assert.equal(await toggle.getAttribute('type'), 'button');
  assert.match(await toggle.getAttribute('aria-label'), visible ? /^Hide\b/ : /^Show\b/);
}

async function capsKey(page, id, active, type = 'keydown') {
  await page.locator(`#${id}`).evaluate((field, state) => {
    const event = new KeyboardEvent(state.type, { key: 'a', bubbles: true });
    // Do not depend on the host keyboard's physical Caps Lock state.
    Object.defineProperty(event, 'getModifierState', {
      value: key => key === 'CapsLock' && state.active,
    });
    field.dispatchEvent(event);
  }, { active, type });
}

async function resetForm(page) {
  await page.locator('#login-form').evaluate(form => form.reset());
}

async function expandLogin(page, account = 'synthetic@srmist.edu.in') {
  await page.locator('#account').fill(account);
  await page.locator('#sign-in').click();
  await page.locator('#password').waitFor({ state: 'visible' });
}

test('login fields preserve accessible native form behavior', { timeout: 60000 }, async context => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  context.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function openLogin(subtest, viewport = { width: 1280, height: 900 }, session = { authenticated: false, authMode: 'http' }, expanded = true) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    subtest.after(() => page.close());
    const requests = [];
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/session') return route.fulfill({ json: session });
      if (path === '/api/challenge') return route.fulfill({ json: route.request().postDataJSON().provider === 'portal'
        ? { required: true, serverAuto: true, image: 'data:image/png;base64,dGVzdA==' } : { required: false } });
      if (path === '/api/login/client') {
        requests.push(route.request().postDataJSON());
        return route.fulfill({ json: { authenticated: true } });
      }
      return route.fulfill({ json: { attendance: { data: [] }, marks: { data: [] },
        connections: { academia: { connected: true }, portal: { connected: true } } } });
    });
    await page.goto(origin);
    await page.locator('#login-view').waitFor({ state: 'visible' });
    if (expanded) await expandLogin(page);
    return { page, requests };
  }

  await context.test('keyboard reveals are independent and form reset remasks both', async subtest => {
    const { page, requests } = await openLogin(subtest);
    await page.locator('#password').fill('synthetic academia secret');
    await page.locator('#portal-password').fill('synthetic portal secret');
    for (const id of passwordIds) await assertReveal(page, id, false);
    await page.locator('#password').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'password-toggle');
    await page.keyboard.press('Enter');
    await assertReveal(page, 'password', true);
    await assertReveal(page, 'portal-password', false);
    await page.locator('#portal-password').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'portal-password-toggle');
    await page.keyboard.press('Space');
    await assertReveal(page, 'password', true);
    await assertReveal(page, 'portal-password', true);
    await page.locator('#password-toggle').press('Space');
    await assertReveal(page, 'password', false);
    await assertReveal(page, 'portal-password', true);
    await page.locator('#password-toggle').press('Enter');
    assert.equal(await page.locator('#password').inputValue(), 'synthetic academia secret');
    assert.equal(await page.locator('#portal-password').inputValue(), 'synthetic portal secret');
    assert.equal(requests.length, 0, 'reveal buttons never submit the form');
    await resetForm(page);
    for (const id of passwordIds) {
      await assertReveal(page, id, false);
      assert.equal(await page.locator(`#${id}`).inputValue(), '');
    }
  });

  await context.test('disabled passwords remask both reveals and clearing revealed values remasks', async subtest => {
    const { page, requests } = await openLogin(subtest);
    for (const focusedId of passwordIds) {
      for (const id of passwordIds) {
        await page.locator(`#${id}`).fill('synthetic busy secret');
        await page.locator(`#${id}-toggle`).click();
        await assertReveal(page, id, true);
      }
      await page.locator(`#${focusedId}`).focus();
      await capsKey(page, focusedId, true);
      assert.equal(await page.locator(`#${focusedId}-caps`).isVisible(), true);
      await page.evaluate(ids => {
        for (const id of ids) document.getElementById(id).disabled = true;
      }, passwordIds);
      await page.waitForFunction(ids => ids.every(id => document.getElementById(`${id}-toggle`).disabled), passwordIds);
      for (const id of passwordIds) {
        assert.equal(await page.locator(`#${id}-toggle`).isDisabled(), true);
        await assertReveal(page, id, false);
        assert.equal(await page.locator(`#${id}-caps`).isVisible(), false);
      }
      await page.evaluate(ids => {
        for (const id of ids) document.getElementById(id).disabled = false;
      }, passwordIds);
      await page.waitForFunction(ids => ids.every(id => !document.getElementById(`${id}-toggle`).disabled), passwordIds);
      for (const id of passwordIds) {
        assert.equal(await page.locator(`#${id}-toggle`).isEnabled(), true);
        await assertReveal(page, id, false);
        await page.locator(`#${id}-toggle`).click();
        await assertReveal(page, id, true);
        await page.locator(`#${id}`).fill('');
        await assertReveal(page, id, false);
      }
    }
    assert.equal(requests.length, 0, 'field lifecycle does not initiate sign-in');
  });

  await context.test('Caps Lock notes follow only the focused masked or revealed password', async subtest => {
    const { page } = await openLogin(subtest);
    for (const id of passwordIds) {
      const field = page.locator(`#${id}`);
      const note = page.locator(`#${id}-caps`);
      const otherId = passwordIds.find(value => value !== id);
      assert.equal(await note.getAttribute('role'), 'status');
      assert.ok((await field.getAttribute('aria-describedby')).split(/\s+/).includes(`${id}-caps`));
      assert.equal(await note.isVisible(), false);
      for (const revealed of [false, true]) {
        if (revealed) await page.locator(`#${id}-toggle`).click();
        await field.focus();
        await capsKey(page, id, true);
        await note.waitFor({ state: 'visible' });
        assert.equal(await page.locator(`#${otherId}-caps`).isVisible(), false);
        await capsKey(page, id, false, 'keyup');
        assert.equal(await note.isVisible(), false);
        await capsKey(page, id, true, 'keyup');
        assert.equal(await note.isVisible(), true);
        await page.locator('#login-change-account').focus();
        assert.equal(await note.isVisible(), false, 'blur clears Caps Lock status');
        await capsKey(page, id, true);
        assert.equal(await note.isVisible(), false, 'unfocused password events cannot show the note');
        await field.focus();
        await capsKey(page, id, true);
        await resetForm(page);
        assert.equal(await note.isVisible(), false, 'reset clears Caps Lock status');
        await assertReveal(page, id, false);
        await expandLogin(page);
      }
    }
  });

  await context.test('native email invalid state clears on input and reset', async subtest => {
    const { page, requests } = await openLogin(subtest, undefined, undefined, false);
    const account = page.locator('#account');
    const error = page.locator('#account-error');
    assert.equal(await error.isVisible(), false);
    assert.equal(await account.evaluate(field => field.required), true);
    assert.ok((await account.getAttribute('aria-describedby')).split(/\s+/).includes('account-error'));
    await page.locator('#sign-in').click();
    await error.waitFor({ state: 'visible' });
    assert.ok((await error.innerText()).trim());
    assert.equal(await account.getAttribute('aria-invalid'), 'true');
    assert.equal(requests.length, 0, 'native invalid account prevents sign-in');
    assert.equal(await account.getAttribute('type'), 'email');
    await account.fill('synthetic.netid');
    assert.equal(await account.evaluate(field => field.checkValidity()), false);
    for (const value of ['synthetic@srmist.edu.in']) {
      await account.fill(value);
      assert.equal(await account.evaluate(field => field.checkValidity()), true, `${value} is valid natively`);
      assert.equal(await error.isVisible(), false);
      assert.notEqual(await account.getAttribute('aria-invalid'), 'true');
    }
    await account.fill('');
    assert.equal(await account.evaluate(field => field.checkValidity()), false);
    assert.equal(await error.isVisible(), true, 'native invalid event shows the inline error');
    await resetForm(page);
    assert.equal(await error.isVisible(), false);
    assert.notEqual(await account.getAttribute('aria-invalid'), 'true');
  });

  for (const id of passwordIds) {
    await context.test(`${id} alone cannot submit dual-account login`, async subtest => {
      const { page, requests } = await openLogin(subtest);
      for (const passwordId of passwordIds) {
        assert.equal(await page.locator(`#${passwordId}`).evaluate(field => field.required), true);
      }
      assert.equal(await page.locator('#login-form').evaluate(form => form.checkValidity()), false);
      await page.locator(`#${id}`).fill('synthetic password');
      await page.locator(`#${id}-toggle`).click();
      await page.locator('#sign-in').click();
      assert.equal(requests.length, 0, 'a missing password prevents network authentication');
      const otherId = passwordIds.find(value => value !== id);
      assert.equal(await page.locator(`#${otherId}-error`).isVisible(), true);
      assert.equal(await page.locator(`#${otherId}`).getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator(`#${id}`).inputValue(), 'synthetic password');
    });
  }

  await context.test('non-HTTP login keeps Academia required and the Portal password hidden', async subtest => {
    const { page, requests } = await openLogin(subtest, undefined, { authenticated: false }, false);
    await expandLogin(page, 'synthetic.netid');
    assert.equal(await page.locator('#password').evaluate(field => field.required), true);
    assert.equal(await page.locator('#portal-password-group').isVisible(), false);
    assert.equal(await page.locator('#portal-password-toggle').isVisible(), false);
    assert.equal(await page.locator('#manual-captcha-answer').isVisible(), true);
    assert.equal(await page.locator('#manual-captcha-answer').evaluate(field => field.required), true);
    assert.equal(await page.locator('#account').getAttribute('type'), 'text');
    await page.locator('#manual-captcha-answer').fill('AB12');
    assert.equal(await page.locator('#login-form').evaluate(form => form.checkValidity()), false,
      'non-HTTP login still requires the Academia password');
    await page.locator('#password').fill('synthetic manual secret');
    await page.locator('#password-toggle').click();
    await assertReveal(page, 'password', true);
    assert.equal(await page.locator('#login-form').evaluate(form => form.checkValidity()), true);
    await resetForm(page);
    await assertReveal(page, 'password', false);
    await expandLogin(page, 'synthetic.netid');
    assert.equal(await page.locator('#password').evaluate(field => field.required), true);
    assert.equal(await page.locator('#portal-password-group').isVisible(), false);
    assert.equal(requests.length, 0);
  });

  for (const width of [320, 390, 1280]) {
    await context.test(`filled fields and 44px reveal targets fit a ${width}px viewport`, async subtest => {
      const { page } = await openLogin(subtest, { width, height: 900 }, undefined, false);
      await page.evaluate(() => document.fonts.ready);
      for (const id of ['account', ...passwordIds]) {
        if (id === 'password') await expandLogin(page);
        const field = page.locator(`#${id}`);
        const geometry = await field.evaluate(input => {
          const wrapper = input.closest('.login-field');
          const label = wrapper?.querySelector(`label[for="${input.id}"]`);
          const inputRect = input.getBoundingClientRect();
          const labelRect = label?.getBoundingClientRect();
          return {
            wrapped: Boolean(wrapper && label), left: inputRect.left, right: inputRect.right,
            stacked: Boolean(labelRect && labelRect.bottom <= inputRect.top),
            labelInside: Boolean(labelRect && labelRect.left >= inputRect.left && labelRect.right <= inputRect.right),
          };
        });
        assert.equal(geometry.wrapped, true, `${id} retains an associated label in its wrapper`);
        assert.equal(geometry.stacked, true, `${id} label is above its input`);
        assert.equal(geometry.labelInside, true, `${id} label fits the input width`);
        assert.ok(geometry.left >= 0 && geometry.right <= width, `${id} stays within the viewport`);
        await page.locator(`label[for="${id}"]`).click();
        assert.equal(await page.evaluate(() => document.activeElement.id), id, 'label still focuses its input');
      }
      for (const id of passwordIds) {
        for (const revealed of [false, true]) {
          if (revealed) await page.locator(`#${id}-toggle`).click();
          const box = await page.locator(`#${id}-toggle`).boundingBox();
          const inputBox = await page.locator(`#${id}`).locator('xpath=ancestor::div[contains(@class,"login-field")]').boundingBox();
          assert.ok(box.width >= 44 && box.height >= 44, `${id} ${revealed ? 'Hide' : 'Show'} target is at least 44px`);
          assert.ok(box.x >= inputBox.x && box.x + box.width <= inputBox.x + inputBox.width,
            `${id} reveal target fits inside its input`);
        }
      }
      await page.locator('#password').evaluate(field => field.checkValidity());
      await page.locator('#portal-password').focus();
      await capsKey(page, 'portal-password', true);
      assert.equal(await page.locator('#password-error').isVisible(), true);
      assert.equal(await page.locator('#portal-password-caps').isVisible(), true);
      const overflow = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
        form: document.querySelector('#login-form').scrollWidth,
        formWidth: document.querySelector('#login-form').clientWidth,
      }));
      assert.ok(overflow.page <= overflow.viewport, 'page has no horizontal overflow with field notes visible');
      assert.ok(overflow.form <= overflow.formWidth, 'login form has no horizontal overflow');
    });
  }
});
