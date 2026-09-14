'use strict';

const $ = (id) => document.getElementById(id);
let authenticated = false;
let busy = false;
let manualCaptcha = false;
let manualChallengeAt = 0;
const designPreview = new URLSearchParams(location.search).get('preview') === 'home';
const signInParticles = createSignInParticles($('sign-in'));
const loginPreparation = createLoginPreparation({ prepare: async () => {
  const [challenge] = await Promise.all([
    api('/api/challenge', { method: 'POST', body: '{}' }, true),
    window.portalOcr.preload(),
  ]);
  if (challenge.authenticated) return challenge;
  const prediction = await window.portalOcr.solve(challenge.image);
  if (prediction.confidence >= 90 && prediction.minCharConfidence >= 80) {
    await api('/api/challenge/prepare', { method: 'POST', body: JSON.stringify({ answer: prediction.answer }) }, true);
  }
  return { prediction };
} });

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
  for (const id of ['sign-in', 'password-toggle', 'refresh', 'logout']) $(id).disabled = busy;
  $('account').disabled = busy;
  $('password').disabled = busy;
  $('remember').disabled = busy;
  $('manual-captcha-toggle').disabled = busy;
  $('manual-captcha-refresh').disabled = busy;
  $('manual-captcha-answer').disabled = busy || !manualCaptcha;
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
    signInParticles.stop();
    $('refresh').textContent = '↻ Retry';
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
  authenticated = false;
  $('startup').hidden = true;
  $('login-view').hidden = false;
  $('reports-view').hidden = true;
  $('logout').hidden = true;
  $('login-form').reset();
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
  document.body.classList.remove('garden-login');
  document.body.classList.add('planner');
  loginPreparation.clear();
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
  let response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin', cache: 'no-store', ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(login || path === '/api/reports' && (!options.method || options.method === 'GET') ? 120000 : 45000)
    });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' ? 'The request took too long. Please try again.' : 'Could not connect. Check your connection and try again.');
  }
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
      throw Object.assign(new Error(data.error?.message || (response.status === 401 ? 'Sign in failed. Check your credentials.' : 'The request failed. Please try again.')), { code: data.error?.code });
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

function renderAttendance(report) {
  const { container, data } = reportState('attendance', report);
  academicUI.renderAttendance(data, container);
}

function renderMarks(report) {
  const { container, data } = reportState('marks', report);
  const list = node('div', 'marks-list');
  for (const course of data) {
    const details = node('details', 'course-details');
    const summary = node('summary');
    summary.append(courseHeading(course), node('span', 'course-score', score(course)));
    const content = node('div', 'assessments');
    content.append(node('h3', 'assessment-heading', 'Assessment details'));
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

async function loadReports() {
  if (designPreview) return;
  $('refresh').textContent = 'Retrying…';
  $('report-content').setAttribute('aria-busy', 'true');
  message('reports-message', 'Loading your reports…');
  if (!$('attendance-content').childElementCount) {
    $('attendance-content').append(node('div', 'empty-state', 'Loading attendance…'));
    $('marks-content').append(node('div', 'empty-state', 'Loading marks…'));
  }
  try {
    const reports = await api('/api/reports');
    renderAttendance(reports.attendance);
    renderMarks(reports.marks);
    classproHome.update(reports.attendance);
    const date = new Date(reports.updatedAt);
    $('updated-at').textContent = Number.isNaN(date.getTime()) ? 'Reports loaded.' : `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
    message('reports-message', reports.attendance?.error || reports.marks?.error ? 'Some reports could not be loaded. Try Retry.' : '');
  } catch (error) {
    for (const kind of ['attendance', 'marks']) {
      const container = $(`${kind}-content`);
      if (container.firstElementChild?.textContent === `Loading ${kind}…`) container.replaceChildren(node('div', 'empty-state', 'Report not loaded. Use Retry to try again.'));
    }
    throw error;
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

$('manual-captcha-toggle').addEventListener('click', () => run(async () => {
  manualCaptcha = !manualCaptcha;
  manualChallengeAt = 0;
  loginPreparation.clear();
  $('manual-captcha').hidden = !manualCaptcha;
  $('manual-captcha-answer').required = manualCaptcha;
  $('manual-captcha-toggle').setAttribute('aria-expanded', String(manualCaptcha));
  $('manual-captcha-toggle').textContent = manualCaptcha ? 'Use automatic verification' : 'Enter CAPTCHA manually';
  message('login-message');
  if (manualCaptcha) await loadManualChallenge();
}));
$('manual-captcha-refresh').addEventListener('click', () => run(loadManualChallenge));

$('login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!$('login-form').reportValidity()) return;
  run(async () => {
    message('login-message');
    signInParticles.start();
    if (!manualCaptcha) await window.portalOcr.preload();
    signInParticles.stage('Connecting to SRM…', .4);
    let data;
    if (manualCaptcha) {
      if (!manualChallengeAt || Date.now() - manualChallengeAt >= 90000) {
        await loadManualChallenge();
        throw new Error('Enter the new code, then sign in again.');
      }
      const answer = $('manual-captcha-answer').value;
      manualChallengeAt = 0;
      try {
        data = await api('/api/login/client', { method: 'POST', body: JSON.stringify({ account: $('account').value.trim(), password: $('password').value, answer, remember: $('remember').checked }) }, true);
      } catch (error) {
        $('manual-captcha-image').hidden = true;
        $('manual-captcha-answer').value = '';
        $('manual-captcha-status').textContent = 'This code is no longer active. Select New code to retry.';
        throw error;
      }
    } else {
    try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const prepared = await loginPreparation.take();
      if (prepared.authenticated) { data = prepared; break; }
      const prediction = prepared.prediction;
      if (prediction.confidence < 90 || prediction.minCharConfidence < 80) {
        if (attempt === 0) continue;
        throw new Error('Your device could not confidently read this verification. Please retry.');
      }
      signInParticles.stage('Signing in…', .72);
      data = await api('/api/login/client', {
      method: 'POST',
      body: JSON.stringify({ account: $('account').value.trim(), password: $('password').value, answer: prediction.answer, remember: $('remember').checked })
    }, true);
      break;
    }
    } catch (error) {
      throw error;
    }
    }
    if (data.authenticated !== true) {
      throw new Error(data.error?.message || 'Sign in could not be confirmed. Please try again.');
    }
    signInParticles.stage('Signed in', 1);
    signInParticles.stop();
    showReports();
    await loadReports();
  });
});

$('refresh').addEventListener('click', () => run(loadReports));
$('logout').addEventListener('click', () => run(async () => {
  if (designPreview) { location.href = '/'; return; }
  $('logout').textContent = 'Signing out…';
  await api('/api/session', { method: 'DELETE' });
  showLogin('You have signed out.');
}));

if (designPreview) {
  const reports = classproHome.preview();
  showReports();
  renderAttendance(reports.attendance);
  renderMarks(reports.marks);
  classproHome.update(reports.attendance);
  $('updated-at').textContent = 'Design preview · sample data';
} else run(async () => {
  try {
    const session = await api('/api/session');
    if (session.authenticated) {
      showReports();
      await loadReports();
    } else showLogin();
  } catch (error) {
    if (!authenticated && !error.expired) showLogin(error.message, true);
    else throw error;
  }
});
