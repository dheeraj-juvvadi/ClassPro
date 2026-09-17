'use strict';
(() => {
  const key = 'anon.analytics-choice.v1';
  let choice = null;
  try { choice = localStorage.getItem(key); } catch {}
  let loaded = false;
  function analytics() {
    if (loaded || choice !== 'allow') return;
    loaded = true;
    for (const [name, queue, path] of [
      ['va', 'vaq', '/_vercel/insights/script.js'],
      ['si', 'siq', '/_vercel/speed-insights/script.js'],
    ]) {
      globalThis[name] ||= (...args) => (globalThis[queue] ||= []).push(args);
      globalThis[name]('beforeSend', event => {
        if (choice !== 'allow') return null;
        // Shared links can contain arbitrary queries; omit them from telemetry.
        const clean = { ...event };
        for (const field of ['url', 'href']) {
          if (typeof clean[field] === 'string') {
            try { const url = new URL(clean[field], location.origin); url.search = ''; url.hash = ''; clean[field] = url.href; } catch {}
          }
        }
        return clean;
      });
      const script = document.createElement('script');
      script.src = path; script.defer = true;
      document.head.append(script);
    }
  }
  const banner = document.createElement('section');
  banner.className = 'consent-banner';
  banner.setAttribute('aria-label', 'Cookies and analytics');
  banner.hidden = choice === 'allow' || choice === 'decline';
  const text = document.createElement('div');
  const heading = document.createElement('strong'); heading.textContent = 'Your space. Your choice.';
  const description = document.createElement('p');
  description.textContent = 'We use a session cookie and browser storage to keep Anon working. Allow optional visit and performance analytics?';
  const policy = document.createElement('a'); policy.href = '/privacy.html'; policy.textContent = 'Privacy & storage';
  text.append(heading, description, policy);
  const actions = document.createElement('div'); actions.className = 'consent-actions';
  for (const [value, label] of [['decline', 'Essential only'], ['allow', 'Allow analytics']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => {
      choice = value;
      try { localStorage.setItem(key, choice); } catch {}
      banner.hidden = true;
      analytics();
    });
    actions.append(button);
  }
  banner.append(text, actions); document.body.append(banner);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-consent-open]')) {
      banner.hidden = false;
      actions.querySelector('button').focus();
    }
  });
  analytics();
})();
