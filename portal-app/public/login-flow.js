'use strict';

// Native email-first presentation; authentication and provider retries stay in anonAuth.
globalThis.anonLoginFlow = (() => {
  const el = id => document.getElementById(id);
  const form = el('login-form');
  const account = el('account');
  const passwords = [['password', 'academia'], ['portal-password', 'portal']];
  let step = 'email';
  let submittedAccount = '';
  let isBusy = false;
  function clearErrors() {
    for (const id of ['account', 'password', 'portal-password']) {
      el(id).removeAttribute('aria-invalid');
      el(`${id}-error`).hidden = true;
      el(`${id}-error`).textContent = '';
    }
  }
  function sync(busy = isBusy) {
    isBusy = busy;
    const dual = anonAuth.enabled;
    const expanded = step === 'password';
    form.dataset.step = step;
    account.type = dual ? 'email' : 'text';
    account.inputMode = dual ? 'email' : 'text';
    account.placeholder = dual ? 'you@srmist.edu.in' : 'NetID or SRM email';
    account.readOnly = expanded;
    account.disabled = busy;
    el('login-account-field').hidden = expanded;
    el('login-account-row').hidden = !expanded;
    el('login-account-summary').textContent = account.value;
    el('login-password-stage').hidden = !expanded;
    el('login-change-account').disabled = busy;
    el('login-account-field').querySelector('label').textContent = dual ? 'Email address' : 'Your SRM ID';
    el('login-title').textContent = expanded ? (dual ? 'Both passwords.' : 'Your password.') : 'Sign in.';
    el('login-description').textContent = expanded
      ? (dual ? 'Enter your Academia and Student Portal passwords to use the complete app.' : 'Use your password and the verification code to sign in.')
      : (dual ? 'Start with your SRM email.' : 'Start with your SRM ID or email.');
    el('password-help').textContent = dual
      ? 'Both passwords are needed. Connected accounts stay connected while you finish verification.'
      : 'Use your Academia password.';
    for (const [id, provider] of passwords) {
      const connected = dual && anonAuth.isConnected(provider, account.value);
      const applicable = dual || provider === 'academia';
      el(id).required = expanded && applicable && !connected;
      el(id).disabled = busy || !expanded || !applicable || connected;
      el(id).placeholder = connected ? 'Connected' : 'Enter password';
    }
    el('manual-captcha-answer').required = expanded && !el('manual-captcha').hidden;
    el('manual-captcha-answer').disabled = busy || !expanded;
    el('manual-captcha-refresh').disabled = busy || !expanded;
    if (!busy) el('sign-in-label').textContent = expanded ? 'Sign in' : 'Continue';
  }
  function beforeSubmit() {
    sync();
    if (isBusy) return false;
    if (step === 'password') return true;
    if (!account.reportValidity()) return false;
    const identity = account.value.trim().toLowerCase();
    if (submittedAccount && identity !== submittedAccount) {
      // Preserve auth's flowAccount so it can clear a previous partial server session.
      for (const [id] of passwords) {
        el(id).value = '';
        el(id).dispatchEvent(new Event('input', { bubbles: true }));
      }
      el('manual-captcha-answer').value = '';
      el('manual-captcha-image').hidden = true;
      if (anonAuth.enabled) el('manual-captcha').hidden = true;
    }
    submittedAccount = identity;
    step = 'password';
    clearErrors();
    sync();
    const first = passwords.map(([id]) => el(id)).find(field => !field.disabled);
    (first || el('manual-captcha-answer')).focus({ preventScroll: true });
    return false;
  }
  el('login-change-account').addEventListener('click', () => {
    if (isBusy) return;
    step = 'email';
    clearErrors();
    el('login-message').hidden = true;
    el('login-message').textContent = '';
    sync();
    account.focus({ preventScroll: true });
  });
  form.addEventListener('reset', () => {
    step = 'email';
    submittedAccount = '';
    clearErrors();
    sync();
  });
  sync();
  return { beforeSubmit, sync };
})();
