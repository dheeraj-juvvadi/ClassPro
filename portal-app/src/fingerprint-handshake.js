export async function prepareFingerprintToken(page, log = () => {}) {
  const result = await page.evaluate(async () => {
    if (location.origin !== 'https://sp.srmist.edu.in') return { ready: false, reason: 'wrong_origin' };
    const nonce = document.getElementById('fpNonce')?.value;
    const field = document.getElementById('fpToken');
    if (!nonce || !field || field.name !== 'fpToken') return { ready: false, reason: 'missing_fields' };
    const fp = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    try {
      const response = await fetch('/srmiststudentportal/fpToken', {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ fpPayload: JSON.stringify({ fp, nonce, ts: Date.now() }) }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return { ready: false, reason: 'http_error', status: response.status };
      const data = await response.json();
      if (typeof data.fpToken !== 'string' || !data.fpToken || data.fpToken.length > 8192) return { ready: false, reason: 'invalid_token', status: response.status };
      field.value = data.fpToken;
      return { ready: true, status: response.status };
    } catch { return { ready: false, reason: 'request_failed' }; }
  });
  log({ event: 'portal_fingerprint_handshake', ...result });
  if (!result.ready) throw new Error('Student Portal fingerprint verification could not complete.');
}
