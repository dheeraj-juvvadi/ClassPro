'use strict';

const $ = (id) => document.getElementById(id);
let authenticated = false;
let busy = false;
let reportLoad = null;
let nextAutoSync = 0;
let pendingSyncTimer = null, pendingSyncChecks = 0;
let reportFingerprint = {};
let manualChallengeAt = 0;
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
  academicUI.clear();
  anonMarksTarget.clear();
  anonAcademicHistory.clear();
  dateAttendance.clear();
  providerConnections.clear();
  anonSettings.clear();
  anonFeedback.clear();
  anonSyncControl.reset();
  reportFingerprint = {};
  nextAutoSync = 0;
  clearTimeout(pendingSyncTimer); pendingSyncChecks = 0;
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

function loadReports(options = {}) {
  if (reportLoad) return reportLoad;
  reportLoad = fetchReports(options).finally(() => { reportLoad = null; });
  return reportLoad;
}

async function fetchReports({ cacheOnly = false, force = false, silent = false, followup = false, waitForCompletion = false } = {}) {
  if (designPreview) return;
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
    const query = force ? '?force=1&wait=1' : cacheOnly
      ? `?cache=only${waitForCompletion ? '&wait=1' : ''}` : '?wait=1';
    const reports = await api(`/api/reports${query}`);
    const changed = (key, data, update) => {
      const fingerprint = JSON.stringify(data);
      if (reportFingerprint[key] !== fingerprint) { update(); reportFingerprint[key] = fingerprint; }
    };
    changed('attendance', [reports.attendance, reports.schedule], () => renderAttendance(reports.attendance, reports.schedule));
    changed('marks', [reports.marks, reports.courses], () => renderMarks(reports.marks, reports.courses));
    changed('home', [reports.attendance, reports.schedule], () => anonHome.update(reports.attendance, reports.schedule));
    anonSettings.update(reports);
    changed('connections', [reports.connections, reports.warnings], () => providerConnections.update(reports));
    $('refresh').title = 'Sync attendance and marks';
    nextAutoSync = reports.sync?.pending ? reports.sync.nextAt : reports.sync?.due && cacheOnly ? 0 : reports.sync?.nextAt || reportSyncSchedule.next();
    const date = new Date(reports.updatedAt);
    $('updated-at').textContent = Number.isNaN(date.getTime()) ? 'Reports loaded.' : `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
    message('reports-message', reports.sync?.pending ? 'Sync queued. Your last data stays available while we refresh.' : reports.attendance?.error || reports.marks?.error ? 'Some reports could not be loaded. Try Sync.' : '');
    writeReportsCache(reports);
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
        loadReports({ cacheOnly: !retryAdmission, force: retryAdmission, silent: true,
          followup: true, waitForCompletion }).catch(() => {});
      }, delay);
    } else pendingSyncChecks = 0;
    return reports;
  } catch (error) {
    anonSyncControl.fail(error);
    for (const kind of ['attendance', 'marks']) {
      const container = $(`${kind}-content`);
      if (container.firstElementChild?.classList.contains('report-placeholder')) container.replaceChildren(node('div', 'empty-state', 'Report not loaded. Use Sync to try again.'));
    }
    nextAutoSync = Date.now() + 30000 + Math.random() * 30000;
    if (silent && !error.expired) {
      $('refresh').title = 'Could not sync. Your last data is still available. Select Sync to retry.';
      return;
    }
    throw error;
  } finally {
    anonSyncControl.end();
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
window.addEventListener('focus', resumeSync);
window.addEventListener('online', resumeSync);
document.addEventListener('visibilitychange', resumeSync);
// This timer only checks the clock. Requests occur at the scheduled IST slots.
setInterval(resumeSync, 15000);

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
  anonSyncControl.observe(cached);
  showReports();
  renderAttendance(cached.attendance, cached.schedule);
  renderMarks(cached.marks, cached.courses);
  anonHome.update(cached.attendance, cached.schedule);
  anonSettings.update(cached);
  providerConnections.update(cached);
  reportFingerprint.attendance = JSON.stringify([cached.attendance, cached.schedule]);
  reportFingerprint.marks = JSON.stringify([cached.marks, cached.courses]);
  reportFingerprint.home = JSON.stringify([cached.attendance, cached.schedule]);
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
