import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { load } from 'cheerio';

const source = name => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const page = source('index.html');

// Exercise the real markup and controllers without launching a QA browser.
function settingsFixture({ permission = 'default', storageBlocked = false } = {}) {
  const $ = load(page), nodes = new WeakMap(), observers = [], storage = new Map();
  const calls = { notifications: [], permission: 0, history: [], reminders: [], logout: 0 };
  function wrap(node) {
    if (!node) return null;
    if (nodes.has(node)) return nodes.get(node);
    const events = new Map();
    const item = {
      node, checked: $(node).is('[checked]'), disabled: false,
      get textContent() { return $(node).text(); },
      set textContent(value) { $(node).text(value); },
      get id() { return $(node).attr('id'); },
      set id(value) { $(node).attr('id', value); },
      set className(value) { $(node).attr('class', value); },
      set innerHTML(value) { $(node).html(value); },
      get value() { return $(node).val() || ''; },
      set value(value) { $(node).val(value); },
      get hidden() { return $(node).is('[hidden]'); },
      set hidden(value) { if (value) $(node).attr('hidden', ''); else $(node).removeAttr('hidden'); },
      get firstElementChild() { return wrap($(node).children()[0]); },
      setAttribute(key, value) { $(node).attr(key, value); },
      getAttribute(key) { return $(node).attr(key) ?? null; },
      querySelector(selector) { return wrap($(node).find(selector)[0]); },
      querySelectorAll(selector) { return $(node).find(selector).toArray().map(wrap); },
      replaceChildren(...children) { $(node).empty(); item.append(...children); },
      classList: { add(name) { $(node).addClass(name); } },
      dataset: new Proxy({}, {
        get(_, key) { return $(node).attr(`data-${key}`); },
        set(_, key, value) { $(node).attr(`data-${key}`, String(value)); return true; },
      }),
      addEventListener(name, listener) { events.set(name, listener); },
      async emit(name) { await events.get(name)?.({ target: item, preventDefault() {} }); },
      click() { return item.emit('click'); },
      reset() {},
      showModal() { item.open = true; },
      close() { item.open = false; },
    };
    for (const method of ['append', 'prepend', 'before', 'after']) {
      item[method] = (...children) => { for (const child of children) $(node)[method](child.node); };
    }
    nodes.set(node, item); return item;
  }
  const get = id => wrap($(`#${id}`)[0]);
  class Notification {
    static permission = permission;
    static async requestPermission() { calls.permission++; return Notification.permission; }
    constructor(...args) { calls.notifications.push(args); }
  }
  const context = vm.createContext({
    document: { body: wrap($('body')[0]), getElementById: get, createElement: tag => wrap($(`<${tag}></${tag}>`)[0]) },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() { observers.push(this.callback); } },
    localStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key), setItem(key, value) {
      if (storageBlocked) throw new Error('Storage blocked'); storage.set(key, value);
    } },
    Notification,
    anonFeedback: { setHaptics(value) { calls.haptics = value; }, success() {} },
    anonHome: { reminders(value) { calls.reminders.push(value); }, profile(value) { calls.profile = value; }, scheduleIdentity() {} },
    anonMarksTarget: { history(value) { calls.targetProfile = value; } },
    anonAcademicHistory: { render(...args) { calls.history.push(args); } },
    courseDetails: { clean: value => value || '' }, loadReports: async () => ({}),
  });
  get('logout').addEventListener('click', () => { calls.logout++; });
  vm.runInContext(source('provider-connections.js'), context);
  vm.runInContext(source('settings.js'), context);
  const update = report => {
    context.anonSettings.update(report); context.providerConnections.update(report);
    observers.forEach(callback => callback());
  };
  return { get, calls, storage, context, update, Notification };
}

const report = (changes = {}) => ({
  profile: { regNo: 'settings-test-1', name: 'Mira Rao', program: 'Computer Science' },
  attendance: { data: [{ code: 'CS', present: 8, conducted: 10 }] }, marks: { data: [] },
  connections: { academia: { connected: true }, portal: { connected: true } },
  ...changes,
});

