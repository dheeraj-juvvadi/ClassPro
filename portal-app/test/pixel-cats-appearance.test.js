import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from 'cheerio';

const source = name => fs.readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const markup = source('index.html');
const css = source('appearance-scenes.css');
const themes = ['sage', 'sunrise', 'sunset', 'moonlight', 'sand', 'clay', 'cats'];

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

test('Settings offers the original florals and all six scenery choices', () => {
  const $ = load(markup);
  assert.deepEqual($('#settings-theme option').map((_, n) => $(n).attr('value')).get(), themes);
  assert.equal($('link[href^="/appearance-scenes.css"]').length, 1);
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

test('panoramas use distinct art styles and remain available in the offline shell', () => {
  const worker = source('service-worker.js');
  const styles = new Set();
  for (const theme of themes.filter(theme => theme !== 'sage')) {
    const filename = `scene-${theme}.svg`, drawing = source(filename);
    const $ = load(drawing, { xmlMode: true });
    styles.add($('svg').attr('data-art-style'));
    assert.equal($('svg').attr('shape-rendering'), theme === 'cats' ? 'crispEdges' : undefined);
    assert.equal($('svg').attr('viewBox'), theme === 'cats' ? '0 0 480 84' : '0 0 1440 300');
    assert.ok($('title').text().length > 0);
    assert.equal($('script, image, foreignObject, animate, animateTransform, filter').length, 0);
    assert.ok(Buffer.byteLength(drawing) < 110_000);
    assert.ok(worker.includes(`/${filename}`), `${theme} is cached offline`);
  }
  assert.equal(styles.size, 6, 'each scene has a different illustration style');
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
