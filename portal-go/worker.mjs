import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const errorBody = (code, message) => ({ error: { code, message } });
const unavailable = errorBody('PORTAL_UNAVAILABLE', 'Unable to reach Student Portal. Please try signing in again.');
const knownErrors = new Set(['SESSION_EXPIRED', 'PORTAL_CHANGED', 'PORTAL_UNAVAILABLE']);

export function createWorker({ token, createSession, maxSessions = 4, maxConcurrent = 2, timeoutMs = 85000, closeTimeoutMs = 3000, onCloseTimeout = () => {}, logger = () => {} }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('WORKER_TOKEN needs at least 32 characters');
  const sessions = new Map();
  let active = 0;
  async function drop(id) {
    const entry = sessions.get(id);
    if (!entry) return;
    if (entry.closing) return entry.closing;
    entry.busy = true;
    entry.closing = (async () => {
      let timer;
      try {
        await Promise.race([
          Promise.resolve().then(() => entry.portal.close()),
          new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('close deadline')), closeTimeoutMs); }),
        ]);
        if (sessions.get(id) === entry) sessions.delete(id);
      } catch {
        onCloseTimeout();
      } finally { clearTimeout(timer); }
    })();
    return entry.closing;
  }
  const send = (response, status, body) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(body));
  };
  const server = http.createServer(async (request, response) => {
    const started = Date.now();
    const suppliedID = request.headers['x-request-id'];
    const requestID = typeof suppliedID === 'string' && /^[a-f0-9]{64}$/.test(suppliedID) ? suppliedID : randomUUID();
    let loggedAction = 'unknown';
    const log = event => logger({ ...event, request_id: requestID });
    response.once('finish', () => log({ event: 'worker_request', action: loggedAction, status: response.statusCode, duration_ms: Date.now() - started }));
    const expected = Buffer.from(`Bearer ${token}`);
    const actual = Buffer.from(request.headers.authorization || '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      send(response, 401, errorBody('UNAUTHORIZED', 'Unauthorized.')); return;
    }
    if (request.method !== 'POST' || request.url !== '/rpc') {
      send(response, 404, errorBody('NOT_FOUND', 'Unknown action.')); return;
    }
    if (request.headers['content-type'] !== 'application/json') {
      send(response, 415, errorBody('INVALID_REQUEST', 'Send JSON.')); return;
    }
    if (active >= maxConcurrent) {
      send(response, 503, errorBody('CAPACITY', 'Student Portal is busy.')); return;
    }
    active++;
    let entry;
    let session;
    let acquired = false;
    let deadline;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 12288) { send(response, 413, errorBody('INVALID_REQUEST', 'Request too large.')); return; }
        chunks.push(chunk);
      }
      let message;
      try { message = JSON.parse(Buffer.concat(chunks).toString()); }
      catch { send(response, 400, errorBody('INVALID_REQUEST', 'Invalid JSON.')); return; }
      if (!message || typeof message !== 'object') {
        send(response, 400, errorBody('INVALID_REQUEST', 'Invalid request.')); return;
      }
      const { action, payload = {} } = message;
      session = message.session;
      if (typeof session !== 'string' || !/^[a-f0-9]{64}$/.test(session)
        || !['challenge', 'prepare', 'login', 'reports', 'close'].includes(action)
        || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        send(response, 400, errorBody('INVALID_REQUEST', 'Invalid request.')); return;
      }
      entry = sessions.get(session);
      loggedAction = action;
      if (entry?.busy) { send(response, 409, errorBody('BUSY', 'A request is already in progress.')); return; }
      if (entry && entry.expires <= Date.now()) { await drop(session); entry = undefined; }
      if (action === 'close') { await drop(session); send(response, 200, { success: true }); return; }
      if (!entry && action !== 'challenge') { send(response, 401, errorBody('SESSION_EXPIRED', 'Sign in again.')); return; }
      let fresh = false;
      if (!entry) {
        if (sessions.size >= maxSessions) {
          await Promise.all([...sessions].filter(([, current]) => !current.busy && current.expires <= Date.now()).map(([id]) => drop(id)));
        }
        if (sessions.size >= maxSessions) { send(response, 503, errorBody('CAPACITY', 'Login capacity is full.')); return; }
        entry = { portal: createSession(), busy: false, expires: Date.now() + 120000 };
        sessions.set(session, entry);
        fresh = true;
      }
      entry.busy = true;
      acquired = true;
      const operation = run(action, payload, entry, fresh, log);
      const expired = new Promise((resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('deadline')), timeoutMs);
      });
      const result = await Promise.race([operation, expired]);
      if (result.status !== 200 && action === 'login') await drop(session);
      send(response, result.status, result.body);
    } catch (error) {
      log({ event: 'worker_error', action: loggedAction, error_code: knownErrors.has(error.code) ? error.code : 'PORTAL_UNAVAILABLE' });
      if (acquired) await drop(session);
      const known = knownErrors.has(error.code);
      send(response, known && error.code === 'SESSION_EXPIRED' ? 401 : 502,
        known ? errorBody(error.code, error.code === 'SESSION_EXPIRED' ? 'Your Student Portal session expired. Sign in again.' : 'Student Portal could not complete the request.') : unavailable);
    } finally {
      clearTimeout(deadline);
      if (entry && acquired && !entry.closing) entry.busy = false;
      active--;
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 32;
  const timer = setInterval(() => {
    for (const [id, entry] of sessions) if (!entry.busy && entry.expires <= Date.now()) void drop(id);
  }, 30000);
  timer.unref();
  return { server, close: async () => { clearInterval(timer); await Promise.all([...sessions.keys()].map(drop)); } };
}

