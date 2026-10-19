'use strict';

const $ = (id) => document.getElementById(id);
let authenticated = false;
let busy = false;
let reportLoad = null;
let nextAutoSync = 0;
let pendingSyncTimer = null, pendingSyncChecks = 0;
let syncGeneration = 0;
let reportFingerprint = {};
let manualChallengeAt = 0;
// Server-owned one-shot report retry metadata (sync.retry). The browser only
// observes the deadline, defers while hidden/offline/busy and fires the
// allowance once; allowance resetting stays on the server.
const retrying = { reports: null };
const retryInFlight = new Set();
const retryBackoff = new Map();
const retryExhaustedSeen = new Set();
let retryTimer = null;
let queuePending = false;
const designPreview = new URLSearchParams(location.search).get('preview') === 'home';
const REPORTS_CACHE = 'anon-reports-cache';
// One-time upgrade: keep existing offline reports until the new key is written.
const LEGACY_REPORTS_CACHE = 'classpro-reports-cache';
const dismissStartup = (() => {
  const startup = $('startup');
  let onScreen = true;
  const pause = () => startup.toggleAttribute('data-paused', document.hidden || !onScreen);
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    pause();
  }) : null;
  observer?.observe(startup);
  document.addEventListener('visibilitychange', pause);
  pause();
  return () => {
    startup.hidden = true;
    observer?.disconnect();
    document.removeEventListener('visibilitychange', pause);
  };
})();

function readReportsCache() {
  try {
    const stored = localStorage.getItem(REPORTS_CACHE) || localStorage.getItem(LEGACY_REPORTS_CACHE);
    const cached = JSON.parse(stored);
    if (cached?.syncedAt && !localStorage.getItem(REPORTS_CACHE)) {
      localStorage.setItem(REPORTS_CACHE, stored);
      localStorage.removeItem(LEGACY_REPORTS_CACHE);
    }
    return cached && cached.syncedAt ? cached : null;
  } catch { return null; }
}

function writeReportsCache(reports) {
  try { localStorage.setItem(REPORTS_CACHE, JSON.stringify({ ...reports, syncedAt: Date.now() })); } catch {}
}

