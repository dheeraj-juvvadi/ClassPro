'use strict';
globalThis.anonSyncControl = (() => {
  const notice = document.getElementById('sync-notice');
  const label = document.getElementById('sync-notice-label');
  const progress = document.getElementById('sync-progress');
  let active = 0, pending = false, notifying = false;
  let lastSynced = 0, baseline = 0, outcome = null, settleTimer, hideTimer;

  function paint(running) {
    progress.textContent = running ? 'Syncing reports…' : '';
    for (const id of ['refresh', 'settings-sync']) {
      const button = document.getElementById(id);
      button.classList.toggle('syncing', running);
      button.disabled = running;
      button.setAttribute('aria-busy', String(running));
      button.setAttribute('aria-label', running ? 'Syncing reports' : 'Sync reports');
      button.toggleAttribute('data-paused', document.hidden);
    }
  }
  function show(state, text) {
    clearTimeout(hideTimer);
    notice.dataset.state = state;
    notice.toggleAttribute('data-paused', document.hidden);
    if (label.textContent !== text) label.textContent = text;
    notice.hidden = false;
    notice.classList.remove('leaving');
  }
  function dismiss() {
    notice.classList.add('leaving');
    hideTimer = setTimeout(() => { notice.hidden = true; }, 180);
  }
  function observe(reports) {
    const stamp = Number(reports.sync?.syncedAt);
    if (Number.isFinite(stamp) && stamp > 0) lastSynced = stamp;
  }
  function reset() {
    clearTimeout(settleTimer); clearTimeout(hideTimer);
    active = 0; pending = false; notifying = false; outcome = null;
    lastSynced = 0; baseline = 0; retryOwnText = null;
    notice.hidden = true;
    label.textContent = '';
    paint(false);
  }
  function fail(error = {}) {
    if (error.expired) { reset(); return; }
    pending = false;
    outcome = navigator.onLine ? ['error', 'Couldn’t sync · try again'] : ['offline', 'Offline · showing saved data'];
  }
  let retryOwnText = null;
  // Source-specific retry notices. `retryWait` stays on screen until recovery,
  // exhaustion or the next sync outcome replaces it; Sync stays enabled.
  function retryWait(text) {
    if (active || pending) return;
    retryOwnText = text;
    show('retry', text);
  }
  function retryExhausted(text) {
    if (active || pending) return false;
    retryOwnText = text;
    show('error', text);
    hideTimer = setTimeout(dismiss, 6000);
    return true;
  }
  function retryClear() {
    if (retryOwnText === null || active || pending) return;
    if (label.textContent === retryOwnText) dismiss();
    retryOwnText = null;
  }
  function end() {
    active = Math.max(0, active - 1);
    if (active || pending) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      paint(false);
      // A retry-owned notice (waiting/exhausted) says more than a generic
      // outcome; don't stamp over it for this cycle.
      if (notifying && outcome && !retryOwnText) {
        show(...outcome);
        hideTimer = setTimeout(dismiss, outcome[0] === 'success' ? 2600 : 5000);
      }
      notifying = false;
    }, 0);
  }
  document.addEventListener('visibilitychange', () => {
    notice.toggleAttribute('data-paused', document.hidden);
    for (const id of ['refresh', 'settings-sync']) document.getElementById(id).toggleAttribute('data-paused', document.hidden);
  });
  window.addEventListener('offline', () => {
    if (!active && !pending) return;
    fail(); paint(false);
    if (notifying) show(...outcome);
    if (!active) end();
  });
  return {
    observe, reset, fail, end, retryWait, retryExhausted, retryClear,
    offline() {
      if (active || pending) return;
      show('offline', 'Offline · showing saved data');
      hideTimer = setTimeout(dismiss, 5000);
    },
    begin({ notify = true } = {}) {
      clearTimeout(settleTimer); clearTimeout(hideTimer);
      retryOwnText = null;
      if (!active && !pending) {
        baseline = lastSynced; notifying = notify;
      }
      active++; notifying ||= notify; outcome = null;
      notice.hidden = true;
      paint(true);
    },
    complete(reports) {
      observe(reports);
      pending = !!reports.sync?.pending;
      if (pending) {
        notifying = true;
        return;
      }
      const partial = reports.attendance?.error || reports.marks?.error || reports.warnings?.length;
      outcome = partial ? ['error', 'Some data couldn’t sync']
        : ['success', lastSynced > baseline ? 'Synced' : 'Up to date'];
    },
  };
})();