async function run(action, payload, entry, fresh, log) {
  const portal = entry.portal;
  if (action === 'challenge') {
    if (portal.authenticated) return { status: 200, body: { authenticated: true } };
    const image = fresh ? await portal.open() : await portal.refreshChallenge();
    entry.expires = Date.now() + 120000;
    return { status: 200, body: { image } };
  }
  if (action === 'reports') {
    const data = await portal.reports();
    entry.expires = Date.now() + 1800000;
    return { status: 200, body: data };
  }
  if (typeof payload.answer !== 'string' || !/^[A-Za-z0-9]{4,8}$/.test(payload.answer)) {
    return { status: 400, body: errorBody('INVALID_REQUEST', 'Invalid verification answer.') };
  }
  if (action === 'prepare') {
    if (portal.authenticated) return { status: 200, body: { prepared: false } };
    await portal.prepareCaptcha(payload.answer);
    return { status: 200, body: { prepared: true } };
  }
  if (![payload.account, payload.password].every(value => typeof value === 'string' && value.trim() && value.length <= 256)) {
    return { status: 400, body: errorBody('INVALID_REQUEST', 'Enter your NetID and password.') };
  }
  const result = await portal.login(payload.account, payload.password, payload.answer, log);
  if (!result.authenticated) return { status: 401, body: { authenticated: false, error: result.error || errorBody('LOGIN_FAILED', 'Student Portal did not complete sign-in.').error } };
  entry.expires = Date.now() + 1800000;
  return { status: 200, body: { authenticated: true } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { PortalSession, closeBrowser } = await import('../portal-app/src/portal.js');
  const worker = createWorker({ token: process.env.WORKER_TOKEN, createSession: () => new PortalSession(),
    maxSessions: Number(process.env.MAX_SESSIONS || 4), maxConcurrent: Number(process.env.MAX_CONCURRENT || 2), onCloseTimeout: () => process.exit(1),
    logger: event => console.log(JSON.stringify({ time: new Date().toISOString(), ...event })) });
  worker.server.listen(Number(process.env.WORKER_PORT || 3101), '127.0.0.1');
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    worker.server.close();
    await worker.close();
    await closeBrowser();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
