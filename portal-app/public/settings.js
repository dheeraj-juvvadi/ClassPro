'use strict';
globalThis.anonSettings = (() => {
  const get = id => document.getElementById(id);
  let report = {}, storageKey = '', prefs = {}, previous = null, nameDirty = false;
  const tell = text => { get('settings-message').textContent = text; };
  const nameHint = 'Saved on this browser. Leave blank to use your SRM name.';
  function element(tag, className, text = '') {
    const node = document.createElement(tag); node.className = className; node.textContent = text;
    return node;
  }
  function nameFeedback(text, state = '') {
    get('settings-name-feedback').textContent = text;
    get('settings-name-feedback').dataset.state = state;
  }
  function preparePresentation() {
    const view = get('settings-view');
    view.querySelector('.settings-cover').append(element('p', 'settings-lead', 'A few things that make this space yours.'));
    const intro = view.querySelector('.settings-intro');
    intro.before(element('h2', 'settings-profile-title', 'Your profile'));
    const avatar = element('span', 'settings-avatar'); avatar.id = 'settings-avatar'; avatar.hidden = true;
    avatar.setAttribute('aria-hidden', 'true'); intro.prepend(avatar);
    const feedback = element('p', 'settings-name-feedback', nameHint); feedback.id = 'settings-name-feedback';
    feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true'); get('settings-profile-form').append(feedback);
    get('settings-display-name').setAttribute('aria-describedby', feedback.id);
    const connections = get('provider-connections');
    connections.before(element('p', 'settings-explainer', 'Connect both Academia and Student Portal to use the full app.'));
    const decorateConnections = () => {
      for (const row of connections.querySelectorAll('.connection-row')) {
        if (row.querySelector('.settings-provider-icon')) continue;
        const info = row.firstElementChild, title = info.querySelector('strong').textContent;
        const academia = title === 'Academia';
        const icon = element('span', 'settings-provider-icon'); icon.setAttribute('aria-hidden', 'true');
        // Static decorative artwork; account names and statuses remain text nodes.
        icon.innerHTML = academia
          ? '<svg viewBox="0 0 24 24"><path d="m3 9 9-5 9 5-9 5-9-5Zm4 3v5c3 3 7 3 10 0v-5M21 9v7"/></svg>'
          : '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M6 16c0-4 6-4 6 0m3-7h3m-3 4h3"/></svg>';
        row.prepend(icon); info.classList.add('settings-provider');
        info.querySelector('strong').after(element('span', 'settings-provider-detail', academia ? 'Courses & timetable' : 'Attendance & marks'));
        const button = row.querySelector('button');
        if (button) {
          button.setAttribute('aria-label', button.textContent);
          button.textContent = button.textContent.startsWith('Reconnect') ? 'Reconnect' : 'Connect';
        } else row.append(info.querySelector('.connection-state'));
      }
    };
    // The existing provider renderer refreshes these rows after Settings updates.
    new MutationObserver(decorateConnections).observe(connections, { childList: true });
    decorateConnections();
  }
  preparePresentation();
  function save() {
    if (!storageKey) return false;
    try { localStorage.setItem(storageKey, JSON.stringify({ prefs })); return true; }
    catch { tell('Browser storage is unavailable. Changes will last for this visit.'); return false; }
  }
  function apply() {
    document.body.dataset.accent = ['sand', 'clay'].includes(prefs.theme) ? prefs.theme : 'sage';
    get('settings-theme').value = document.body.dataset.accent;
    get('settings-haptics').checked = prefs.haptics !== false;
    anonFeedback.setHaptics(prefs.haptics !== false);
    get('settings-notifications').checked = prefs.notifications === true && globalThis.Notification?.permission === 'granted';
    get('settings-reminders').checked = prefs.reminders === true && globalThis.Notification?.permission === 'granted';
    anonHome.reminders(get('settings-reminders').checked);
    const name = String(prefs.name || report.profile?.name || '');
    get('settings-name').textContent = name || 'Your space.';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    get('settings-avatar').textContent = (parts.length > 1 ? [parts[0], parts.at(-1)] : parts)
      .map(part => Array.from(part)[0]).join('').toUpperCase();
    get('settings-avatar').hidden = !parts.length;
    if (!nameDirty) get('settings-display-name').value = prefs.name || '';
    get('settings-program').textContent = courseDetails.clean(report.profile?.program);
    anonHome.profile({ ...report.profile, name });
  }
  function update(data) {
    report = data;
    const academicProfile = { ...data.profile };
    for (const field of ['currentCgpa', 'completedCredits']) {
      if (typeof data.academicHistory?.[field] === 'number') academicProfile[field] = data.academicHistory[field];
    }
    globalThis.anonMarksTarget?.history(academicProfile);
    globalThis.anonAcademicHistory?.render(data.academicHistory || {}, academicProfile, data);
    anonHome.scheduleIdentity(data.profile);
    const identity = String(data.profile?.regNo || data.profile?.name || 'session');
    let hash = 2166136261;
    for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    const key = `anon.settings.v1.${hash}`;
    if (key !== storageKey) {
      storageKey = key; prefs = {}; previous = null; nameDirty = false;
      nameFeedback(nameHint);
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
    if (!get('settings-view').hidden) {
      tell(data.sync?.pending ? 'Sync queued. Your last data stays available while we refresh.'
        : data.warnings?.length || data.attendance?.error || data.marks?.error
          ? 'Some data could not refresh. Your last data is still available.' : 'Your data is up to date.');
    }

  }
  get('settings-display-name').addEventListener('input', () => {
    nameDirty = true;
    nameFeedback('Unsaved changes. Choose Save to update your display name.');
  });
  get('settings-profile-form').addEventListener('submit', event => {
    event.preventDefault(); prefs.name = get('settings-display-name').value.trim().slice(0, 60);
    const persisted = save(); nameDirty = false; apply();
    const message = persisted ? 'Display name saved on this browser.' : 'Display name updated for this visit. Browser storage is unavailable.';
    nameFeedback(message, persisted ? 'saved' : 'notice'); tell(message);
    anonFeedback.success(persisted ? 'Name saved.' : 'Name updated for this visit.');
  });
  get('settings-haptics').addEventListener('change', event => { prefs.haptics = event.target.checked; anonFeedback.setHaptics(prefs.haptics); save(); });
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
  get('settings-reminders').addEventListener('change', async event => {
    let enabled = event.target.checked;
    if (enabled) {
      try { enabled = !!globalThis.Notification && await Notification.requestPermission() === 'granted'; }
      catch { enabled = false; }
    }
    prefs.reminders = enabled;
    save(); apply();
    tell(enabled ? 'Class reminders enabled while Anon is open.' : 'Class reminders are off. Check browser permissions if you tried to enable them.');
  });
  get('settings-sync').addEventListener('click', async () => {
    if (get('settings-sync').disabled) return;
    tell('');
    try { const data = await loadReports({ force: true });
      if (data?.sync?.pending) tell('Sync queued. Your last data stays available while we refresh.');
      else if (data?.warnings?.length || data?.attendance?.error || data?.marks?.error) tell('Some data could not refresh. Your last data is still available.');
      else tell('Your data is up to date.');
    }
    catch (error) { tell(error.message || 'Could not sync. Try again.'); }

  });
  get('settings-reset').addEventListener('click', () => {
    try { if (storageKey) localStorage.removeItem(storageKey); } catch {}
    prefs = {}; nameDirty = false; apply(); nameFeedback(nameHint); tell('Local preferences reset.');
  });
  get('settings-signout').addEventListener('click', () => get('logout').click());
  return { update, clear() {
    report = {}; storageKey = ''; prefs = {}; previous = null; nameDirty = false;
    document.body.dataset.accent = 'sage';
    anonFeedback.setHaptics(true);
    for (const id of ['settings-name', 'settings-program', 'settings-message', 'settings-avatar']) get(id).replaceChildren();
    get('settings-avatar').hidden = true; nameFeedback(nameHint);
    get('settings-display-name').value = '';
  } };
})();
