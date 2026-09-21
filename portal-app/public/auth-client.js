'use strict';

globalThis.anonAuth = (() => {
  let enabled = true;
  let started = Date.now();
  let clicks = 0;
  let keys = 0;
  let movements = 0;
  let challengeAt = 0;
  let prediction = '';
  let serverAuto = false;
  let preparing = null;
  let configuredProvider = 'academia';
  let flowAccount = '';
  const connected = new Set();
  const element = id => document.getElementById(id);
  const provider = () => element('login-provider').value;
  const clearChallenge = () => {
    challengeAt = 0;
    prediction = '';
    serverAuto = false;
    element('manual-captcha-answer').value = '';
    element('manual-captcha-answer').required = false;
    element('manual-captcha-image').hidden = true;
    element('manual-captcha').hidden = true;
  };
  function reset() {
    if (!enabled) return;
    connected.clear();
    flowAccount = '';
    element('login-provider').value = configuredProvider;
    clearChallenge();
    element('provider-help').textContent = provider() === 'academia'
      ? 'Use your Academia password.' : 'Use your Student Portal password.';
    started = Date.now();
    clicks = keys = movements = 0;
  }
  function configure(session) {
    enabled = session.authMode === 'http';
    element('manual-captcha').hidden = enabled;
    element('manual-captcha-answer').required = !enabled;
    element('portal-password-group').hidden = !enabled;
    element('password').required = !enabled;
    configuredProvider = 'academia';
    element('provider-choice').hidden = true;
    if (enabled) {
      element('login-provider').value = configuredProvider;
      reset();
    }
  }
  function manual(image, status) {
    prediction = '';
    element('manual-captcha').hidden = false;
    element('manual-captcha-answer').required = true;
    element('manual-captcha-status').textContent = status;
    if (image && /^data:image\/(png|jpeg);base64,/.test(image)) {
      element('manual-captcha-image').src = image;
      element('manual-captcha-image').hidden = false;
    }
    element('manual-captcha-answer').focus();
  }
  function telemetry() {
    return {
      startTime: started, submitTime: Date.now(), timeOnPageMs: Date.now() - started,
      timezoneOffset: new Date().getTimezoneOffset(), screenWidth: screen.width,
      screenHeight: screen.height, colorDepth: screen.colorDepth,
      devicePixelRatio: devicePixelRatio, platform: navigator.platform,
      userAgent: navigator.userAgent, language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency || 1,
      touchSupport: navigator.maxTouchPoints > 0, webdriver: navigator.webdriver,
      mouseClicks: clicks, mouseMovements: movements, keystrokeCount: keys,
      typingSpeedMs: keys ? Math.round((Date.now() - started) / keys) : 0,
    };
  }
  function prepare(api, automatic) {
    if (preparing) return preparing;
    preparing = prepareChallenge(api, automatic).finally(() => { preparing = null; });
    return preparing;
  }
  function waiting(delay) {
    element('sign-in-status').textContent = `Anon is busy. Retrying in ${Math.ceil(delay / 1000)}s…`;
  }
  async function prepareChallenge(api, automatic) {
    clearChallenge();
    const result = await anonAdmission.request(() => api('/api/challenge', {
      method: 'POST', body: JSON.stringify({ provider: provider() }),
    }, true), waiting);
    challengeAt = Date.now();
    if (result.required === false) return;
    if (!result.image || !/^data:image\/(png|jpeg);base64,/.test(result.image)) {
      throw new Error('Could not load SRM verification. Please retry.');
    }
    element('manual-captcha-image').src = result.image;
    serverAuto = result.serverAuto === true && automatic;
    if (serverAuto) return;
    if (automatic) {
      element('sign-in-status').textContent = 'Reading verification code…';
      try {
        const resultOcr = await portalOcr.solve(result.image);
        if (/^[A-Za-z0-9]{4,8}$/.test(resultOcr.answer || '')) {
          prediction = resultOcr.answer;
          return;
        }
      } catch {}
    }
    manual(result.image, 'Enter the code shown to finish signing in.');
  }
  async function login(api, credentials) {
    if (!challengeAt || Date.now() - challengeAt >= 90000) await prepare(api, true);
    const answer = prediction || element('manual-captcha-answer').value;
    if (provider() === 'portal' && !answer && !serverAuto) return null;
    const integrity = await createCredentialIntegrity(credentials.account, credentials.password, answer);
    try {
      const deadline = performance.now() + Math.max(0, Math.min(60000, 75000 - (Date.now() - challengeAt)));
      const result = await anonAdmission.request(() => api('/api/login/client', { method: 'POST', body: JSON.stringify({
        ...credentials, provider: provider(), answer, integrity,
        ...(provider() === 'portal' ? { telemetry: telemetry() } : {}),
      }) }, true), waiting, deadline);
      clearChallenge();
      return result;
    } catch (error) {
      if (error.code === 'CAPTCHA_REQUIRED' || error.code === 'CAPTCHA_INVALID') {
        if (error.image) {
          manual(error.image, error.message);
        } else {
          await prepare(api, false);
        }
        return null;
      }
      clearChallenge();
      throw error;
    }
  }
  async function loginBoth(api, credentials) {
    const account = credentials.account.trim();
    if (flowAccount && flowAccount !== account.toLowerCase()) {
      await api('/api/session', { method: 'DELETE' }, true);
      connected.clear();
      clearChallenge();
    }
    flowAccount = account.toLowerCase();
    const attempts = [
      ['academia', credentials.password, 'password'],
      ['portal', credentials.portalPassword, 'portal-password'],
    ].filter(([name, password]) => password && !connected.has(name));
    if (challengeAt && element('manual-captcha-answer').value) {
      attempts.sort(([a], [b]) => Number(b === provider()) - Number(a === provider()));
    }
    if (!attempts.length && !connected.size) throw new Error('Enter your Academia or Student Portal password.');
    const warnings = [];
    for (const [name, password, field] of attempts) {
      if (provider() !== name) {
        element('login-provider').value = name;
        clearChallenge();
      }
      const label = name === 'academia' ? 'Academia' : 'Student Portal';
      element('sign-in-status').textContent = `Connecting ${label}…`;
      try {
        const result = await login(api, { account, password, remember: credentials.remember });
        if (!result) return null; // Keep manual verification in the same form.
        if (result.authenticated !== true) throw new Error('Sign-in was not confirmed.');
        connected.add(name);
        element(field).value = '';
      } catch (error) {
        warnings.push(`${label}: ${error.message || 'Could not connect.'}`);
      }
    }
    if (!connected.size) throw new Error(warnings.join(' '));
    return { authenticated: true, warning: warnings.length ? `${warnings.join(' ')} You can reconnect in Settings.` : '' };
  }
  document.addEventListener('pointerdown', () => { if (enabled) clicks++; }, { passive: true });
  document.addEventListener('pointermove', () => { if (enabled) movements++; }, { passive: true });
  document.addEventListener('keydown', () => { if (enabled) keys++; }, { passive: true });
  document.addEventListener('DOMContentLoaded', () => {
    element('login-provider').addEventListener('change', () => {
      element('password').value = '';
      configuredProvider = provider();
      reset();
    });
  });
  function usePortal() {
    configuredProvider = 'portal';
    element('password').value = '';
    reset();
    element('password').focus();
  }
  return { configure, reset, login, loginBoth, prepare, usePortal, get enabled() { return enabled; } };
})();
