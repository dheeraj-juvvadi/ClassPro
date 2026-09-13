import express from 'express';
import { autoLogin } from './auto-login.js';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { installTestMetrics } from './test-metrics.js';

const COOKIE = 'portal_session';
const SESSION_TTL = 30 * 60 * 1000;

export function createApp({ createSession, maxSessions = 8, secureCookie = false, now = Date.now, authenticate = autoLogin }) {
  const app = express();
  const sessions = new Map();
  const rates = new Map();
  const cookie = (res, id, ttl = SESSION_TTL) => res.cookie(COOKIE, id, {
    httpOnly: true, secure: secureCookie, sameSite: 'strict', path: '/', maxAge: ttl,
  });
  const error = (res, status, code, message) => res.status(status).json({ error: { code, message } });
  async function drop(id) {
    const entry = sessions.get(id);
    sessions.delete(id);
    if (entry) await entry.portal.close().catch(() => {});
  }
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const svgArtwork = req.path.endsWith('.svg');
    res.set({
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': svgArtwork
        ? "default-src 'self'; style-src 'self' 'unsafe-inline'"
        : "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    if (req.path.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
      const origin = req.get('origin');
      let valid = false;
      try { valid = new URL(origin).host === req.get('host'); } catch { /* Reject missing/invalid origin. */ }
      if (!valid || req.get('sec-fetch-site') === 'cross-site') return error(res, 403, 'INVALID_ORIGIN', 'Reload the app and try again.');
      if (req.method === 'POST' && !req.is('application/json')) return error(res, 415, 'INVALID_REQUEST', 'Send JSON.');
    }
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', (req, res, next) => {
    const part = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`));
    const id = part?.slice(COOKIE.length + 1);
    const entry = sessions.get(id);
    req.portalId = id;
    if (entry && entry.expires > now()) req.portalEntry = entry;
    else if (entry && !entry.busy) void drop(id);
    next();
  });
  app.get('/api/session', (req, res) => {
    res.json({ authenticated: !!req.portalEntry?.portal.authenticated });
  });
  const rateLimit = (req, res, next) => {
    const key = req.ip;
    const current = rates.get(key);
    const rate = current && current.until > now() ? current : { count: 0, until: now() + 60000 };
    rate.count++;
    rates.set(key, rate);
    if (rate.count > 10) return error(res, 429, 'RATE_LIMIT', 'Too many login attempts. Wait a minute and try again.');
    next();
  };
  const requireSession = (req, res, next) => {
    if (!req.portalEntry) return error(res, 401, 'SESSION_EXPIRED', 'Sign in with your NetID and password.');
    if (req.portalEntry.busy) return error(res, 409, 'BUSY', 'A request is already in progress.');
    next();
  };
  app.post('/api/login', rateLimit, async (req, res) => {
    const { account, password } = req.body || {};
    if (![account, password].every(v => typeof v === 'string' && v.trim().length > 0 && v.length <= 256)) {
      return error(res, 400, 'INVALID_REQUEST', 'Enter your NetID and password.');
    }
    if (req.portalEntry?.busy) return error(res, 409, 'BUSY', 'Sign-in is already in progress.');
    if (req.portalEntry?.portal.authenticated) return res.json({ authenticated: true });
    await drop(req.portalId);
    if (sessions.size >= maxSessions) return error(res, 503, 'CAPACITY', 'All login slots are busy. Try again shortly.');
    const id = randomBytes(32).toString('hex');
    const entry = { portal: createSession(), busy: true, expires: now() + SESSION_TTL };
    sessions.set(id, entry);
    try {
      const result = await authenticate(entry.portal, account, password);
      if (result.authenticated) {
        cookie(res, id);
        res.json(result);
      } else {
        await drop(id);
        res.status(result.error?.code === 'SESSION_LIMIT' ? 409 : 401).json(result);
      }
    } catch (cause) {
      await drop(id);
      throw cause;
    } finally {
      req.body = undefined;
      entry.busy = false;
    }
  });
  app.post('/api/challenge', rateLimit, async (req, res) => {
    if (req.portalEntry?.busy) return error(res, 409, 'BUSY', 'Sign-in is already in progress.');
    if (req.portalEntry?.portal.authenticated) return res.json({ authenticated: true });
    if (req.portalEntry) {
      const entry = req.portalEntry;
      entry.busy = true;
      try {
        const image = await entry.portal.refreshChallenge();
        entry.expires = now() + 120000;
        cookie(res, req.portalId, 120000);
        return res.json({ image });
      } catch (cause) { await drop(req.portalId); throw cause; }
      finally { entry.busy = false; }
    }
    await drop(req.portalId);
    if (sessions.size >= maxSessions) return error(res, 503, 'CAPACITY', 'Login capacity is full. Try again shortly.');
    const id = randomBytes(32).toString('hex');
    const entry = { portal: createSession(), busy: true, expires: now() + 120000 };
    sessions.set(id, entry);
    try {
      const image = await entry.portal.open();
      cookie(res, id, 120000);
      res.json({ image });
    } catch (cause) { await drop(id); throw cause; }
    finally { entry.busy = false; }
  });
  app.post('/api/challenge/prepare', rateLimit, requireSession, async (req, res) => {
    const answer = req.body?.answer;
    if (typeof answer !== 'string' || !/^[A-Za-z0-9]{4,8}$/.test(answer)) return error(res, 400, 'INVALID_REQUEST', 'Invalid verification answer.');
    if (req.portalEntry.portal.authenticated) return res.json({ prepared: false });
    const entry = req.portalEntry;
    entry.busy = true;
    try {
      await entry.portal.prepareCaptcha(answer);
      res.json({ prepared: true });
    } finally { req.body = undefined; entry.busy = false; }
  });
  app.post('/api/login/client', rateLimit, requireSession, async (req, res) => {
    const { account, password, answer } = req.body || {};
    if (![account, password].every(v => typeof v === 'string' && v.trim() && v.length <= 256)
      || typeof answer !== 'string' || !/^[A-Za-z0-9]{4,8}$/.test(answer)) {
      return error(res, 400, 'INVALID_REQUEST', 'Verification could not be completed. Please retry.');
    }
    const entry = req.portalEntry;
    entry.busy = true;
    try {
      const result = await entry.portal.login(account, password, answer);
      if (!result.authenticated) {
        await drop(req.portalId);
        return res.status(401).json({ authenticated: false, error: result.error });
      }
      entry.expires = now() + SESSION_TTL;
      cookie(res, req.portalId);
      res.json({ authenticated: true });
    } catch (cause) { await drop(req.portalId); throw cause; }
    finally { req.body = undefined; entry.busy = false; }
  });
  app.get('/api/reports', requireSession, async (req, res) => {
    const entry = req.portalEntry;
    entry.busy = true;
    try {
      const data = await entry.portal.reports();
      entry.expires = now() + SESSION_TTL;
      cookie(res, req.portalId);
      res.json(data);
    } finally { entry.busy = false; }
  });
  app.delete('/api/session', async (req, res) => {
    if (req.portalEntry?.busy) return error(res, 409, 'BUSY', 'Wait for the current request before signing out.');
    await drop(req.portalId);
    res.clearCookie(COOKIE, { httpOnly: true, secure: secureCookie, sameSite: 'strict', path: '/' });
    res.json({ success: true });
  });
  app.get('/health', (req, res) => res.json({ ok: true }));
  installTestMetrics(app);
  app.use('/api', (req, res) => error(res, 404, 'NOT_FOUND', 'Unknown action.'));
  app.get('/ocr/:asset', (req, res, next) => {
    if (!['portal-alnum.onnx', 'charset.json', 'ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'].includes(req.params.asset)) return next();
    const file = fileURLToPath(new URL(`../public/ocr/${req.params.asset}`, import.meta.url));
    const accepted = req.get('accept-encoding') || '';
    const encoding = /\bbr\b/.test(accepted) && existsSync(file + '.br') ? 'br'
      : /\bgzip\b/.test(accepted) && existsSync(file + '.gz') ? 'gzip' : null;
    res.set('Cache-Control', 'public, max-age=86400');
    res.vary('Accept-Encoding');
    res.type(req.params.asset.endsWith('.wasm') ? 'application/wasm' : req.params.asset.endsWith('.js') || req.params.asset.endsWith('.mjs') ? 'application/javascript' : req.params.asset.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    if (encoding) res.set('Content-Encoding', encoding);
    res.sendFile(encoding ? file + (encoding === 'br' ? '.br' : '.gz') : file);
  });
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), { etag: false }));
  app.use((cause, req, res, next) => {
    if (res.headersSent) return next(cause);
    const known = typeof cause.code === 'string' && Number.isInteger(cause.status);
    const status = known ? cause.status : cause.type === 'entity.parse.failed' ? 400 : 502;
    error(res, status, known ? cause.code : 'PORTAL_UNAVAILABLE', known ? cause.message : 'Unable to reach Student Portal. Please try signing in again.');
  });
  const timer = setInterval(() => {
    for (const [id, entry] of sessions) if (entry.expires <= now() && !entry.busy) void drop(id);
    for (const [key, rate] of rates) if (rate.until <= now()) rates.delete(key);
  }, 30000);
  timer.unref();
  return { app, close: async () => { clearInterval(timer); await Promise.all([...sessions.keys()].map(drop)); } };
}
