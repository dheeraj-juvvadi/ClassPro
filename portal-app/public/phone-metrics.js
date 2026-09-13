'use strict';
(() => {
  let id;
  try { id = sessionStorage.getItem('portal-test-id'); } catch {}
  if (!id) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem('portal-test-id', id); } catch {}
  }
  window.portalTestMetric = (event, fields = {}) => {
    fetch('/api/test-metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, testId: id, event }), keepalive: true }).catch(() => {});
  };
  document.querySelector('#test-session').textContent = ` · Phone test ${id}`;
  window.portalTestMetric('ready', { width: innerWidth, height: innerHeight });
  window.addEventListener('error', () => window.portalTestMetric('error', { ok: false }));
  window.addEventListener('unhandledrejection', () => window.portalTestMetric('error', { ok: false }));
})();
