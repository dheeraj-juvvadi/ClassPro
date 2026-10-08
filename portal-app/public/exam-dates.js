'use strict';

globalThis.anonExamDates = (() => {
  const get = id => document.getElementById(id);
  const model = anonScheduleModel;
  let report = null, period = '', connection = null;
  let request = null, generation = 0;
  const openedKey = 'anon.exams.opened.v1';
  let opened = false;
  try { opened = localStorage.getItem(openedKey) === '1'; } catch {}
  const shortcut = get('home-exam-link');
  shortcut.hidden = opened;
  function markOpened() {
    opened = true;
    shortcut.hidden = true;
    try { localStorage.setItem(openedKey, '1'); } catch {}
  }
  window.addEventListener('storage', event => {
    if (event.key === openedKey && event.newValue === '1') {
      opened = true; shortcut.hidden = true;
    }
  });
  const make = (tag, text, cls = '') => {
    const element = document.createElement(tag); element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const safeText = (value, max = 240) => typeof value === 'string' ? value.slice(0, max) : '';
  function normalize(data) {
    if (!data || !Array.isArray(data.entries) || data.entries.length > 160) return null;
    const entries = data.entries.filter(item => item && safeText(item.code) && safeText(item.title))
      .map(item => ({ code: safeText(item.code, 80), title: safeText(item.title),
        date: model.parse(item.date) ? item.date : null, session: safeText(item.session, 40),
        period: safeText(item.period, 12), periodLabel: safeText(item.periodLabel, 30),
        provisional: item.provisional !== false, stale: item.stale === true }));
    return { entries, stale: data.stale === true, provisional: data.provisional !== false,
      checkedAt: Number.isFinite(Date.parse(data.checkedAt)) ? data.checkedAt : null,
      source: safeText(data.source, 120) || 'Student Portal',
      sessions: Array.isArray(data.sessions) ? data.sessions.slice(0, 20).filter(item =>
        item && typeof item.value === 'string' && /^\d{1,2}_\d{4}$/.test(item.value)).map(item =>
        ({ value: item.value, label: safeText(item.label, 30) })) : [] };
  }
  function status(entries) {
    if (!report) {
      if (connection?.expired) return 'Reconnect Student Portal to check dates.';
      if (connection?.connected) return 'Dates have not been checked yet. Try Sync.';
      return 'Connect Student Portal to check dates.';
    }
    if (connection?.expired) return 'Reconnect Student Portal to refresh saved dates.';
    if (report.stale) return report.checkedAt ? 'Cached dates · latest check unavailable.' : 'Dates unavailable. Try Sync.';
    if (!entries.some(item => item.date)) return entries.length
      ? 'Subjects loaded · exam dates have not been published yet.'
      : 'Student Portal returned no exam subjects for this session.';
    return entries.some(item => item.provisional) ? 'Provisional dates' : 'Student Portal timetable';
  }
  function render() {
    const root = get('exam-list'); root.replaceChildren();
    get('exam-checked').textContent = report?.checkedAt ? `Last checked ${new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.checkedAt))} IST` : 'Not checked yet';
    get('exam-source').textContent = report ? report.source : '';
    const select = get('exam-period');
    const options = new Map((report?.sessions || []).map(item => [item.value, item.label]));
    for (const item of report?.entries || []) if (item.period) options.set(item.period, item.periodLabel || item.period);
    if (period && !options.has(period)) period = '';
    select.replaceChildren(new Option('All upcoming sessions', ''), ...[...options].map(([value, label]) => new Option(label, value)));
    select.value = period; get('exam-period-field').hidden = options.size < 2;
    const today = model.key(model.clock('Asia/Kolkata'));
    const entries = (report?.entries || []).filter(item => (!period || item.period === period) && (!item.date || item.date >= today));
    get('exam-status').textContent = status(entries);
    entries.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.title.localeCompare(b.title));
    for (const item of entries) {
      const row = make('article', undefined, 'exam-row');
      const info = make('div'); info.append(make('h2', item.title), make('p', [item.code, item.periodLabel].filter(Boolean).join(' · '), 'exam-meta'));
      const when = make('div', undefined, 'exam-when');
      if (item.date) {
        const date = model.parse(item.date), time = make('time', date.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }));
        time.dateTime = item.date; time.title = date.toLocaleDateString('en', { dateStyle: 'full' });
        when.append(time, make('span', item.session || 'Session TBA'));
      } else when.append(make('span', 'Not published', 'exam-pending'));
      if (item.stale) when.append(make('small', 'Cached'));
      row.append(info, when); root.append(row);
    }
    if (!entries.length) root.append(make('p', report?.entries.length ? 'No upcoming exams in this session.' : 'No subjects published yet.', 'exam-empty'));
  }
  get('exam-period').addEventListener('change', event => { period = event.target.value; render(); });
  function refresh(force = false) {
    if (new URLSearchParams(location.search).get('preview') === 'home') return Promise.resolve();
    if (request) return request;
    const current = generation;
    request = fetchDates(force).finally(() => { if (current === generation) request = null; });
    return request;
  }
  async function fetchDates(force) {
    const current = generation;
    const button = get('exam-sync'); button.disabled = true;
    get('exam-status').textContent = 'Checking…';
    try {
      const data = await api(`/api/exams${force ? '?force=1' : ''}`);
      if (current !== generation) return;
      report = normalize(data.exams); connection = data.connections?.portal || null;
      render();
      const cached = readReportsCache();
      if (cached) writeReportsCache({ ...cached, exams: data.exams });
      return { exams: data.exams, ok: !!report && !report.stale && !connection?.expired };
    } catch {
      if (current === generation) get('exam-status').textContent = report
        ? 'Sync unavailable · showing saved dates. Try Sync again.'
        : 'Could not check dates. Try Sync again.';
      return { ok: false };
    } finally {
      if (current === generation) button.disabled = false;
    }
  }
  get('exam-sync').addEventListener('click', () => refresh(true));
  return { update(data, connections) {
    report = normalize(data); connection = connections?.portal || null; render();
  }, render, markOpened, refresh,
    forDate(date) { return (report?.entries || []).filter(item => item.date === model.key(date)); },
    clear() { generation++; request = null; get('exam-sync').disabled = false; report = null; period = ''; connection = null; render(); } };
})();