function clearReportsCache() {
  try { localStorage.removeItem(REPORTS_CACHE); localStorage.removeItem(LEGACY_REPORTS_CACHE); } catch {}
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function message(id, text = '', error = false) {
  const element = $(id);
  element.textContent = text;
  element.hidden = !text;
  element.classList.toggle('error', error);
}

function syncControls() {
  for (const id of ['sign-in', 'password-toggle', 'refresh', 'logout']) $(id).disabled = busy || (id === 'refresh' && $(id).classList.contains('syncing'));
  $('account').disabled = busy;
  $('password').disabled = busy;
  $('portal-password').disabled = busy;
  $('remember').disabled = busy;
  $('login-provider').disabled = busy;
  $('manual-captcha-refresh').disabled = busy;
  $('manual-captcha-answer').disabled = busy;
  $('login-form').setAttribute('aria-busy', String(busy));
  anonLoginFlow.sync(busy);
}

async function run(action) {
  if (busy) return;
  busy = true;
  syncControls();
  try {
    await action();
  } catch (error) {
    if (!error.expired) {
      message(authenticated ? 'reports-message' : 'login-message', error.message || 'Something went wrong. Please try again.', true);
    }
  } finally {
    busy = false;
    syncControls();
    $('sign-in-label').textContent = 'Sign in';
    $('sign-in-status').textContent = '';
    $('sign-in').removeAttribute('data-loading');
    $('logout').textContent = 'Sign out';
    $('report-content').setAttribute('aria-busy', 'false');
    anonLoginFlow.sync(busy);
  }
}

function showLogin(text = '', error = false) {
  document.title = 'Sign in · Anon';
  document.body.classList.add('garden-login');
  document.body.classList.remove('planner');
  $('home-view').hidden = true;
  $('planner-nav').hidden = true;
  $('planner-menu').hidden = true;
  anonHome.clear();
  anonExamDates.clear();
  academicUI.clear();
  anonMarksTarget.clear();
  anonAcademicHistory.clear();
  dateAttendance.clear();
  providerConnections.clear();
  anonSettings.clear();
  anonFeedback.clear();
  anonSyncControl.reset();
  resetRetryState();
  reportFingerprint = {};
  nextAutoSync = 0;
  clearTimeout(pendingSyncTimer); pendingSyncChecks = 0;
  syncGeneration++;
  authenticated = false;
  dismissStartup();
  $('login-view').hidden = false;
  $('reports-view').hidden = true;
  $('logout').hidden = true;
  $('login-form').reset();
  anonAuth.reset();
  anonLoginFlow.sync(busy);
  manualChallengeAt = 0;
  $('manual-captcha-image').hidden = true;
  $('manual-captcha-answer').value = '';
  $('manual-captcha-status').textContent = 'Select New code, enter the CAPTCHA, then sign in.';
  $('attendance-content').replaceChildren();
  $('marks-content').replaceChildren();
  $('grades-content').replaceChildren();
  $('grades-empty').hidden = true;
  $('attendance-count').textContent = '';
  $('marks-count').textContent = '';
  $('updated-at').textContent = 'Your attendance and marks.';
  message('reports-message');
  message('home-message');
  message('login-message', text, error);
  $('login-title').tabIndex = -1;
  $('login-title').focus();
}

function showReports() {
  document.body.classList.remove('garden-login');
  document.body.classList.add('planner');
  manualChallengeAt = 0;
  authenticated = true;
  $('password').value = '';
  $('portal-password').value = '';
  dismissStartup();
  $('login-view').hidden = true;
  $('reports-view').hidden = false;
  $('logout').hidden = false;
  $('planner-nav').hidden = false;
  $('planner-menu').hidden = false;
  message('login-message');
  anonHome.enter();
}

async function api(path, options = {}, login = false) {
  const clientTrace = anonRandomId();
  const started = performance.now();
  const loginMode = 'manual';
  const record = (details) => {
    const entry = { time: new Date().toISOString(), path, method: options.method || 'GET', clientTrace, loginMode, durationMs: Math.round(performance.now() - started), ...details };
    window.anonDiagnostics = [...(window.anonDiagnostics || []), entry].slice(-30);
    if (details.failure || details.status >= 400) globalThis.anonClientLogs?.capture({
      kind: 'api_error', route: path.split('?')[0], status: details.status,
      code: details.failure === 'timeout' ? 'TIMEOUT' : details.failure ? 'NETWORK_ERROR' : 'HTTP_ERROR',
      duration_ms: entry.durationMs, request_id: details.requestId,
    });
    if (login) $('request-trace').textContent = `Request ${entry.requestId || clientTrace} · ${entry.status || entry.failure}`;
  };
  let response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin', cache: 'no-store', ...options,
      headers: { 'Content-Type': 'application/json', 'X-Client-Trace': clientTrace, 'X-Login-Mode': loginMode, ...options.headers },
      signal: AbortSignal.timeout(login || path === '/api/reports' && (!options.method || options.method === 'GET') ? 120000 : 45000)
    });
  } catch (error) {
    record({ failure: error.name === 'TimeoutError' ? 'timeout' : 'network_error' });
    throw new Error(error.name === 'TimeoutError' ? 'The request took too long. Please try again.' : 'Could not connect. Check your connection and try again.');
  }
  record({ status: response.status, requestId: response.headers.get('x-request-id'), vercelId: response.headers.get('x-vercel-id'), vercelCache: response.headers.get('x-vercel-cache') });
  if (response.status === 401 && !login) {
    clearReportsCache();
    showLogin('Your session has expired. Please sign in again.', true);
    throw Object.assign(new Error('Session expired'), { expired: true });
  }
  let data = {};
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); }
    catch {
      globalThis.anonClientLogs?.capture({ kind: 'api_error', route: path.split('?')[0], code: 'INVALID_RESPONSE' });
      throw new Error('The server returned an unexpected response.\nPlease try again.');
    }
  }
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.message || (response.status === 401 ? 'Sign in failed. Check your credentials.' : 'The request failed. Please try again.')), {
      code: data.error?.code, image: data.image, status: response.status,
      retryable: data.error?.retryable === true,
      retryAfterMs: anonAdmission.retryAfter(response.headers.get('Retry-After')),
    });
  }
  return data;
}

function value(input) {
  return input === null || input === undefined || input === '' ? '—' : String(input);
}

function score(item) {
  return item.scoreLabel ? String(item.scoreLabel) : `${value(item.scored)} / ${value(item.total)}`;
}

