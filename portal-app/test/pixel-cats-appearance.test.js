import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from 'cheerio';
import express from 'express';
import { chromium, devices } from 'playwright';
import { fileURLToPath } from 'node:url';

const source = name => fs.readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const markup = source('index.html');
const css = source('appearance-scenes.css');
const themes = ['sage', 'cats'];

function appearance(storage = new Map()) {
  const $ = load(markup), wrappers = new WeakMap();
  const wrap = node => {
    if (!node) return null;
    if (wrappers.has(node)) return wrappers.get(node);
    const events = new Map();
    const item = {
      node, checked: false,
      get textContent() { return $(node).text(); },
      set textContent(value) { $(node).text(value); },
      get value() { return $(node).val() || ''; },
      set value(value) { $(node).val(value); },
      get hidden() { return $(node).is('[hidden]'); },
      set hidden(value) { value ? $(node).attr('hidden', '') : $(node).removeAttr('hidden'); },
      set id(value) { $(node).attr('id', value); },
      set className(value) { $(node).attr('class', value); },
      set innerHTML(value) { $(node).html(value); },
      get firstElementChild() { return wrap($(node).children()[0]); },
      setAttribute(key, value) { $(node).attr(key, value); },
      querySelector(selector) { return wrap($(node).find(selector)[0]); },
      querySelectorAll(selector) { return $(node).find(selector).toArray().map(wrap); },
      replaceChildren() { $(node).empty(); },
      classList: { add(value) { $(node).addClass(value); } },
      dataset: new Proxy({}, {
        get(_, key) { return $(node).attr(`data-${key}`); },
        set(_, key, value) { $(node).attr(`data-${key}`, value); return true; },
      }),
      addEventListener(name, fn) { events.set(name, fn); },
      emit(name) { return events.get(name)?.({ target: item, preventDefault() {} }); },
    };
    for (const method of ['append', 'prepend', 'before', 'after']) {
      item[method] = child => $(node)[method](child.node);
    }
    wrappers.set(node, item);
    return item;
  };
  const get = id => wrap($(`#${id}`)[0]);
  const context = vm.createContext({
    document: { body: wrap($('body')[0]), getElementById: get, createElement: tag => wrap($(`<${tag}></${tag}>`)[0]) },
    MutationObserver: class { observe() {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    anonFeedback: { setHaptics() {}, success() {} },
    anonHome: { reminders() {}, profile() {}, scheduleIdentity() {} },
    courseDetails: { clean: value => value || '' },
  });
  vm.runInContext(source('settings.js'), context);
  const update = () => context.anonSettings.update({ profile: { regNo: 'pixel-cats-fixture' }, attendance: { data: [] }, marks: { data: [] } });
  update();
  return { get, storage, context, update, accent: () => context.document.body.dataset.accent };
}

test('Settings offers only Wildflower and Catnap Alley', () => {
  const $ = load(markup);
  assert.deepEqual($('#settings-theme option').map((_, n) => $(n).attr('value')).get(), themes);
  assert.equal($('link[href^="/appearance-scenes.css"]').length, 1);
  assert.deepEqual($('#settings-theme option').map((_, n) => $(n).text()).get(), ['Wildflower', 'Catnap Alley']);
});

test('retired and unknown saved themes return to Wildflower without losing preferences', () => {
  for (const theme of ['sunrise', 'sunset', 'moonlight', 'sand', 'clay', 'invalid']) {
    const original = appearance();
    const key = [...original.storage.keys()][0];
    original.storage.set(key, JSON.stringify({ prefs: { theme, name: 'Mira', haptics: false } }));
    const reloaded = appearance(original.storage);
    assert.equal(reloaded.accent(), 'sage');
    assert.equal(reloaded.get('settings-theme').value, 'sage');
    const saved = JSON.parse(reloaded.storage.get(key)).prefs;
    assert.equal(saved.theme, 'sage');
    assert.equal(saved.name, 'Mira');
    assert.equal(saved.haptics, false);
  }
});

test('each appearance applies, survives reload, and clears without leaking into other themes', () => {
  const fixture = appearance();
  for (const theme of [...themes, 'sage']) {
    fixture.get('settings-theme').value = theme;
    fixture.get('settings-theme').emit('change');
    assert.equal(fixture.accent(), theme, `${theme} applies from the real Settings control`);
    const reloaded = appearance(fixture.storage);
    assert.equal(reloaded.accent(), theme, `${theme} survives Settings initialization`);
    assert.equal(reloaded.get('settings-theme').value, theme);
  }
  fixture.get('settings-reset').emit('click');
  assert.equal(fixture.accent(), 'sage');
  assert.equal(fixture.storage.size, 0);
  fixture.get('settings-theme').value = 'cats';
  fixture.get('settings-theme').emit('change');
  fixture.context.anonSettings.clear();
  assert.equal(fixture.accent(), 'sage');
});

test('Catnap Alley and the original florals remain available offline', () => {
  const worker = source('service-worker.js');
  for (const theme of themes.filter(theme => theme !== 'sage')) {
    const filename = `scene-${theme}.svg`, drawing = source(filename);
    const $ = load(drawing, { xmlMode: true });
    assert.equal($('svg').attr('shape-rendering'), theme === 'cats' ? 'crispEdges' : undefined);
    assert.equal($('svg').attr('viewBox'), theme === 'cats' ? '0 0 480 84' : '0 0 1440 300');
    assert.ok($('title').text().length > 0);
    assert.equal($('script, image, foreignObject, animate, animateTransform, filter').length, 0);
    assert.ok(Buffer.byteLength(drawing) < 110_000);
    assert.ok(worker.includes(`/${filename}`), `${theme} is cached offline`);
  }
  assert.ok(worker.includes('/floral-screenprint.svg'));
  assert.ok(worker.includes('/floral-mobile.svg'));
  assert.doesNotMatch(worker, /scene-(?:sunrise|sunset|moonlight|sand|clay)\.svg/);
  assert.doesNotMatch(css, /main::before|@import|(?:animation|transition)\s*:/);
  assert.match(css, /mask-image:\s*linear-gradient/);
  assert.match(css, /background-position:\s*80% top/);
});

test('pixel Anon keeps an accessible name and a sleeping cat only in Catnap Alley', () => {
  const $ = load(markup);
  assert.equal($('.brand .brand-name').text(), 'Anon');
  assert.equal($('.brand .brand-pixel').attr('aria-hidden'), 'true');
  assert.equal($('.brand .brand-pixel').attr('src'), '/anon-pixel.svg');
  assert.match(css, /body\[data-accent="cats"\] \.brand::after/);
  assert.match(css, /anon-sleeping-cat\.svg/);
  assert.equal(load(source('anon-sleeping-cat.svg'), { xmlMode: true })('svg').attr('shape-rendering'), 'crispEdges');
  assert.match(css, /forced-colors/);
});

test('all scene palettes retain readable text and selected controls', () => {
  const luminance = hex => hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const common = { ink: '#f3ece0', 'on-accent': '#24212a' };
  for (const theme of themes.filter(theme => theme !== 'sage')) {
    const body = css.match(new RegExp(`body\\[data-accent="${theme}"\\] \\{([^}]+)`))[1];
    const tokens = { ...common, ...Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]])) };
    for (const [fg, bg] of [['ink', 'page'], ['muted', 'page'], ['muted', 'surface'], ['accent', 'soft'], ['on-accent', 'accent']]) {
      const [hi, lo] = [luminance(tokens[fg]), luminance(tokens[bg])].sort((a, b) => b - a);
      assert.ok((hi + .05) / (lo + .05) >= 4.5, `${theme}: ${fg} on ${bg}`);
    }
  }
});

