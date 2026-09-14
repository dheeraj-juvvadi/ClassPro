import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';

const origin = 'https://sp.srmist.edu.in';
const scripts = new Set(['guardlogin.js', 'guardloginbottom.js', 'secure2.js']);
const endpoints = new Set(['youLogin.jsp', 'LoginServlet', 'SCaptchaServlet', 'fpToken', 'fpCToken', 'HRDSystem.jsp']);

export function trackPortalNetwork(page) {
  const events = [];
  const pending = new Set();
  let count = 0;
  const onResponse = response => {
    const url = new URL(response.url());
    const resource = url.pathname.split('/').pop();
    if (url.origin !== origin || !(scripts.has(resource) || endpoints.has(resource)) || count >= 24) return;
    count++;
    const receivedAt = Date.now();
    const task = (async () => {
      const headers = response.headers();
      const serverTime = Date.parse(headers.date || '');
      const event = { resource, status: response.status(), received_at: new Date(receivedAt).toISOString() };
      event.server_clock_delta_ms = Number.isFinite(serverTime) ? serverTime - receivedAt : null;
      try { event.destination = await response.serverAddr(); } catch { event.destination = null; }
      try {
        const tls = await response.securityDetails();
        event.tls = tls ? { protocol: tls.protocol, issuer: tls.issuer, subject: tls.subjectName } : null;
      } catch { event.tls = null; }
      if (scripts.has(resource) && response.ok()) {
        const body = await response.body();
        event.script_bytes = body.length;
        event.script_sha256 = createHash('sha256').update(body).digest('hex');
      }
      events.push(event);
    })().catch(() => events.push({ resource, status: response.status(), inspection_failed: true }));
    pending.add(task);
    task.finally(() => pending.delete(task));
  };
  page.on('response', onResponse);
  return {
    async report(log = () => {}) {
      await Promise.all([...pending]);
      let addresses = [];
      try { addresses = await lookup('sp.srmist.edu.in', { all: true }); } catch {}
      let structure = null;
      try {
        structure = await page.evaluate(() => {
          const form = document.querySelector('#login_form');
          const config = window.SECURE_CONFIG || {};
          const image = document.querySelector('#secure_captcha');
          let timestamp = NaN;
          try { timestamp = Number(new URL(image?.getAttribute('data-src'), location.href).searchParams.get('ts')); } catch {}
          const source = image?.currentSrc || '';
          return {
            login_form_present: Boolean(form),
            form_action_expected: form?.action === 'https://sp.srmist.edu.in/srmiststudentportal/LoginServlet',
            security_fields: ['nonce', 'domainFieldName', 'captchaFieldName', 'randomDelimiter'].filter(key => typeof config[key] === 'string' && config[key].length > 0),
            fingerprint_nonce_present: Boolean(document.getElementById('fpNonce')?.value),
            challenge_age_ms: Number.isFinite(timestamp) && timestamp > 0 ? Date.now() - timestamp : null,
            image_source: source.startsWith('blob:') ? 'blob' : source.startsWith('data:') ? 'data' : 'other',
          };
        });
      } catch {}
      log({ event: 'portal_network_evidence', dns: addresses, responses: events.splice(0), structure });
      count = 0;
    },
    close() { page.off('response', onResponse); },
  };
}
