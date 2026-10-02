'use strict';
// Password controls adapted from OpenSourceUI PasswordFieldInput (Bidyut Kundu).
// See /licenses in the project. All field behavior uses native controls.
(() => {
  const form = document.querySelector('#login-form');
  const account = document.querySelector('#account');
  const accountError = document.querySelector('#account-error');
  const clearAccountError = () => {
    account.removeAttribute('aria-invalid');
    accountError.hidden = true;
    accountError.textContent = '';
  };
  account.addEventListener('invalid', () => {
    account.setAttribute('aria-invalid', 'true');
    accountError.textContent = account.type === 'email'
      ? (account.validity.typeMismatch ? 'Enter a valid email address.' : 'Enter your SRM email.')
      : 'Enter your SRM ID or email.';
    accountError.hidden = false;
  });
  account.addEventListener('input', clearAccountError);
  form.addEventListener('reset', clearAccountError);
  for (const id of ['password', 'portal-password']) {
    const field = document.getElementById(id);
    const toggle = document.getElementById(`${id}-toggle`);
    const caps = document.getElementById(`${id}-caps`);
    const error = document.getElementById(`${id}-error`);
    const name = id === 'password' ? 'password' : 'Student Portal password';
    const clearError = () => {
      field.removeAttribute('aria-invalid');
      error.hidden = true;
      error.textContent = '';
    };
    field.addEventListener('invalid', () => {
      field.setAttribute('aria-invalid', 'true');
      error.textContent = `Enter your ${id === 'password' ? 'Academia' : 'Student Portal'} password.`;
      error.hidden = false;
    });
    function reveal(visible) {
      field.type = visible ? 'text' : 'password';
      toggle.textContent = visible ? 'Hide' : 'Show';
      toggle.setAttribute('aria-pressed', String(visible));
      toggle.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${name}`);
    }
    const syncDisabled = () => {
      toggle.disabled = field.disabled;
      if (field.disabled) { reveal(false); caps.hidden = true; }
    };
    toggle.addEventListener('click', () => {
      if (!field.disabled) reveal(field.type === 'password');
    });
    const updateCaps = event => {
      caps.hidden = document.activeElement !== field || !event.getModifierState?.('CapsLock');
    };
    field.addEventListener('keydown', updateCaps);
    field.addEventListener('keyup', updateCaps);
    field.addEventListener('blur', () => { caps.hidden = true; });
    field.addEventListener('input', () => { clearError(); if (!field.value) reveal(false); });
    form.addEventListener('reset', () => { clearError(); reveal(false); caps.hidden = true; });
    new MutationObserver(syncDisabled).observe(field, { attributes: true, attributeFilter: ['disabled'] });
    syncDisabled();
  }
  const view = document.getElementById('login-view');
  const card = view.querySelector('.login-card');
  const viewport = window.visualViewport;
  const banner = document.querySelector('.consent-banner');
  function keepFocusVisible() {
    const focused = document.activeElement;
    if (!card.contains(focused) || focused === card) return;
    const field = focused.getBoundingClientRect();
    const bounds = card.getBoundingClientRect();
    if (field.bottom > bounds.bottom - 20) card.scrollTop += field.bottom - bounds.bottom + 20;
    else if (field.top < bounds.top + 20) card.scrollTop -= bounds.top + 20 - field.top;
  }
  function fitViewport() {
    const height = viewport?.height ?? window.innerHeight;
    const top = viewport?.offsetTop ?? 0;
    view.style.setProperty('--login-viewport-height', `${height}px`);
    view.style.setProperty('--login-viewport-top', `${top}px`);
    view.toggleAttribute('data-short-viewport', height < 580);
    const bounds = banner && !banner.hidden ? banner.getBoundingClientRect() : null;
    const clearance = bounds && bounds.top < top + height ? Math.max(0, top + height - bounds.top + 12) : 0;
    view.style.setProperty('--login-consent-clearance', `${clearance}px`);
    keepFocusVisible();
  }
  let frame = 0;
  const scheduleFit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fitViewport);
  };
  viewport?.addEventListener('resize', scheduleFit);
  viewport?.addEventListener('scroll', scheduleFit);
  window.addEventListener('resize', scheduleFit);
  form.addEventListener('focusin', scheduleFit);
  new MutationObserver(scheduleFit).observe(view, { attributes: true, attributeFilter: ['hidden'] });
  if (banner) {
    new MutationObserver(scheduleFit).observe(banner, { attributes: true, attributeFilter: ['hidden'] });
    if (typeof ResizeObserver === 'function') new ResizeObserver(scheduleFit).observe(banner);
  }
  fitViewport();
})();
