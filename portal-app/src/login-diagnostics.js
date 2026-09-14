export function summarizeSubmission(body, expected, fields, origin, referer, userAgent) {
  const form = new URLSearchParams(body);
  let telemetry = null;
  try { telemetry = JSON.parse(Buffer.from(form.get('telemetryPayload') || '', 'base64').toString('utf8')); } catch {}
  return {
    accountMatches: form.get('username') === expected.account,
    passwordMatches: form.get('password') === expected.password,
    captchaMatches: form.get('captcha') === expected.captcha,
    csrfFieldPresent: form.has('csrfPreventionSalt'),
    csrfNonempty: Boolean(form.get('csrfPreventionSalt')),
    domainFieldPresent: Boolean(fields.domain && form.has(fields.domain)),
    interactionFieldPresent: Boolean(fields.interaction && form.has(fields.interaction)),
    telemetryPresent: Boolean(telemetry && typeof telemetry === 'object'),
    keyboardEventsPresent: typeof telemetry?.keystrokeCount === 'number' && telemetry.keystrokeCount > 0,
    typingDurationPresent: typeof telemetry?.typingSpeedMs === 'number' && telemetry.typingSpeedMs > 0,
    automationReported: telemetry?.webdriver === true,
    headlessUserAgent: /HeadlessChrome/.test(userAgent || ''),
    originMatches: origin === 'https://sp.srmist.edu.in',
    refererMatches: typeof referer === 'string' && referer.startsWith('https://sp.srmist.edu.in/'),
  };
}

export async function observeLogin(page, expected, log) {
  if (!log) return { finish() {}, close() {} };
  const started = Date.now();
  const fields = await page.evaluate(() => ({
    domain: window.SECURE_CONFIG?.domainFieldName,
    interaction: window.SECURE_CONFIG?.captchaFieldName,
    telemetryReady: typeof window.attachTelemetryToForm === 'function',
  }));
  let submission = null;
  let responseStatus = null;
  let scriptErrors = 0;
  const onError = () => { scriptErrors++; };
  const onRequest = request => {
    if (request.method() !== 'POST' || !request.isNavigationRequest() || new URL(request.url()).origin !== 'https://sp.srmist.edu.in') return;
    const headers = request.headers();
    submission = summarizeSubmission(request.postData() || '', expected, fields, headers.origin, headers.referer, headers['user-agent']);
  };
  const onResponse = response => {
    if (response.request().method() === 'POST' && response.request().isNavigationRequest()
      && new URL(response.url()).origin === 'https://sp.srmist.edu.in') responseStatus = response.status();
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('pageerror', onError);
  return {
    finish(outcome) {
      log({ event: 'portal_submission', outcome, duration_ms: Date.now() - started,
        upstream_status: responseStatus, telemetry_ready: fields.telemetryReady,
        script_errors: scriptErrors, submission_observed: submission !== null, ...submission });
    },
    close() {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('pageerror', onError);
    },
  };
}
