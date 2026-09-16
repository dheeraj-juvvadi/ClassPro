'use strict';

globalThis.classproAuth = (() => {
  let enabled = false;
  let started = Date.now();
  let clicks = 0;
  let keys = 0;
  let movements = 0;
  let challengeAt = 0;
  let prediction = '';
  let serverAuto = false;
  let preparing = null;
  let configuredProvider = 'academia';
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
    element('login-provider').value = configuredProvider;
    clearChallenge();
    element('provider-help').textContent = provider() === 'academia'
      ? 'Use your Academia password.' : 'Use your Student Portal password.';
    element('login-provider-caption').textContent = `Sign in with ${provider() === 'academia' ? 'Academia' : 'Student Portal'}`;
    started = Date.now();
    clicks = keys = movements = 0;
  }
  function configure(session) {
    enabled = session.authMode === 'http';
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
  async function prepareChallenge(api, automatic) {
    clearChallenge();
    let result;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        result = await api('/api/challenge', {
          method: 'POST', body: JSON.stringify({ provider: provider() }),
        }, true);
        break;
      } catch (error) {
        if (error.code !== 'SERVER_BUSY' || attempt === 4) throw error;
        element('sign-in-status').textContent = 'Waiting for Anon…';
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
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
      const result = await api('/api/login/client', { method: 'POST', body: JSON.stringify({
        ...credentials, provider: provider(), answer, integrity,
        ...(provider() === 'portal' ? { telemetry: telemetry() } : {}),
      }) }, true);
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
  return { configure, reset, login, prepare, usePortal, get enabled() { return enabled; } };
})();
