'use strict';
globalThis.anonSettings = (() => {
  const get = id => document.getElementById(id);
  let report = {}, storageKey = '', prefs = {}, previous = null;
  const tell = text => { get('settings-message').textContent = text; };
  function save() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ prefs })); }
    catch { tell('Browser storage is unavailable. Changes will last for this visit.'); }
  }
  function apply() {
    document.body.dataset.accent = ['sand', 'clay'].includes(prefs.theme) ? prefs.theme : 'sage';
    get('settings-theme').value = document.body.dataset.accent;
    get('settings-notifications').checked = prefs.notifications === true && globalThis.Notification?.permission === 'granted';
    const name = prefs.name || report.profile?.name || '';
    get('settings-name').textContent = name || 'Your space.';
    get('settings-display-name').value = prefs.name || '';
    get('settings-program').textContent = courseDetails.clean(report.profile?.program);
    classproHome.profile({ ...report.profile, name });
  }
  function update(data) {
    report = data;
    const identity = String(data.profile?.regNo || data.profile?.name || 'session');
    let hash = 2166136261;
    for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    const key = `anon.settings.v1.${hash}`;
    if (key !== storageKey) {
      storageKey = key; prefs = {}; previous = null;
      try {
        const stored = JSON.parse(localStorage.getItem(key) || '{}');
        prefs = stored.prefs && typeof stored.prefs === 'object' ? stored.prefs : {};
        if (typeof prefs.name !== 'string') prefs.name = '';
      } catch {}
    }
    const snapshot = {
      attendance: JSON.stringify((data.attendance?.data || []).map(c => [c.code, c.present, c.conducted])),
      marks: JSON.stringify(data.marks?.data || []),
    };
    const changes = previous ? ['attendance', 'marks'].filter(kind => snapshot[kind] !== previous[kind] && !data[kind]?.error) : [];
    if (changes.length) {
      if (prefs.notifications && globalThis.Notification?.permission === 'granted') {
        try { new Notification('Anon updated', { body: 'New attendance or marks are available.', tag: 'anon-report-update' }); } catch {}
      }
    }
    for (const kind of ['attendance', 'marks']) if (data[kind]?.error && previous) snapshot[kind] = previous[kind];
    previous = snapshot; save(); apply();
    const time = new Date(data.updatedAt);
    get('settings-last-sync').textContent = Number.isNaN(time.getTime()) ? 'Your cached data stays available.' : `Updated ${time.toLocaleString('en', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} IST`;

  }
  get('settings-profile-form').addEventListener('submit', event => {
    event.preventDefault(); prefs.name = get('settings-display-name').value.trim().slice(0, 60);
    save(); apply(); tell('Display name saved on this browser.');
  });
  get('settings-theme').addEventListener('change', event => { prefs.theme = event.target.value; save(); apply(); });
  get('settings-notifications').addEventListener('change', async event => {
    const checked = event.target.checked;
    if (checked && !globalThis.Notification) { event.target.checked = false; tell('This browser does not support notifications.'); return; }
    if (checked) {
      try {
        if (await Notification.requestPermission() !== 'granted') { event.target.checked = false; tell('Notifications are blocked. You can change this in browser site settings.'); return; }
      } catch { event.target.checked = false; tell('Could not enable notifications on this browser.'); return; }
    }
    prefs.notifications = checked; save(); tell(checked ? 'Notifications enabled while Anon is open.' : 'Notifications disabled.');
  });
  get('settings-sync').addEventListener('click', async () => {
    if (get('settings-sync').disabled) return;
    tell('');
    try { await loadReports({ force: true }); tell('Your data is up to date.'); }
    catch (error) { tell(error.message || 'Could not sync. Try again.'); }

  });
  get('settings-reset').addEventListener('click', () => {
    try { if (storageKey) localStorage.removeItem(storageKey); } catch {}
    prefs = {}; apply(); tell('Local preferences reset.');
  });
  get('settings-signout').addEventListener('click', () => { get('accounts-dialog').close(); get('logout').click(); });
  return { update, clear() {
    report = {}; storageKey = ''; prefs = {}; previous = null;
    document.body.dataset.accent = 'sage';
    for (const id of ['settings-name', 'settings-program', 'settings-message']) get(id).replaceChildren();
    get('settings-display-name').value = '';
  } };
})();
