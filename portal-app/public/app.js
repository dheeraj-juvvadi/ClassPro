'use strict';

const $ = (id) => document.getElementById(id);
let authenticated = false;
let busy = false;
let reportLoad = null;
let nextAutoSync = 0;
let reportFingerprint = {};
let manualChallengeAt = 0;
const designPreview = new URLSearchParams(location.search).get('preview') === 'home';

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
  $('remember').disabled = busy;
  $('login-provider').disabled = busy;
  $('manual-captcha-refresh').disabled = busy;
  $('manual-captcha-answer').disabled = busy;
  $('login-form').setAttribute('aria-busy', String(busy));
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
  }
}

function showLogin(text = '', error = false) {
  document.body.classList.add('garden-login');
  document.body.classList.remove('planner');
  $('home-view').hidden = true;
  $('planner-nav').hidden = true;
  $('planner-menu').hidden = true;
  classproHome.clear();
  academicUI.clear();
  dateAttendance.clear();
  providerConnections.clear();
  anonSettings.clear();
  anonFeedback.clear();
  reportFingerprint = {};
  nextAutoSync = 0;
  authenticated = false;
  $('startup').hidden = true;
  $('login-view').hidden = false;
  $('reports-view').hidden = true;
  $('logout').hidden = true;
  $('login-form').reset();
  classproAuth.reset();
  manualChallengeAt = 0;
  $('manual-captcha-image').hidden = true;
  $('manual-captcha-answer').value = '';
  $('manual-captcha-status').textContent = 'Select New code, enter the CAPTCHA, then sign in.';
  $('attendance-content').replaceChildren();
  $('marks-content').replaceChildren();
  $('attendance-count').textContent = '';
  $('marks-count').textContent = '';
  $('updated-at').textContent = 'Your attendance and marks.';
  message('reports-message');
  message('login-message', text, error);
  $('login-title').tabIndex = -1;
  $('login-title').focus();
}

function showReports() {
  const calendarArt = $('calendar-art');
  if (!calendarArt.hasAttribute('src')) calendarArt.src = calendarArt.dataset.src;
  document.body.classList.remove('garden-login');
  document.body.classList.add('planner');
  manualChallengeAt = 0;
  authenticated = true;
  $('password').value = '';
  $('startup').hidden = true;
  $('login-view').hidden = true;
  $('reports-view').hidden = false;
  $('logout').hidden = false;
  $('planner-nav').hidden = false;
  $('planner-menu').hidden = false;
  message('login-message');
  classproHome.enter();
}

async function api(path, options = {}, login = false) {
  const clientTrace = classproRandomId();
  const started = performance.now();
  const loginMode = 'manual';
  const record = (details) => {
    const entry = { time: new Date().toISOString(), path, method: options.method || 'GET', clientTrace, loginMode, durationMs: Math.round(performance.now() - started), ...details };
    window.classproDiagnostics = [...(window.classproDiagnostics || []), entry].slice(-30);
    console.info('classpro_request', entry);
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
    showLogin('Your session has expired. Please sign in again.', true);
    throw Object.assign(new Error('Session expired'), { expired: true });
  }
  let data = {};
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); }
    catch { throw new Error('The server returned an unexpected response.\nPlease try again.'); }
  }
  if (!response.ok) {
      throw Object.assign(new Error(data.error?.message || (response.status === 401 ? 'Sign in failed. Check your credentials.' : 'The request failed. Please try again.')), { code: data.error?.code, image: data.image, status: response.status });
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
  const { container, data } = reportState('attendance', report);
  academicUI.renderAttendance(data, container, schedule);
}

function renderMarks(report) {
  const { container, data } = reportState('marks', report);
  const list = node('div', 'marks-list');
  for (const course of data) {
    const details = node('details', 'course-details');
    const summary = node('summary');
    const scoreBlock = node('span', 'marks-score-block');
    scoreBlock.append(node('span', 'course-score', score(course)), node('span', 'marks-score-caption', 'Total score'));
    summary.append(courseHeading(course), scoreBlock);
    const content = node('div', 'assessments');
    content.append(node('h3', 'assessment-heading', 'Assessments'));
    if (course.detailsError) content.append(node('p', 'message error', course.detailsError));
    const components = Array.isArray(course.components) ? course.components : [];
    const metadata = node('span', 'course-result-count', `${components.length} ${components.length === 1 ? 'assessment' : 'assessments'}`);
    summary.querySelector('.course-heading').append(metadata);
    if (!components.length && !course.detailsError) content.append(node('p', 'quiet', 'No assessment details are available yet.'));
    for (const component of components) {
      const row = node('div', 'assessment-row');
      const info = node('div');
      info.append(node('div', 'assessment-name', component.name || 'Assessment'));
      if (component.enteredOn) info.append(node('div', 'quiet assessment-date', `Entered ${component.enteredOn}`));
      row.append(info, node('span', 'assessment-score', score(component)));
      content.append(row);
    }
    details.append(summary, content);
    list.append(details);
  }
  if (data.length) container.append(list);
}

function loadReports(options = {}) {
  if (reportLoad) return reportLoad;
  reportLoad = fetchReports(options).finally(() => { reportLoad = null; });
  return reportLoad;
}