test('Catnap recolors app surfaces, planners and timetable, then restores Wildflower', { timeout: 30000 }, async t => {
  const app = express(); app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  await page.goto(`http://127.0.0.1:${server.address().port}/?preview=home#settings`);
  await page.locator('#settings-theme').selectOption('cats');
  const styles = await page.evaluate(() => {
    const read = (selector, property = 'backgroundColor') => getComputedStyle(document.querySelector(selector))[property];
    const result = {
      home: read('.next-class-card'), attendance: read('.attendance-rows'), marks: read('.marks-list'),
      assessment: read('.assessment-row'), grade: read('.grade-course'),
      marksText: read('.mini-score', 'color'), settingsInput: read('#settings-display-name'),
    };
    dateAttendance.open();
    result.dialog = read('#projection-dialog');
    result.plannerInput = read('#projection-from');
    result.plannerArt = getComputedStyle(document.querySelector('#projection-dialog'), '::before').backgroundImage;
    document.querySelector('#projection-dialog').close();
    return result;
  });
  assert.equal(styles.home, 'rgb(191, 179, 199)');
  for (const key of ['attendance', 'marks', 'assessment', 'settingsInput']) assert.equal(styles[key], 'rgb(52, 53, 54)', key);
  assert.equal(styles.grade, 'rgb(46, 47, 49)');
  assert.equal(styles.marksText, 'rgb(229, 226, 221)');
  for (const key of ['dialog', 'plannerInput']) assert.equal(styles[key], 'rgb(41, 42, 44)', key);
  assert.match(styles.plannerArt, /scene-cats\.svg/);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => {
      const bad = [];
      for (const destination of ['home', 'attendance', 'marks', 'grades', 'exams', 'calendar', 'schedule', 'settings']) {
        anonHome.navigate(destination);
        if (document.documentElement.scrollWidth > innerWidth) bad.push(destination);
      }
      return bad;
    });
    assert.deepEqual(overflow, [], `No page overflow at ${width}px`);
  }
  await page.locator('#settings-theme').selectOption('sage');
  const reset = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    card: getComputedStyle(document.querySelector('.next-class-card')).backgroundColor,
    marks: getComputedStyle(document.querySelector('.marks-list')).backgroundColor,
    cat: getComputedStyle(document.querySelector('.brand'), '::after').content,
    scene: getComputedStyle(document.querySelector('.botanical-backdrop')).backgroundImage,
  }));
  assert.equal(reset.body, 'rgb(25, 27, 25)');
  assert.equal(reset.card, 'rgb(197, 212, 167)');
  assert.equal(reset.marks, 'rgb(35, 39, 32)');
  assert.equal(reset.cat, 'none');
  assert.match(reset.scene, /floral-screenprint\.svg/);
  assert.deepEqual(errors, []);
});

