(() => {
  'use strict';

  const form = document.getElementById('profile-form');
  const input = document.getElementById('display-name');
  const name = document.getElementById('profile-name');
  const initials = document.getElementById('profile-initials');
  const feedback = document.getElementById('profile-feedback');
  const reminders = document.getElementById('class-reminders');
  const reminderState = document.getElementById('reminder-state');
  const reminderFeedback = document.getElementById('reminder-feedback');

  // Demo values live only in this document; nothing is sent or stored.
  let displayName = input.value;
  reminders.checked = false;

  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    delete feedback.dataset.state;
    feedback.textContent = input.value.trim() === displayName
      ? 'Only updates this preview. Refresh to reset.'
      : 'Unsaved sample name. Choose Save sample to preview it.';
  });

  input.addEventListener('invalid', () => {
    input.setAttribute('aria-invalid', 'true');
    feedback.dataset.state = 'error';
    feedback.textContent = 'Enter a display name to try the preview.';
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const nextName = input.value.trim();
    if (!nextName || nextName.length > 60) {
      input.setAttribute('aria-invalid', 'true');
      feedback.dataset.state = 'error';
      feedback.textContent = 'Enter a display name between 1 and 60 characters.';
      input.focus();
      return;
    }

    const changed = nextName !== displayName;
    displayName = nextName;
    input.value = displayName;
    name.textContent = displayName;
    const parts = displayName.split(/\s+/);
    const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0]];
    initials.textContent = letters.map(part => Array.from(part)[0]).join('').toUpperCase();
    input.removeAttribute('aria-invalid');
    feedback.dataset.state = 'saved';
    feedback.textContent = changed
      ? 'Name saved for this preview only. Refresh to reset.'
      : 'No new changes. This sample name stays on this page only.';
  });

  reminders.addEventListener('change', () => {
    reminderState.textContent = reminders.checked ? 'On' : 'Off';
    reminderFeedback.textContent = reminders.checked
      ? 'On in this preview only. No notifications will be sent.'
      : 'Off in this preview. No notifications will be sent.';
  });
})();