function courseHeading(course) {
  const heading = node('div', 'course-heading');
  heading.append(node('span', 'course-code', course.code || 'Course'), node('span', 'course-title', course.title || 'Untitled course'));
  return heading;
}

function reportState(kind, report) {
  const container = $(`${kind}-content`);
  container.replaceChildren();
  const data = Array.isArray(report?.data) ? report.data : [];
  $(`${kind}-count`).textContent = data.length ? `${data.length} ${data.length === 1 ? 'course' : 'courses'}` : '';
  if (report?.error) {
    container.append(node('p', 'message error', report.error.message || `Could not load ${kind}. Try refreshing reports.`));
  } else if (!report || !Array.isArray(report.data)) {
    container.append(node('p', 'message error', `The ${kind} report is unavailable. Try refreshing reports.`));
  } else if (!data.length) {
    container.append(node('div', 'empty-state', `No ${kind === 'marks' ? 'marks' : 'attendance records'} are available yet.`));
  }
  return { container, data };
}

function renderAttendance(report, schedule) {
  const previous = $('attendance-content');
  const opened = new Set([...previous.querySelectorAll('.attendance-details[open]')].map(item => item.closest('[data-course]').dataset.course));
  const focused = document.activeElement?.closest('.attendance-row');
  const focus = focused ? { code: focused.dataset.course } : null;
  const { container, data } = reportState('attendance', report);
  academicUI.renderAttendance(data, container, schedule);
  for (const card of container.querySelectorAll('.attendance-row')) {
    if (opened.has(card.dataset.course)) card.querySelector('.attendance-details').open = true;
    if (focus?.code === card.dataset.course) card.querySelector('.attendance-details > summary').focus({ preventScroll: true });
  }
}

function renderMarks(report, courses = {}) {
  const active = document.activeElement;
  const focusedPlan = active?.closest('.mark-plan');
  const focusedCourse = focusedPlan?.dataset.course;
  const { container, data: rows } = reportState('marks', report);
  const data = rows.map(course => ({ ...course,
    credits: course.credits ?? courses[course.code]?.credits ?? courses[course.code]?.credit,
  }));
  anonMarksTarget.update(data);
  const list = node('div', 'marks-list');
  const plans = node('div', 'grade-course-list');
  const scoreParts = item => {
    const output = node('span', 'mini-score');
    if (item.scoreLabel) { output.textContent = String(item.scoreLabel); return output; }
    const pending = item.scored === null || item.scored === undefined || item.scored === '';
    output.append(node('strong', '', pending ? 'Pending' : String(item.scored)));
    if (item.total !== null && item.total !== undefined && item.total !== '') {
      output.append(node('small', '', ` / ${item.total}`));
    }
    output.dataset.pending = String(pending);
    return output;
  };
  for (const course of data) {
    const id = String(course.code || course.title);
    const card = node('article', 'mark-course'); card.dataset.course = id;
    const header = node('header', 'mark-course-header');
    const scoreBlock = node('span', 'marks-score-block');
    scoreBlock.setAttribute('aria-label', `Recorded total: ${score(course)}`);
    scoreBlock.append(scoreParts(course));
    header.append(courseHeading(course), scoreBlock);
    const content = node('div', 'assessments');
    if (course.detailsError) content.append(node('p', 'message error', course.detailsError));
    const components = Array.isArray(course.components) ? course.components : [];
    if (!components.length && !course.detailsError) content.append(node('p', 'quiet', 'No assessment details are available yet.'));
    for (const component of components) {
      const row = node('div', 'assessment-row');
      const info = node('div');
      info.append(node('div', 'assessment-name', component.name || 'Assessment'));
      if (component.enteredOn) row.title = `Entered ${component.enteredOn}`;
      row.append(info, scoreParts(component));
      content.append(row);
    }
    card.append(header, content);
    list.append(card);
    const planning = node('article', 'grade-course'); planning.dataset.course = id;
    planning.append(courseHeading(course), anonMarksTarget.create(course));
    plans.append(planning);
  }
  if (data.length) container.append(list);
  $('grades-content').replaceChildren(plans);
  $('grades-empty').hidden = data.length > 0;
  $('grades-empty').textContent = report?.error?.message || 'No course marks are available for grade planning yet.';
  if (focusedCourse && active.isConnected) {
    const focusTarget = active.checkVisibility() ? active : active.closest('.mark-plan')?.querySelector('[data-field="grade"]');
    focusTarget?.focus({ preventScroll: true });
  }
}

