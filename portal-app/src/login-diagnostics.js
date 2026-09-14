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
    honeypotEmpty: [...form.entries()].filter(([name]) => name.startsWith('ph_')).every(([, value]) => value === ''),
    fingerprintPayloadPresent: Boolean(form.get('fpPayload')),
    fingerprintTokenPresent: Boolean(form.get('fpToken')),
    domainProofMatches: Boolean(fields.domain) && form.getAll(fields.domain).every(value => {
      return Buffer.from(value, 'base64').toString('utf8') === 'ni.ude.tsimrs.ps';
    }),
    duplicateAccount: form.getAll('username').length > 1,
    duplicatePassword: form.getAll('password').length > 1,
    duplicateCaptcha: form.getAll('captcha').length > 1,
  };
}

export async function observeLogin(page, expected, log) {
  if (!log) return { finish() {}, close() {} };
  const started = Date.now();
  const fields = await page.evaluate(() => ({
    domain: window.SECURE_CONFIG?.domainFieldName,
    interaction: window.SECURE_CONFIG?.captchaFieldName,
    telemetryReady: typeof window.attachTelemetryToForm === 'function',
    pageAgeSeconds: Math.round(performance.now() / 1000),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cookieEnabled: navigator.cookieEnabled,
  }));
  let submission = null;
  let responseStatus = null;
  let scriptErrors = 0;
  let failedRequests = 0;
  let upstreamCookiesPresent = false;
  const headerReads = [];
  const redirects = [];
  const onFailure = () => { failedRequests++; };
  const onError = () => { scriptErrors++; };
  const onRequest = request => {
    if (request.method() !== 'POST' || !request.isNavigationRequest() || new URL(request.url()).origin !== 'https://sp.srmist.edu.in') return;
    const headers = request.headers();
    headerReads.push(request.allHeaders().then(all => { upstreamCookiesPresent = Boolean(all.cookie); }).catch(() => {}));
    submission = summarizeSubmission(request.postData() || '', expected, fields, headers.origin, headers.referer, headers['user-agent']);
  };
  const onResponse = response => {
    if (response.request().isNavigationRequest()) {
      const url = new URL(response.url());
      const location = url.origin !== 'https://sp.srmist.edu.in' ? 'external'
        : url.pathname.endsWith('/LoginServlet') ? 'login_submit'
        : url.pathname.endsWith('/youLogin.jsp') ? 'login_page'
        : url.pathname.endsWith('/HRDSystem.jsp') ? 'dashboard' : 'other_portal';
      if (redirects.length < 8) redirects.push({ location, status: response.status() });
    }
    if (response.request().method() === 'POST' && response.request().isNavigationRequest()
      && new URL(response.url()).origin === 'https://sp.srmist.edu.in') responseStatus = response.status();
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('pageerror', onError);
  page.on('requestfailed', onFailure);
  return {
    async finish(outcome) {
      await Promise.all(headerReads);
      let responseState = null;
      try {
        responseState = await page.evaluate(() => {
          const text = document.body.innerText.toLowerCase();
          return {
            loginForm: Boolean(document.querySelector('#login_form')),
            dashboard: Boolean(document.querySelector('#userHomePage')),
            invalidCredentials: /invalid (?:net\s*id|password|credentials)|incorrect password/.test(text),
            invalidCaptcha: /invalid captcha|captcha[^\n]*(?:incorrect|mismatch|invalid)/.test(text),
            accessDenied: /access denied|forbidden|request blocked/.test(text),
            securityRejection: /suspicious|security violation|unusual activity|automated request/.test(text),
            sessionLimit: /concurrent|maximum.*session|session.*limit/.test(text),
          };
        });
      } catch {}
      log({ event: 'portal_submission', outcome, duration_ms: Date.now() - started,
        upstream_status: responseStatus, telemetry_ready: fields.telemetryReady,
        page_age_seconds: fields.pageAgeSeconds, timezone: fields.timezone,
        cookies_enabled: fields.cookieEnabled, upstream_cookies_present: upstreamCookiesPresent,
        failed_requests: failedRequests, redirects, response_state: responseState,
        script_errors: scriptErrors, submission_observed: submission !== null, ...submission });
    },
    close() {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('pageerror', onError);
      page.off('requestfailed', onFailure);
    },
  };
}
