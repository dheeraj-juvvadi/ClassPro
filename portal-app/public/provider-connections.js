'use strict';

globalThis.providerConnections = (() => {
  const get = id => document.getElementById(id);
  const label = name => name === 'academia' ? 'Academia' : 'Student Portal';
  let selected = 'academia', pending = false, challengeReady = false;
  function update(report) {
    const container = get('provider-connections'); container.replaceChildren();
    for (const provider of ['academia', 'portal']) {
      const state = report.connections?.[provider];
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${state?.connected && !state.expired ? 'Reconnect' : 'Connect'} ${label(provider)}`;
      button.addEventListener('click', () => {
        selected = provider;
        get('connect-title').textContent = `Connect ${label(provider)}`;
        get('connect-help').textContent = provider === 'academia'
          ? 'Load your course allocation and timetable from Academia. Student Portal attendance stays connected.'
          : 'Load attendance and marks from Student Portal. Your Academia timetable stays connected.';
        get('connect-form').reset(); get('connect-message').textContent = '';
        challengeReady = false; get('connect-captcha').hidden = true;
        get('connect-dialog').showModal();
      });
      container.append(button);
    }
    const info = document.createElement('p'); info.className = 'quiet';
    info.textContent = report.scheduleProvider ? `Timetable from ${label(report.scheduleProvider)}` : 'Connect Academia to load your timetable if Student Portal has none.';
    container.append(info);
    for (const warning of report.warnings || []) { const p = document.createElement('p'); p.className = 'quiet'; p.textContent = warning; container.append(p); }
  }
  get('close-connect').addEventListener('click', () => { if (!pending) get('connect-dialog').close(); });
  get('connect-dialog').addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  get('connect-form').addEventListener('submit', async event => {
    event.preventDefault(); if (pending) return;
    pending = true; get('connect-submit').disabled = true; get('close-connect').disabled = true;
    get('connect-message').textContent = 'Connecting to SRM…';
    const account = get('connect-account').value.trim(), password = get('connect-password').value;
    try {
      if (!challengeReady) {
        await api('/api/challenge', { method: 'POST', body: JSON.stringify({ provider: selected }) }, true);
        challengeReady = true;
      }
      await api('/api/login/client', { method: 'POST', body: JSON.stringify({ provider: selected, account, password, answer: get('connect-answer').value }) }, true);
      get('connect-password').value = '';
      get('connect-dialog').close();
      await loadReports();
    } catch (error) {
      if (error.code === 'CAPTCHA_REQUIRED' && /^data:image\/(png|jpeg);base64,/.test(error.image || '')) {
        get('connect-captcha').hidden = false; get('connect-image').src = error.image;
        get('connect-answer').value = ''; get('connect-answer').focus();
      } else challengeReady = false;
      get('connect-message').textContent = error.message || 'Could not connect. Try again.';
    } finally { pending = false; get('connect-submit').disabled = false; get('close-connect').disabled = false; }
  });
  return { update, clear() { get('provider-connections').replaceChildren(); get('connect-password').value = ''; get('connect-dialog').close(); } };
})();
