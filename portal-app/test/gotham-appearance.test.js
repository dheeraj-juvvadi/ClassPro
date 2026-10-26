import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'cheerio';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const source = name => fs.readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('Gotham ships a cached pixel scene and a scoped palette', () => {
  const css = source('gotham.css');
  const drawing = source('scene-gotham.svg');
  const $ = load(drawing, { xmlMode: true });
  assert.equal($('title').text(), 'Gotham');
  assert.equal($('svg').attr('viewBox'), '0 0 480 84');
  assert.equal($('svg > g').attr('shape-rendering'), 'crispEdges');
  assert.equal($('script, image, foreignObject, animate, animateTransform, filter').length, 0);
  assert.ok(Buffer.byteLength(drawing) < 110_000);
  assert.match(css, /--backdrop: url\('\/scene-gotham\.svg'\)/);
  assert.match(css, /body\[data-accent="cats"\]\[data-scene="gotham"\] \{/);
  assert.doesNotMatch(css, /\.botanical-backdrop \{[^}]*image-rendering:\s*auto/);
  assert.ok(source('service-worker.js').includes('/scene-gotham.svg'), 'Gotham is cached offline');
});

test('Gotham recolors home, attendance and marks, then clears back to Wildflower', { timeout: 40000 }, async t => {
  const app = express(); app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/?preview=home#settings`);
  await page.locator('#settings-theme').selectOption('gotham');

  const theme = () => page.evaluate(() => ({
    accent: document.body.dataset.accent, scene: document.body.dataset.scene ?? null,
    selected: document.querySelector('#settings-theme').value,
  }));
  assert.deepEqual(await theme(), { accent: 'cats', scene: 'gotham', selected: 'gotham' });

  const home = await page.evaluate(() => {
    const style = (selector, property = 'backgroundColor') => getComputedStyle(document.querySelector(selector))[property];
    const backdrop = document.querySelector('.botanical-backdrop'), computed = getComputedStyle(backdrop);
    return {
      image: computed.backgroundImage, rendering: computed.imageRendering, height: backdrop.getBoundingClientRect().height,
      mask: computed.maskImage, card: style('.next-class-card'),
      risk: [...document.querySelectorAll('.insight-card.risk .insight-percentage')].map(n => getComputedStyle(n).color),
      healthy: [...document.querySelectorAll('.insight-card:not(.risk) .insight-percentage')].map(n => getComputedStyle(n).color),
      cat: getComputedStyle(document.querySelector('.brand'), '::after').display,
    };
  });
  assert.match(home.image, /scene-gotham\.svg/);
  assert.equal(home.rendering, 'pixelated');
  assert.equal(home.height, 132);
  assert.match(home.mask, /linear-gradient/);
  assert.equal(home.card, 'rgb(201, 58, 51)');
  assert.ok(home.risk.length > 0, 'a risk insight card is present');
  assert.ok(home.healthy.length > 0, 'a healthy insight card is present');
  for (const color of home.risk) assert.equal(color, 'rgb(201, 58, 51)');
  for (const color of home.healthy) assert.equal(color, 'rgb(20, 20, 22)');
  assert.equal(home.cat, 'none');

  const attendance = await page.evaluate(() => {
    anonHome.navigate('attendance');
    const read = (selector, property) => getComputedStyle(document.querySelector(selector))[property];
    return {
      sheet: read('#attendance-panel .attendance-rows:not(.alert)', 'backgroundColor'),
      alert: read('#attendance-panel .attendance-rows.alert', 'backgroundColor'),
      alertHair: read('#attendance-panel .attendance-rows.alert', 'boxShadow'),
      good: read('#attendance-panel .attendance-row.good .attendance-margin-value strong', 'color'),
      risk: read('#attendance-panel .attendance-row.risk .attendance-margin-value strong', 'color'),
    };
  });
  assert.equal(attendance.sheet, 'rgb(20, 20, 22)');
  assert.equal(attendance.alert, 'rgb(42, 13, 16)');
  assert.match(attendance.alertHair, /rgba\(255, 90, 79, 0\.27\)/);
  assert.equal(attendance.good, 'rgb(236, 230, 230)');
  assert.equal(attendance.risk, 'rgb(255, 90, 79)');
  const marks = await page.evaluate(() => {
    anonHome.navigate('marks');
    return getComputedStyle(document.querySelector('#marks-panel .m2-list')).backgroundColor;
  });
  assert.equal(marks, 'rgb(20, 20, 22)');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'no horizontal overflow with Gotham at 390px');
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.scene === 'gotham');
  assert.deepEqual(await theme(), { accent: 'cats', scene: 'gotham', selected: 'gotham' });

  await page.evaluate(() => anonHome.navigate('settings'));
  await page.locator('#settings-theme').selectOption('sage');
  const cleared = await page.evaluate(() => ({
    accent: document.body.dataset.accent, scene: document.body.dataset.scene ?? null,
    image: getComputedStyle(document.querySelector('.botanical-backdrop')).backgroundImage,
  }));
  assert.deepEqual({ accent: cleared.accent, scene: cleared.scene }, { accent: 'sage', scene: null });
  assert.match(cleared.image, /floral-mobile\.svg/);
  assert.deepEqual(errors, []);
});
