import { appendFile } from 'node:fs/promises';
const events = new Set(['ready', 'model_ready', 'model_error', 'model_wait', 'challenge', 'portal_submit', 'inference', 'login', 'reports', 'error']);
const numbers = ['durationMs', 'inferenceMs', 'initializationMs', 'modelDownloadMs', 'runtimeSetupMs', 'warmMs', 'downloadBytes', 'width', 'height'];
export function installTestMetrics(app) {
  app.post('/api/test-metrics', (req, res) => {
    if (!process.env.PORTAL_TEST_METRICS_FILE) return res.sendStatus(204);
    const b = req.body || {};
    if (typeof b.testId !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(b.testId) || !events.has(b.event)) return res.sendStatus(400);
    const row = { at: new Date().toISOString(), testId: b.testId, event: b.event };
    for (const key of numbers) if (Number.isFinite(b[key]) && b[key] >= 0 && b[key] < 1e9) row[key] = Math.round(b[key]);
    if (typeof b.ok === 'boolean') row.ok = b.ok;
    if (['LOGIN_FAILED', 'LOGIN_REJECTED', 'PORTAL_FORM_REJECTED', 'SESSION_LIMIT', 'CAPTCHA_INVALID', 'SESSION_EXPIRED', 'CAPACITY', 'BUSY', 'PORTAL_UNAVAILABLE', 'CLIENT_ERROR'].includes(b.errorCode)) row.errorCode = b.errorCode;
    // Browser family only; no device identifiers or free-text error payloads.
    const ua = req.get('user-agent') || '';
    row.browser = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chromium' : /Safari/.test(ua) ? 'Safari' : 'other';
    void appendFile(process.env.PORTAL_TEST_METRICS_FILE, JSON.stringify(row) + '\n', { mode: 0o600 }).catch(() => {});
    res.sendStatus(204);
  });
}
