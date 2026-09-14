export function redactPortalConsole(text, secrets = []) {
  let safe = String(text);
  for (const secret of [...secrets].filter(value => typeof value === 'string' && value).sort((first, second) => second.length - first.length)) {
    for (const value of new Set([secret, encodeURIComponent(secret)])) safe = safe.split(value).join('[redacted]');
  }
  return safe.replace(/https?:\/\/[^\s"'<>]+/g, value => {
    try { const url = new URL(value); return url.origin + '/[path redacted]'; } catch { return '[url redacted]'; }
  }).replace(/((?:password|authorization|cookie|token|secret|captcha|netid|username)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/[A-Za-z0-9_+/=-]{24,}/g, '[token redacted]').slice(0, 1000);
}

export function capturePortalConsole(page) {
  const events = [];
  const record = entry => { if (events.length < 24) events.push(entry); };
  const category = text => /telemetry.*(?:failed|initialize)/i.test(text) ? 'telemetry_initialization'
    : /content security policy|refused to/i.test(text) ? 'browser_policy'
    : /net::|failed to fetch|networkerror/i.test(text) ? 'network'
    : /uncaught|referenceerror|typeerror/i.test(text) ? 'javascript' : 'other';
  const resource = value => {
    try {
      const url = new URL(value);
      if (url.origin !== 'https://sp.srmist.edu.in') return 'external';
      const file = url.pathname.split('/').pop();
      return ['guardlogin.js', 'guardloginbottom.js', 'secure2.js', 'LoginServlet', 'SCaptchaServlet', 'HRDSystem.jsp', 'youLogin.jsp'].includes(file) ? file : 'other_portal';
    } catch { return 'unknown'; }
  };
  const onConsole = message => {
    if (!['error', 'warning', 'log', 'info', 'debug'].includes(message.type())) return;
    record({ kind: 'console', level: message.type(), category: category(message.text()), resource: resource(message.location().url), text: message.text().slice(0, 4000) });
  };
  const onError = error => record({ kind: 'pageerror', category: category(error.message), text: error.message.slice(0, 4000) });
  const onFailure = request => record({ kind: 'requestfailed', resource: resource(request.url()) });
  const onResponse = response => {
    if (response.status() >= 400) record({ kind: 'http_error', resource: resource(response.url()), status: response.status() });
  };
  page.on('console', onConsole);
  page.on('pageerror', onError);
  page.on('requestfailed', onFailure);
  page.on('response', onResponse);
  return {
    drain: (secrets = []) => events.splice(0).map(entry => entry.text === undefined ? entry : { ...entry, text: redactPortalConsole(entry.text, secrets) }),
    close() {
      page.off('console', onConsole);
      page.off('pageerror', onError);
      page.off('requestfailed', onFailure);
      page.off('response', onResponse);
    },
  };
}
