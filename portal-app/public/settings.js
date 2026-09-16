'use strict';
globalThis.anonSettings = (() => {
  const get = id => document.getElementById(id);
  let report = {}, storageKey = '', prefs = {}, previous = null, history = [];
  const el = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
  const tell = text => { get('settings-message').textContent = text; };
  function save() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ prefs, history })); }
    catch { tell('Browser storage is unavailable. Changes will last for this visit.'); }
  }
  function apply() {
    document.body.dataset.accent = ['sand', 'slate'].includes(prefs.theme) ? prefs.theme : 'sage';
    get('settings-theme').value = document.body.dataset.accent;
    get('settings-notifications').checked = prefs.notifications === true && globalThis.Notification?.permission === 'granted';
    const name = prefs.name || report.profile?.name || '';
    get('settings-name').textContent = name || 'Your space.';
    get('settings-avatar').textContent = name.slice(0, 1).toUpperCase() || 'A';
    get('settings-display-name').value = prefs.name || '';
    get('settings-program').textContent = courseDetails.clean(report.profile?.program);
    classproHome.profile({ ...report.profile, name });
  }
  function renderHistory() {
    history = history.filter(item => Number.isFinite(item.time) && item.time > Date.now() - 48 * 3600000).slice(0, 40);
    get('settings-history').replaceChildren();
    for (const item of history) {
      const row = el('p', item.text);
      row.append(el('small', new Date(item.time).toLocaleString('en', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' IST'));
      get('settings-history').append(row);
    }
    if (!history.length) get('settings-history').append(el('p', 'Changes detected during this visit appear here.'));
  }
  function update(data) {
    report = data;
    const identity = String(data.profile?.regNo || data.profile?.name || 'session');
    let hash = 2166136261;
    for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    const key = `anon.settings.v1.${hash}`;
    if (key !== storageKey) {
      storageKey = key; prefs = {}; history = []; previous = null;
      try {
        const stored = JSON.parse(localStorage.getItem(key) || '{}');
        prefs = stored.prefs && typeof stored.prefs === 'object' ? stored.prefs : {};
        if (typeof prefs.name !== 'string') prefs.name = '';
        history = Array.isArray(stored.history) ? stored.history.filter(item => item && typeof item.text === 'string') : [];
      } catch {}
    }
    const snapshot = {
      attendance: JSON.stringify((data.attendance?.data || []).map(c => [c.code, c.present, c.conducted])),
      marks: JSON.stringify(data.marks?.data || []),
    };
    const changes = previous ? ['attendance', 'marks'].filter(kind => snapshot[kind] !== previous[kind] && !data[kind]?.error) : [];
    if (changes.length) {
      history.unshift({ time: Date.now(), text: `${changes.map(kind => kind === 'marks' ? 'Marks' : 'Attendance').join(' and ')} updated` });
      if (prefs.notifications && globalThis.Notification?.permission === 'granted') {
        try { new Notification('Anon updated', { body: 'New attendance or marks are available.', tag: 'anon-report-update' }); } catch {}
      }
    }
    for (const kind of ['attendance', 'marks']) if (data[kind]?.error && previous) snapshot[kind] = previous[kind];
    previous = snapshot; renderHistory(); save(); apply();
    const time = new Date(data.updatedAt);
    get('settings-last-sync').textContent = Number.isNaN(time.getTime()) ? 'Your cached data stays available.' : `Updated ${time.toLocaleString('en', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} IST`;
    const courses = get('settings-courses'); courses.replaceChildren();
    for (const course of data.attendance?.data || []) {
      const row = document.createElement('div'); row.className = 'settings-course';
      row.append(el('strong', course.title || course.code), el('small', [course.code, course.faculty, course.room, course.credits && `${course.credits} credits`].map(courseDetails.clean).filter(Boolean).join(' · ')));
      courses.append(row);
    }
    if (!courses.childElementCount) courses.append(el('p', 'Course details will appear after your reports sync.'));
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
    get('settings-sync').disabled = true; get('settings-sync').classList.add('syncing'); tell('');
    try { await loadReports({ force: true }); tell('Your data is up to date.'); }
    catch (error) { tell(error.message || 'Could not sync. Try again.'); }
    finally { get('settings-sync').disabled = false; get('settings-sync').classList.remove('syncing'); }
  });
  get('settings-clear-history').addEventListener('click', () => { history = []; save(); renderHistory(); tell('History cleared.'); });
  get('settings-reset').addEventListener('click', () => {
    try { if (storageKey) localStorage.removeItem(storageKey); } catch {}
    prefs = {}; history = []; renderHistory(); apply(); tell('Local preferences and history reset.');
  });
  get('settings-signout').addEventListener('click', () => { get('accounts-dialog').close(); get('logout').click(); });
  return { update, clear() {
    report = {}; storageKey = ''; prefs = {}; history = []; previous = null;
    document.body.dataset.accent = 'sage';
    for (const id of ['settings-name', 'settings-program', 'settings-courses', 'settings-history', 'settings-message']) get(id).replaceChildren();
    get('settings-display-name').value = '';
  } };
})();
