'use strict';

globalThis.providerConnections = (() => {
  const get = id => document.getElementById(id);
  const label = name => name === 'academia' ? 'Academia' : 'Student Portal';
  let selected = 'academia', pending = false, challengeReady = false;
  function update(report) {
    const container = get('provider-connections'); container.replaceChildren();
    for (const provider of ['academia', 'portal']) {
      const state = report.connections?.[provider];
      if (state?.connected && !state.expired) continue;
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${state?.expired ? 'Reconnect' : 'Connect'} ${label(provider)}`;
      button.addEventListener('click', () => {
        get('accounts-dialog').close();
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
      const result = await api('/api/login/client', { method: 'POST', body: JSON.stringify({ provider: selected, account, password, answer: get('connect-answer').value }) }, true);
      if (result.authenticated !== true) throw new Error('The server did not confirm this connection. Please retry.');
      get('connect-password').value = '';
      get('connect-message').textContent = `${label(selected)} signed in. Loading reports…`;
      const reports = await loadReports();
      if (!reports?.connections?.[selected]?.connected) throw new Error('Sign-in finished, but the connection could not be confirmed. Refresh reports and retry.');
      get('connect-message').textContent = selected === 'academia' && !reports.schedule?.entries?.length
        ? 'Academia connected, but it returned no timetable. Your attendance is still available. Close this dialog to continue.'
        : `${label(selected)} connected. Your reports are updated. Close this dialog to continue.`;
      challengeReady = false;
    } catch (error) {
      if (error.code === 'CAPTCHA_REQUIRED' && /^data:image\/(png|jpeg);base64,/.test(error.image || '')) {
        get('connect-captcha').hidden = false; get('connect-image').src = error.image;
        get('connect-answer').value = ''; get('connect-answer').focus();
      } else challengeReady = false;
      get('connect-message').textContent = error.message || 'Could not connect. Try again.';
    } finally { pending = false; get('connect-submit').disabled = false; get('close-connect').disabled = false; }
  });
  return { update, clear() { get('provider-connections').replaceChildren(); get('connect-password').value = ''; get('connect-dialog').close(); get('accounts-dialog').close(); } };
})();
