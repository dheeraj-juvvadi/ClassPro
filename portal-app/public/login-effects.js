'use strict';
// Adapted for this app from React Bits SpotlightCard (David Haz) and
// OpenSourceUI PasswordFieldInput (Bidyut Kundu). See /licenses in the project.
(() => {
  const field = document.querySelector('#password');
  const toggle = document.querySelector('#password-toggle');
  toggle.addEventListener('click', () => {
    const visible = field.type === 'password';
    field.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  });
  field.form.addEventListener('reset', () => {
    field.type = 'password';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', 'Show password');
  });
})();
