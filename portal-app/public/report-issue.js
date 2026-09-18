'use strict';
(() => {
  const categories = { SIGN_IN_PROBLEM: 'Sign-in trouble', SYNC_PROBLEM: 'Reports won’t sync',
    SCHEDULE_PROBLEM: 'Timetable or day order', MARKS_PROBLEM: 'Marks or attendance display', LAYOUT_PROBLEM: 'Layout or controls' };
  const form = document.getElementById('issue-form');
  if (!form) {
    const confirmed = document.getElementById('issue-thanks-confirmed');
    if (confirmed) {
      let sent = false;
      try { sent = Date.now() - Number(sessionStorage.getItem('anon.report-received')) < 600000; sessionStorage.removeItem('anon.report-received'); } catch {}
      confirmed.hidden = !sent;
      document.getElementById('issue-thanks-direct').hidden = sent;
    }
    return;
  }
  const button = document.getElementById('issue-send');
  const status = document.getElementById('issue-status');
  const release = new URL(document.currentScript.src).searchParams.get('v') || '';
  let active = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (active) return;
    const code = document.getElementById('issue-category').value;
    const page = document.getElementById('issue-page').value;
    status.textContent = '';
    if (!categories[code]) { status.textContent = 'Choose the issue you noticed.'; return; }
    if (!navigator.onLine) { status.textContent = 'You’re offline. Reconnect, then send your report.'; return; }
    active = true; button.disabled = true; button.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    const entry = { kind: 'user_report', code, page, release,
      viewport: innerWidth < 700 ? 'mobile' : innerWidth < 1000 ? 'tablet' : 'desktop' };
    try {
      const response = await fetch('/api/client-events', { method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: [entry] }),
        cache: 'no-store', signal: AbortSignal.timeout(12000) });
      const result = await response.json();
      if (!response.ok || result.accepted !== 1) throw new Error('not accepted');
      try { sessionStorage.setItem('anon.report-received', String(Date.now())); } catch {}
      location.assign('/thank-you.html');
    } catch {
      status.textContent = navigator.onLine ? 'Your report wasn’t saved. Please try again shortly.' : 'You’re offline. Reconnect, then send your report.';
    } finally {
      active = false; button.disabled = false; button.textContent = 'Send report';
      form.setAttribute('aria-busy', 'false');
    }
  });
})();
