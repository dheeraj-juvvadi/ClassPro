'use strict';
globalThis.anonClientLogs = (() => {
  const queue = [], seen = new Set();
  let timer = null, sending = false, sent = 0;
  const script = document.currentScript;
  const release = new URL(script.src).searchParams.get('v') || 'unknown';
  const page = () => document.body?.classList.contains('garden-login') ? 'login' : document.body?.dataset.page || 'unknown';
  const allowedNames = new Set(['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'Error']);
  const consent = () => { try { return localStorage.getItem('anon.analytics-choice.v1') === 'allow'; } catch { return false; } };
  function capture(event) {
    if (event.kind === 'page_view' && !consent()) return;
    if (sent >= 30 || queue.length >= 10) return;
    const entry = { kind: event.kind, page: event.page || page(), release,
      viewport: innerWidth < 700 ? 'mobile' : innerWidth < 1000 ? 'tablet' : 'desktop' };
    for (const key of ['code', 'route', 'status', 'duration_ms', 'request_id', 'source', 'line', 'column', 'consent']) {
      if (event[key] !== undefined) entry[key] = event[key];
    }
    const fingerprint = JSON.stringify(entry);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint); queue.push(entry);
    if (!timer) timer = setTimeout(flush, 3000);
  }
  async function flush() {
    clearTimeout(timer); timer = null;
    if (sending || !queue.length || !navigator.onLine) return;
    const events = queue.splice(0, 10).filter(e => e.kind !== 'page_view' || consent());
    if (!events.length) return;
    sending = true; sent += events.length;
    try {
      await fetch('/api/client-events', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }),
        keepalive: true, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    } catch { /* Never report logging failures recursively. */ }
    finally { sending = false; if (queue.length) timer = setTimeout(flush, 3000); }
  }
  addEventListener('error', event => {
    if (event.target !== window) {
      capture({ kind: 'asset_error', code: 'ASSET_FAILED' }); return;
    }
    let source = 'unknown';
    try { const url = new URL(event.filename); if (url.origin === location.origin) source = url.pathname.split('/').at(-1); } catch {}
    capture({ kind: 'runtime_error', code: allowedNames.has(event.error?.name) ? event.error.name : 'UnknownError',
      source, line: event.lineno || 0, column: event.colno || 0 });
  }, true);
  addEventListener('unhandledrejection', event => capture({ kind: 'promise_error',
    code: allowedNames.has(event.reason?.name) ? event.reason.name : 'UnknownError' }));
  addEventListener('online', flush);
  addEventListener('pagehide', flush);
  return { capture, flush };
})();