const retryName = id => id === 'portal' ? 'Student Portal' : id === 'academia' ? 'Academia' : 'Providers';
function retryLabel(meta) {
  const names = (meta?.sources || []).filter(item => item === 'portal' || item === 'academia');
  if (!names.length) return 'Providers';
  return names.length > 1 ? `${names.slice(0, -1).map(retryName).join(', ')} and ${retryName(names.at(-1))}`
    : retryName(names[0]);
}
const reportWarnings = list => (Array.isArray(list) ? list : []).filter(text => !/^Endsem dates/.test(String(text)));
function observeRetry(kind, meta) {
  const valid = meta && typeof meta === 'object' && typeof meta.id === 'string' && meta.id
    && Number.isFinite(Number(meta.at)) && Number(meta.at) > 0 && Array.isArray(meta.sources);
  // Server truth always wins: every poll replaces what the browser knows,
  // including pending:false/exhausted:true arriving for an ID still held as
  // armed. Never keep a stale pending allowance past settled metadata.
  retrying[kind] = valid ? { ...meta, at: Number(meta.at) } : null;
  refreshRetryNotice();
  scheduleRetryCheck();
  return retrying[kind];
}
function refreshRetryNotice() {
  const metas = [retrying.reports].filter(meta => meta);
  for (const meta of metas) if (meta.pending && !meta.exhausted) retryExhaustedSeen.delete(meta.id);
  const waiting = metas.filter(meta => meta.pending && !meta.exhausted);
  const names = new Set(waiting.map(retryLabel));
  if (names.size) {
    const soon = Math.min(...waiting.map(meta => Number(meta.at))) > Date.now();
    anonSyncControl.retryWait(`Retrying ${[...names].join(' and ')}${soon ? ' in 1 minute' : ''}…`);
    return;
  }
  const exhausted = metas.filter(meta => meta.exhausted && !retryExhaustedSeen.has(meta.id));
  if (exhausted.length) {
    const labels = [...new Set(exhausted.map(retryLabel))].join(' and ');
    const text = `${labels} retry didn’t recover · will try again at the next scheduled sync.`;
    // Only mark seen when the notice actually showed; a suppressed show (e.g.
    // a sync in flight) retries on the next metadata refresh.
    if (anonSyncControl.retryExhausted(text)) {
      for (const meta of exhausted) retryExhaustedSeen.add(meta.id);
    }
    return;
  }
  if (!metas.length) { retryExhaustedSeen.clear(); anonSyncControl.retryClear(); }
}
function scheduleRetryCheck() {
  clearTimeout(retryTimer);
  retryTimer = null;
  const at = Math.min(...[retrying.reports]
    .filter(meta => meta?.pending && !meta.exhausted && !retryInFlight.has(meta.id))
    .map(meta => Number(meta.at)));
  if (Number.isFinite(at)) {
    // Past-due checks wait for the next interval tick to avoid a busy loop
    // while a deferred retry (queue/Portal recovery) is outstanding.
    const delay = at > Date.now() ? at + 250 - Date.now() : 15000;
    retryTimer = setTimeout(() => { retryTimer = null; checkDueRetries(); }, Math.max(1000, delay));
  }
}
function retryAllowed(meta) {
  return meta?.pending && !meta.exhausted && !retryInFlight.has(meta.id)
    && Date.now() >= Number(meta.at) && Date.now() >= (retryBackoff.get(meta.id) || 0);
}
function appActive() {
  return authenticated && !designPreview && !busy && !reportLoad && !document.hidden
    && navigator.onLine && !$('connect-dialog').open;
}
function checkDueRetries() {
  if (!retrying.reports) return;
  if (!appActive()) return;
  if (retryAllowed(retrying.reports) && !queuePending) fireReportsRetry(retrying.reports);
  scheduleRetryCheck();
}

function loadReports(options = {}) {
  if (reportLoad) return reportLoad;
  reportLoad = fetchReports(options).finally(() => { reportLoad = null; });
  return reportLoad;
}

