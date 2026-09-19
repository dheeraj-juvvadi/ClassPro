'use strict';

globalThis.createSchedulePreferences = ({ onChange }) => {
  const root = document.getElementById('schedule-choices');
  let source = null, excluded = new Set(), storageKey = '', loaded = '', storageFailed = false;
  const key = entry => JSON.stringify([entry.dayOrder || entry.day, entry.code, entry.start, entry.end, entry.hours || '', entry.batch || '', entry.allocation || '']);
  const make = (tag, text, cls = '') => { const el = document.createElement(tag); el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  function save() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify([...excluded])); storageFailed = false; }
    catch { storageFailed = true; }
  }
  function reconcile() {
    if (!source) return;
    const valid = new Set(source.entries.map(key));
    excluded = new Set([...excluded].filter(id => valid.has(id)));
  }
  function render() {
    const focus = root.contains(document.activeElement) ? document.activeElement.dataset.period : null;
    root.replaceChildren();
    const entries = [...(source?.entries || [])].sort((a, b) => String(a.dayOrder || a.day).localeCompare(String(b.dayOrder || b.day), 'en', { numeric: true }) || a.start.localeCompare(b.start));
    if (!entries.length) root.append(make('p', 'No timetable available. Sync your Academia connection to load it.', 'schedule-choice-empty'));
    let order = null, group;
    for (const entry of entries) {
      const name = entry.dayOrder ? `Day order ${entry.dayOrder}` : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][entry.day];
      if (name !== order) { order = name; group = make('section', undefined, 'schedule-choice-group'); group.append(make('h2', name)); root.append(group); }
      const id = key(entry), row = make('label', undefined, 'schedule-choice-row');
      const checkbox = make('input'); checkbox.type = 'checkbox'; checkbox.checked = !excluded.has(id); checkbox.dataset.period = id;
      checkbox.setAttribute('aria-label', `Include ${entry.title || entry.code}, ${name}, ${entry.start} to ${entry.end}`);
      const info = make('span'); info.append(make('strong', entry.title || entry.code), make('small', [entry.code, entry.room, entry.batch].filter(Boolean).join(' · ')));
      const time = make('span', `${entry.start}–${entry.end}`, 'schedule-choice-time');
      row.dataset.included = String(checkbox.checked);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) excluded.delete(id); else excluded.add(id);
        save(); render(); onChange();
      });
      row.append(checkbox, info, time); group.append(row);
    }
    document.getElementById('schedule-choice-status').textContent = entries.length
      ? `${entries.length - excluded.size} of ${entries.length} periods included. Choices apply to each matching day order on this browser.` : '';
    if (storageFailed) document.getElementById('schedule-choice-status').textContent += ' Storage is unavailable; these choices last for this visit.';
    if (focus) [...root.querySelectorAll('input')].find(el => el.dataset.period === focus)?.focus({ preventScroll: true });
  }
  document.getElementById('schedule-include-all').addEventListener('click', () => { excluded.clear(); save(); render(); onChange(); });
  return {
    identity(profile) {
      const identity = profile?.regNo || profile?.name;
      if (!identity || loaded === identity) return;
      loaded = identity;
      let hash = 2166136261;
      for (const char of String(identity)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
      storageKey = `anon.schedule.v1.${hash}`; excluded = new Set(); storageFailed = false;
      try { const stored = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(stored)) excluded = new Set(stored.filter(x => typeof x === 'string').slice(0, 1000)); } catch {}
      reconcile(); render(); onChange();
    },
    update(data) { source = data; reconcile(); render(); },
    apply(data) { return data ? { ...data, entries: data.entries.filter(entry => !excluded.has(key(entry))) } : data; },
    render,
    clear() { source = null; excluded = new Set(); storageKey = ''; loaded = ''; storageFailed = false; root.replaceChildren(); },
  };
};