test('real profile edits survive refresh, remain local, reset and clear across accounts', async () => {
  const { get, calls, storage, update, context } = settingsFixture();
  update(report({ academicHistory: { currentCgpa: 8.2, completedCredits: 40 } }));
  assert.equal(get('settings-name').textContent, 'Mira Rao');
  assert.equal(get('settings-avatar').textContent, 'MR');
  assert.equal(get('settings-avatar').getAttribute('aria-hidden'), 'true');
  assert.equal(calls.targetProfile.currentCgpa, 8.2);
  assert.equal(calls.history.length, 1, 'existing academic history integration is still called');
  get('settings-display-name').value = 'Élodie O’Connor';
  await get('settings-display-name').emit('input');
  update(report());
  assert.equal(get('settings-display-name').value, 'Élodie O’Connor', 'refresh preserves the draft');
  await get('settings-profile-form').emit('submit');
  assert.equal(get('settings-name').textContent, 'Élodie O’Connor');
  assert.equal(get('settings-avatar').textContent, 'ÉO');
  assert.equal(calls.profile.name, 'Élodie O’Connor');
  assert.match(get('settings-name-feedback').textContent, /saved on this browser/);
  const key = [...storage.keys()][0];
  assert.equal(JSON.parse(storage.get(key)).prefs.name, 'Élodie O’Connor');
  context.anonSettings.clear(); update(report());
  assert.equal(get('settings-name').textContent, 'Élodie O’Connor');
  get('settings-theme').value = 'cats'; await get('settings-theme').emit('change');
  get('settings-haptics').checked = false; await get('settings-haptics').emit('change');
  assert.equal(context.document.body.dataset.accent, 'cats');
  assert.equal(calls.haptics, false);
  await get('settings-reset').click();
  assert.equal(get('settings-name').textContent, 'Mira Rao');
  assert.equal(get('settings-avatar').textContent, 'MR');
  assert.equal(context.document.body.dataset.accent, 'sage');
  assert.equal(calls.haptics, true);
  assert.equal(storage.has(key), false);
  assert.equal(get('settings-view').querySelector('a[href="/privacy.html"]').textContent, 'Manage');
  assert.match(get('settings-view').textContent, /encrypted on the server/);
  get('settings-display-name').value = '<img src=x onerror=alert(1)>';
  await get('settings-profile-form').emit('submit');
  assert.equal(get('settings-name').querySelector('img'), null, 'name is always text');
  get('settings-display-name').value = ''; await get('settings-profile-form').emit('submit');
  assert.equal(get('settings-name').textContent, 'Mira Rao', 'empty nickname uses the SRM name');
  update(report({ profile: { regNo: 'settings-test-2' } }));
  assert.equal(get('settings-name').textContent, 'Your space.');
  assert.equal(get('settings-avatar').hidden, true, 'missing identity never gets sample initials');
  await get('settings-signout').click(); assert.equal(calls.logout, 1);
  context.anonSettings.clear();
  assert.equal(get('settings-avatar').textContent, '');
});

test('failed local storage reports a visit-only name change', async () => {
  const { get, storage, update } = settingsFixture({ storageBlocked: true });
  update(report());
  get('settings-display-name').value = 'New name';
  await get('settings-profile-form').emit('submit');
  assert.equal(get('settings-name').textContent, 'New name');
  assert.match(get('settings-name-feedback').textContent, /for this visit/);
  assert.match(get('settings-message').textContent, /storage is unavailable/);
  assert.equal(storage.size, 0);
});

test('connection decoration keeps server states and original connect actions after rerender', async () => {
  const { get, update } = settingsFixture();
  update(report({ connections: { academia: { connected: true }, portal: { connected: true, expired: true } }, warnings: ['Portal session expired.'] }));
  let rows = get('provider-connections').querySelectorAll('.connection-row');
  assert.equal(rows[0].querySelector('.connection-state').dataset.connected, 'true');
  assert.equal(rows[0].querySelector('button'), null);
  assert.equal(rows[1].querySelector('.connection-state').textContent, 'Needs reconnection');
  assert.equal(rows[1].querySelector('.connection-state').dataset.connected, 'false');
  assert.match(get('provider-connections').textContent, /Portal session expired/);
  const reconnect = rows[1].querySelector('button');
  assert.equal(reconnect.textContent, 'Reconnect');
  assert.equal(reconnect.getAttribute('aria-label'), 'Reconnect Student Portal');
  await reconnect.click();
  assert.equal(get('connect-dialog').open, true);
  assert.equal(get('connect-title').textContent, 'Connect Student Portal');
  update(report({ connections: {} }));
  rows = get('provider-connections').querySelectorAll('.connection-row');
  assert.equal(rows[0].querySelector('.connection-state').textContent, 'Not connected');
  assert.equal(rows[0].querySelector('button').getAttribute('aria-label'), 'Connect Academia');
  await rows[0].querySelector('button').click();
  assert.equal(get('connect-title').textContent, 'Connect Academia');
  update(report());
  assert.equal(get('provider-connections').querySelectorAll('button').length, 0);
  assert.equal(get('provider-connections').querySelectorAll('.settings-provider-icon').length, 2);
});

test('notifications and reminders request permission only after explicit opt-in', async () => {
  const { get, calls, update, Notification } = settingsFixture({ permission: 'granted' });
  update(report());
  update(report({ attendance: { data: [{ code: 'CS', present: 9, conducted: 11 }] } }));
  assert.equal(calls.permission, 0);
  assert.equal(calls.notifications.length, 0);
  assert.equal(get('settings-notifications').checked, false);
  assert.equal(get('settings-reminders').checked, false);
  get('settings-notifications').checked = true; await get('settings-notifications').emit('change');
  assert.equal(calls.permission, 1);
  update(report());
  assert.equal(calls.notifications.length, 1);
  get('settings-reminders').checked = true; await get('settings-reminders').emit('change');
  assert.equal(calls.permission, 2);
  assert.equal(calls.reminders.at(-1), true);
  await get('settings-reset').click();
  assert.equal(get('settings-notifications').checked, false);
  assert.equal(get('settings-reminders').checked, false);
  assert.equal(calls.reminders.at(-1), false);
  Notification.permission = 'denied';
  get('settings-notifications').checked = true; await get('settings-notifications').emit('change');
  assert.equal(get('settings-notifications').checked, false);
  assert.match(get('settings-message').textContent, /blocked/);
  get('settings-reminders').checked = true; await get('settings-reminders').emit('change');
  assert.equal(get('settings-reminders').checked, false);
});