async function fireReportsRetry(meta) {
  const generation = syncGeneration;
  retryInFlight.add(meta.id);
  const before = retrying.reports;
  try {
    await loadReports({ retryId: meta.id });
    if (generation !== syncGeneration) return;
    // A failed attempt may still have been consumed server-side while its
    // response never arrived; only the next authoritative metadata settles
    // that. Back off whenever the attempt produced no fresh metadata —
    // thrown or swallowed — so it never spins on the same deadline.
    if (retrying.reports === before) retryBackoff.set(meta.id, Date.now() + 120000);
  } catch {
    if (retrying.reports === before) retryBackoff.set(meta.id, Date.now() + 120000);
  } finally {
    retryInFlight.delete(meta.id);
    if (generation === syncGeneration) { refreshRetryNotice(); scheduleRetryCheck(); }
  }
}

function resetRetryState() {
  clearTimeout(retryTimer);
  retryTimer = null;
  retrying.reports = null;
  retryInFlight.clear(); retryBackoff.clear(); retryExhaustedSeen.clear(); queuePending = false;
}

async function fetchReports({ cacheOnly = false, force = false, silent = false, followup = false, waitForCompletion = false, retryId = null } = {}) {
  if (designPreview) return;
  const generation = syncGeneration;
  clearTimeout(pendingSyncTimer);
  if (!followup) pendingSyncChecks = 0;
  anonSyncControl.begin({ notify: !cacheOnly });
  if (!silent) message('reports-message');
  if (!$('attendance-content').childElementCount) {
    for (const kind of ['attendance', 'marks']) {
      const skeleton = node('div', 'report-placeholder');
      skeleton.setAttribute('aria-label', 'Fetching your data');
      skeleton.setAttribute('role', 'status');
      for (let i = 0; i < 3; i++) skeleton.append(node('div', 'placeholder-row'));
      $(`${kind}-content`).append(skeleton);
    }
  }
  try {
    const query = force ? '?force=1&wait=1' : retryId
      ? `?retry=${encodeURIComponent(retryId)}&wait=1` : cacheOnly
        ? `?cache=only${waitForCompletion ? '&wait=1' : ''}` : '?wait=1';
    const reports = await api(`/api/reports${query}`);
    if (generation !== syncGeneration) return;
    reports.warnings = reportWarnings(reports.warnings);
    const changed = (key, data, update) => {
      const fingerprint = JSON.stringify(data);
      if (reportFingerprint[key] !== fingerprint) { update(); reportFingerprint[key] = fingerprint; }
    };
    changed('attendance', [reports.attendance, reports.schedule], () => renderAttendance(reports.attendance, reports.schedule));
    changed('marks', [reports.marks, reports.courses], () => renderMarks(reports.marks, reports.courses));
    changed('exams', [reports.exams, reports.connections], () => anonExamDates.update(reports.exams, reports.connections));
    changed('home', [reports.attendance, reports.schedule, reports.exams], () => anonHome.update(reports.attendance, reports.schedule));
    anonSettings.update(reports);
    changed('connections', [reports.connections, reports.warnings], () => providerConnections.update(reports));
    $('refresh').title = 'Sync attendance and marks';
    nextAutoSync = reports.sync?.pending ? reports.sync.nextAt : reports.sync?.due && cacheOnly ? 0 : reports.sync?.nextAt || reportSyncSchedule.next();
    const date = new Date(reports.updatedAt);
    $('updated-at').textContent = Number.isNaN(date.getTime()) ? 'Reports loaded.' : `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
    message('reports-message', !reports.sync?.pending && (reports.attendance?.error || reports.marks?.error) ? 'Some reports could not be loaded. Try Sync.' : '');
    writeReportsCache(reports);
    // Observe server-owned retry truth; cache-only and cache reads never touch
    // the allowance, they only re-sync what the browser knows.
    queuePending = !!reports.sync?.pending;
    observeRetry('reports', reports.sync?.retry ?? null);
    anonSyncControl.complete(reports);
    if (reports.sync?.pending) {
      // At low load, wait on the existing job so completion is returned as
      // soon as it happens. Older/busy servers retain the bounded backoff.
      pendingSyncChecks++;
      const waitForCompletion = reports.sync.waitForCompletion === true;
      const delay = Math.max(pendingSyncChecks > 5 && !waitForCompletion ? 5000 : 200,
        Math.min(30000, Number(reports.sync.nextAt) - Date.now() || 2000));
      pendingSyncTimer = setTimeout(() => {
        if (!authenticated || busy || document.hidden || !navigator.onLine || $('connect-dialog').open) return;
        const retryAdmission = reports.sync.state === 'busy';
        // A retry-origin followup keeps its retry ID so a busy queue never
        // escalates a scoped retry into a full manual cycle.
        loadReports({ cacheOnly: !retryAdmission, force: retryAdmission && !retryId, retryId,
          silent: true, followup: true, waitForCompletion }).catch(() => {});
      }, delay);
    } else pendingSyncChecks = 0;
    return reports;
  } catch (error) {
    if (generation !== syncGeneration) return;
    anonSyncControl.fail(error);
    for (const kind of ['attendance', 'marks']) {
      const container = $(`${kind}-content`);
      if (container.firstElementChild?.classList.contains('report-placeholder')) container.replaceChildren(node('div', 'empty-state', 'Report not loaded. Use Sync to try again.'));
    }
    // A failed retry keeps the normal next slot: scheduling an ordinary
    // sync here would bypass the retry backoff with a full sync.
    if (!retryId) nextAutoSync = Date.now() + 30000 + Math.random() * 30000;
    queuePending = false;
    if (silent && !error.expired) {
      $('refresh').title = 'Could not sync. Your last data is still available. Select Sync to retry.';
      return;
    }
    throw error;
  } finally {
    if (generation === syncGeneration) { anonSyncControl.end(); refreshRetryNotice(); }
  }
}

async function loadManualChallenge() {
  manualChallengeAt = 0;
  $('manual-captcha-answer').value = '';
  $('manual-captcha-image').hidden = true;
  $('manual-captcha-status').textContent = 'Loading code…';
  try {
    const challenge = await api('/api/challenge', { method: 'POST', body: '{}' }, true);
    if (challenge.authenticated) { showReports(); await loadReports(); return; }
    if (typeof challenge.image !== 'string' || !challenge.image.startsWith('data:image/')) throw new Error('Could not load the verification image. Try New code.');
    $('manual-captcha-image').src = challenge.image;
    $('manual-captcha-image').hidden = false;
    manualChallengeAt = Date.now();
    $('manual-captcha-status').textContent = 'Enter the code, then sign in.';
  } catch (error) {
    $('manual-captcha-status').textContent = 'Code unavailable. Try New code.';
    throw error;
  }
}

$('use-student-portal').addEventListener('click', () => {
  $('login-fallback-dialog').close();
  anonAuth.usePortal();
  message('login-message', 'Use your Student Portal password to continue.');
  anonFeedback.enter($('login-form'));
});
$('retry-academia').addEventListener('click', () => {
  $('login-fallback-dialog').close();
  $('password').focus();
});

$('manual-captcha-refresh').addEventListener('click', () => run(() => anonAuth.enabled ? anonAuth.prepare(api, false) : loadManualChallenge()));

async function submitCredentials(credentials, answer) {
  const integrity = await createCredentialIntegrity(credentials.account, credentials.password, answer);
  return api('/api/login/client', {
    method: 'POST', body: JSON.stringify({ ...credentials, answer, integrity }),
  }, true);
}

$('login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!anonLoginFlow.beforeSubmit()) return;
  if (!$('login-form').reportValidity()) return;
  const credentials = { account: $('account').value.trim(), password: $('password').value, portalPassword: $('portal-password').value, remember: $('remember').checked };
  run(async () => {
    message('login-message');
    $('sign-in').setAttribute('data-loading', '');
    $('sign-in-status').textContent = 'Connecting to SRM…';
    let data;
    if (anonAuth.enabled) {
      data = await anonAuth.loginBoth(api, credentials);
      if (!data) return;
      if (data.authenticated !== true) throw new Error('Sign-in could not be confirmed.');
      showReports();
      await loadReports();
      if (data.warning) message('home-message', data.warning, true);
      anonFeedback.success('You’re in.');
      return;
    }
    if (!manualChallengeAt || Date.now() - manualChallengeAt >= 90000) {
      await loadManualChallenge();
      throw new Error('Enter the new code, then sign in again.');
    }
    const answer = $('manual-captcha-answer').value;
    manualChallengeAt = 0;
    try {
      data = await submitCredentials(credentials, answer);
    } catch (error) {
      $('manual-captcha-image').hidden = true;
      $('manual-captcha-answer').value = '';
      $('manual-captcha-status').textContent = 'This code is no longer active. Select New code to retry.';
      throw error;
    }
    if (data.authenticated !== true) {
      throw new Error(data.error?.message || 'Sign in could not be confirmed. Please try again.');
    }
    $('sign-in-status').textContent = 'Signed in';
    showReports();
    await loadReports();
  });
});

function resumeSync() {
  if (!authenticated || busy || reportLoad || designPreview || document.hidden || !navigator.onLine || $('connect-dialog').open || Date.now() < nextAutoSync) return;
  nextAutoSync = reportSyncSchedule.next();
  loadReports({ silent: true }).catch(() => {});
}
const resumeChecks = () => { checkDueRetries(); resumeSync(); };
window.addEventListener('focus', resumeChecks);
window.addEventListener('online', resumeChecks);
document.addEventListener('visibilitychange', resumeChecks);
// This timer only checks the clock. Requests occur at the scheduled IST slots.
setInterval(resumeChecks, 15000);

$('refresh').addEventListener('click', () => run(async () => {
  await loadReports({ force: true });
}));
$('logout').addEventListener('click', () => run(async () => {
  if (designPreview) { location.href = '/'; return; }
  $('logout').textContent = 'Signing out…';
  clearReportsCache();
  await api('/api/session', { method: 'DELETE' });
  showLogin('You have signed out.');
}));

function paintCachedReports() {
  const cached = readReportsCache();
  if (!cached) return false;
  cached.warnings = reportWarnings(cached.warnings);
  anonSyncControl.observe(cached);
  // Show server retry truth even before the first network response; the
  // cache-only startup refresh replaces it with live metadata.
  if (cached.sync && 'retry' in cached.sync) observeRetry('reports', cached.sync.retry ?? null);
  showReports();
  renderAttendance(cached.attendance, cached.schedule);
  renderMarks(cached.marks, cached.courses);
  anonExamDates.update(cached.exams, cached.connections);
  anonHome.update(cached.attendance, cached.schedule);
  anonSettings.update(cached);
  providerConnections.update(cached);
  reportFingerprint.attendance = JSON.stringify([cached.attendance, cached.schedule]);
  reportFingerprint.marks = JSON.stringify([cached.marks, cached.courses]);
  reportFingerprint.home = JSON.stringify([cached.attendance, cached.schedule, cached.exams]);
  reportFingerprint.exams = JSON.stringify([cached.exams, cached.connections]);
  reportFingerprint.connections = JSON.stringify([cached.connections, cached.warnings]);
  const cachedNextAt = Number(cached.sync?.nextAt);
  nextAutoSync = cached.sync?.due && !cached.sync?.pending ? 0
    : Number.isFinite(cachedNextAt) && cachedNextAt > 0 ? cachedNextAt : 0;
  const date = new Date(cached.updatedAt);
  $('updated-at').textContent = Number.isNaN(date.getTime()) ? 'Showing your last synced data.' : `Last synced ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
  if (!navigator.onLine) anonSyncControl.offline();
  return true;
}

if (designPreview) {
  const reports = anonHome.preview();
  showReports();
  renderAttendance(reports.attendance, reports.schedule);
  renderMarks(reports.marks, reports.courses);
  anonExamDates.update(reports.exams, reports.connections);
  anonHome.update(reports.attendance, reports.schedule);
  anonSettings.update(reports);
  $('updated-at').textContent = 'Design preview · sample data';
} else {
  paintCachedReports();
  run(async () => {
    try {
      if (!navigator.onLine) {
        if (!authenticated) showLogin('You’re offline. Connect to sign in; your saved reports are available if this device has them.');
        return;
      }
      const session = await api('/api/session');
      anonAuth.configure(session);
      if (session.authenticated) {
        if (!reportFingerprint.home) showReports();
        // Revalidate the browser cache against saved server data even outside
        // upstream sync hours. This GET does not contact Student Portal.
        await loadReports({ cacheOnly: true });
        setTimeout(resumeSync, 0);
      } else {
        clearReportsCache();
        showLogin();
      }
    } catch (error) {
      if (!authenticated && !error.expired) showLogin(error.message, true);
      else throw error;
    }
  });
}