test('Wildflower retains its original mobile crop across pages and appearance switches', { timeout: 30000 }, async t => {
  const app = express(); app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  t.after(() => browser.close());
  const page = await browser.newPage({ ...devices['Pixel 7'] });
  await page.addInitScript(() => localStorage.setItem('anon.analytics-choice.v1', 'decline'));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const backdrop = () => page.evaluate(() => {
    const node = document.querySelector('.botanical-backdrop');
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    return {
      image: style.backgroundImage, size: style.backgroundSize, position: style.backgroundPosition,
      clip: style.clipPath, mask: style.maskImage, webkitMask: style.webkitMaskImage,
      overlay: getComputedStyle(node, '::after').content,
      height: box.height, width: box.width, viewportHeight: innerHeight, viewportWidth: innerWidth,
      top: box.top, left: box.left, display: style.display,
    };
  });
  await page.goto(origin);
  const login = await backdrop();
  assert.match(login.image, /floral-mobile\.svg/);
  assert.equal(login.size, '100% 100%');
  assert.equal(login.overlay, 'none');
  assert.equal(login.height, login.viewportHeight);

  await page.goto(`${origin}/?preview=home`);
  for (const width of [320, 360, 393, 412, 700, 701, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['sage', 'cats', 'sage']) {
      await page.evaluate(() => anonHome.navigate('settings'));
      await page.locator('#settings-theme').selectOption(theme);
      for (const destination of ['home', 'attendance', 'marks', 'settings']) {
        await page.evaluate(value => anonHome.navigate(value), destination);
        const style = await backdrop();
        const label = `${theme} ${destination} at ${width}px`;
        assert.equal(style.display, 'block', label);
        if (theme === 'cats') {
          assert.match(style.image, /scene-cats\.svg/, label);
          assert.equal(style.height, width <= 700 ? 170 : width >= 1000 ? 240 : 210, label);
          assert.match(style.mask, /linear-gradient/, label);
          assert.equal(style.clip, 'none', label);
          continue;
        }
        assert.match(style.image, width <= 700 ? /floral-mobile\.svg/ : /floral-screenprint\.svg/, label);
        assert.equal(style.size, width <= 700 ? '100% 100%' : 'cover', label);
        assert.equal(style.position, '50% 50%', label);
        // Effective app-surface.css cascade in the approved 4e7c3d2 version.
        const originalFade = 'linear-gradient(rgb(0, 0, 0) 0px, rgb(0, 0, 0) 60px, rgba(0, 0, 0, 0) 150px)';
        assert.equal(style.clip, 'none', label);
        assert.equal(style.mask, originalFade, label);
        assert.equal(style.webkitMask, originalFade, label);
        assert.equal(style.overlay, 'none', label);
        assert.equal(style.height, style.viewportHeight, label);
        assert.equal(style.width, style.viewportWidth, label);
        assert.equal(style.top, 0, label);
        assert.equal(style.left, 0, label);
      }
    }
  }
});
