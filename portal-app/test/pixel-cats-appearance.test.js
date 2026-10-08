import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from 'cheerio';

const source = name => fs.readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const markup = source('index.html');
const css = source('pixel-cats.css');

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

test('Settings offers Cats alongside the original appearances', () => {
  const $ = load(markup);
  assert.deepEqual($('#settings-theme option').map((_, n) => $(n).attr('value')).get(), ['sage', 'sand', 'clay', 'cats']);
  assert.equal($('#settings-theme option[value="cats"]').text(), 'Cats');
  assert.equal($('link[href^="/pixel-cats.css"]').length, 1);
});

test('each appearance applies, survives reload, and clears without leaking into other themes', () => {
  const fixture = appearance();
  for (const theme of ['cats', 'sand', 'clay', 'sage', 'cats']) {
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

test('artwork stays local, static, lightweight, and has distinct mobile composition', () => {
  const drawings = ['pixel-cats-desktop.svg', 'pixel-cats-mobile.svg'].map(name => source(name));
  for (const drawing of drawings) {
    const $ = load(drawing, { xmlMode: true });
    assert.equal($('svg').attr('shape-rendering'), 'crispEdges');
    assert.ok($('title').text().length > 0);
    assert.equal($('script, image, foreignObject, animate, animateTransform, filter').length, 0);
    assert.doesNotMatch(drawing, /(?:href|src)=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    assert.ok(Buffer.byteLength(drawing) < 40_000, 'each drawing has a bounded transfer size');
  }
  assert.notEqual(drawings[0], drawings[1]);
  assert.match(css, /max-width:\s*700px/);
  assert.match(css, /pointer-events:\s*none/);
  assert.doesNotMatch(css, /@import|(?:animation|transition)\s*:|https?:/);
  for (const [, selector] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)) {
    if (selector.trim().startsWith('@')) continue;
    assert.ok(selector.includes('[data-accent="cats"]'), `theme rule must be scoped: ${selector.trim()}`);
  }
});

test('Cats reading colors and selected controls retain AA contrast', () => {
  const tokens = Object.fromEntries([...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
  const luminance = hex => hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  for (const [fg, bg] of [['ink', 'page'], ['muted', 'page'], ['muted', 'surface'], ['accent', 'soft'], ['on-accent', 'accent']]) {
    const values = [luminance(tokens[fg]), luminance(tokens[bg])].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${fg} on ${bg}`);
  }
});