async function fetchReports({ cacheOnly = false, force = false, silent = false } = {}) {
  if (designPreview) return;
  anonSyncControl.begin();
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
    const reports = await api(`/api/reports${force ? '?force=1' : cacheOnly ? '?cache=only' : ''}`);
    const changed = (key, data, update) => {
      const fingerprint = JSON.stringify(data);
      if (reportFingerprint[key] !== fingerprint) { update(); reportFingerprint[key] = fingerprint; }
    };
    changed('attendance', [reports.attendance, reports.schedule], () => renderAttendance(reports.attendance, reports.schedule));
    changed('marks', reports.marks, () => renderMarks(reports.marks));
    changed('home', [reports.attendance, reports.schedule], () => classproHome.update(reports.attendance, reports.schedule));
    anonSettings.update(reports);
    changed('connections', [reports.connections, reports.warnings], () => providerConnections.update(reports));
    $('refresh').title = 'Sync attendance and marks';
    nextAutoSync = reports.sync?.due && cacheOnly ? 0 : reports.sync?.nextAt || reportSyncSchedule.next();
    const date = new Date(reports.updatedAt);
    $('updated-at').textContent = Number.isNaN(date.getTime()) ? 'Reports loaded.' : `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
    message('reports-message', reports.attendance?.error || reports.marks?.error ? 'Some reports could not be loaded. Try Sync.' : '');
    return reports;
  } catch (error) {
    for (const kind of ['attendance', 'marks']) {
      const container = $(`${kind}-content`);
      if (container.firstElementChild?.classList.contains('report-placeholder')) container.replaceChildren(node('div', 'empty-state', 'Report not loaded. Use Sync to try again.'));
    }
    nextAutoSync = reportSyncSchedule.next();
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
  classproAuth.usePortal();
  message('login-message', 'Use your Student Portal password to continue.');
  anonFeedback.enter($('login-form'));
});
$('retry-academia').addEventListener('click', () => {
  $('login-fallback-dialog').close();
  $('password').focus();
});

$('manual-captcha-refresh').addEventListener('click', () => run(() => classproAuth.enabled ? classproAuth.prepare(api, false) : loadManualChallenge()));

async function submitCredentials(credentials, answer) {
  const integrity = await createCredentialIntegrity(credentials.account, credentials.password, answer);
  return api('/api/login/client', {
    method: 'POST', body: JSON.stringify({ ...credentials, answer, integrity }),
  }, true);
}

$('login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!$('login-form').reportValidity()) return;
  const credentials = { account: $('account').value.trim(), password: $('password').value, remember: $('remember').checked };
  run(async () => {
    message('login-message');
    $('sign-in').setAttribute('data-loading', '');
    $('sign-in-status').textContent = 'Connecting to SRM…';
    let data;
    if (classproAuth.enabled) {
      try {
        data = await classproAuth.login(api, credentials);
      } catch (error) {
        if ($('login-provider').value === 'academia' && !['SERVER_BUSY', 'CAPACITY', 'CAPTCHA_REQUIRED', 'CAPTCHA_INVALID'].includes(error.code)) {
          $('login-fallback-title').textContent = error.status >= 500 ? 'Academia isn’t responding.' : error.status === 401 ? 'Academia sign-in didn’t complete.' : 'Couldn’t reach Academia.';
          $('login-fallback-message').textContent = error.status === 401 ? 'Check your Academia details and try again, or continue with Student Portal for attendance and marks.' : 'You can still get your attendance and marks. Continue with Student Portal.';
          $('password').value = '';
          $('login-fallback-dialog').showModal();
          return;
        }
        throw error;
      }
      if (!data) return;
      if (data.authenticated !== true) throw new Error('Sign-in could not be confirmed.');
      showReports();
      await loadReports();
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
  if (reportSyncSchedule.isSunday() || !authenticated || busy || reportLoad || designPreview || document.hidden || !navigator.onLine || $('connect-dialog').open || Date.now() < nextAutoSync) return;
  nextAutoSync = reportSyncSchedule.next();
  loadReports({ silent: true }).catch(() => {});
}
window.addEventListener('focus', resumeSync);
window.addEventListener('online', resumeSync);
document.addEventListener('visibilitychange', resumeSync);
// This timer only checks the clock. Requests occur at the scheduled IST slots.
setInterval(resumeSync, 15000);

$('refresh').addEventListener('click', () => run(async () => {
  const data = await loadReports({ force: true });
  if (data && !data.attendance?.error && !data.marks?.error && !data.warnings?.length) anonFeedback.success('All up to date.');
}));
$('logout').addEventListener('click', () => run(async () => {
  if (designPreview) { location.href = '/'; return; }
  $('logout').textContent = 'Signing out…';
  await api('/api/session', { method: 'DELETE' });
  showLogin('You have signed out.');
}));

if (designPreview) {
  const reports = classproHome.preview();
  showReports();
  renderAttendance(reports.attendance, reports.schedule);
  renderMarks(reports.marks);
  classproHome.update(reports.attendance, reports.schedule);
  anonSettings.update(reports);
  $('updated-at').textContent = 'Design preview · sample data';
} else run(async () => {
  try {
    const session = await api('/api/session');
    classproAuth.configure(session);
    if (session.authenticated) {
      showReports();
      await loadReports({ cacheOnly: true });
      setTimeout(resumeSync, 0);
    } else showLogin();
  } catch (error) {
    if (!authenticated && !error.expired) showLogin(error.message, true);
    else throw error;
  }
});
