'use strict';

const ROUTES = new Map([
  ['session', ['GET', 'DELETE']], ['challenge', ['POST']],
  ['login/client', ['POST']], ['reports', ['GET']], ['exams', ['GET']],
  ['presence', ['POST']], ['client-events', ['POST']],
]);
const REQUEST_HEADERS = new Set(['cookie', 'origin', 'content-type', 'sec-fetch-site', 'user-agent', 'accept']);
const RESPONSE_HEADERS = new Set(['content-type', 'retry-after', 'x-request-id']);
const MAX_BODY = 8192;

function reject(response, status, code, message) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.status(status).json({ error: { code, message } });
}

async function requestBody(request) {
  if (request.method === 'GET') return undefined;
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY) throw new RangeError('body');
    chunks.push(Buffer.from(chunk));
  }
  const raw = chunks.length ? Buffer.concat(chunks) : request.body == null ? Buffer.alloc(0)
    : Buffer.from(typeof request.body === 'string' ? request.body : JSON.stringify(request.body));
  if (raw.length > MAX_BODY) throw new RangeError('body');
  return raw.length ? raw : undefined;
}

function subpath(request) {
  const supplied = request.query?.__path;
  if (Array.isArray(supplied)) return supplied.length === 1 ? supplied[0] : '';
  if (typeof supplied === 'string') return supplied;
  return new URL(request.url, 'http://internal').pathname.replace(/^\/api\/proxy\/?/, '');
}

async function handler(request, response) {
  const path = subpath(request);
  if (!ROUTES.has(path)) return reject(response, 404, 'NOT_FOUND', 'Not found.');
  if (!ROUTES.get(path).includes(request.method)) return reject(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  const backend = process.env.BACKEND_URL;
  const token = process.env.BACKEND_TOKEN;
  if (!backend || !token) return reject(response, 503, 'NOT_CONFIGURED', 'The service is unavailable.');
  let backendURL;
  try { backendURL = new URL(backend); } catch { return reject(response, 503, 'NOT_CONFIGURED', 'The service is unavailable.'); }
  if (backendURL.protocol !== 'https:' && process.env.NODE_ENV !== 'test') return reject(response, 503, 'NOT_CONFIGURED', 'The service is unavailable.');
  const declared = Number(request.headers['content-length'] || 0);
  if (!Number.isFinite(declared) || declared > MAX_BODY) return reject(response, 413, 'INVALID_REQUEST', 'Request too large.');
  const headers = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (REQUEST_HEADERS.has(key.toLowerCase()) && typeof value === 'string') headers[key.toLowerCase()] = value;
  }
  headers['x-anon-key'] = token;
  headers['x-anon-client-ip'] = String(request.headers['x-vercel-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const incoming = new URL(request.url, 'http://internal');
  const target = new URL(`/api/${path}`, backendURL);
  if (path === 'reports') for (const key of ['force', 'cache', 'wait']) {
    const value = incoming.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  if (path === 'exams' && incoming.searchParams.get('force') === '1') target.searchParams.set('force', '1');
  let upstream;
  try {
    upstream = await fetch(target, { method: request.method, headers,
      body: await requestBody(request), redirect: 'manual', signal: AbortSignal.timeout(55000) });
  } catch (error) {
    return reject(response, error instanceof RangeError ? 413 : 502,
      error instanceof RangeError ? 'INVALID_REQUEST' : 'BACKEND_UNREACHABLE',
      error instanceof RangeError ? 'Request too large.' : 'The service is unavailable.');
  }
  if (upstream.status >= 300 && upstream.status < 400) return reject(response, 502, 'BACKEND_UNREACHABLE', 'The service is unavailable.');
  if (!(upstream.headers.get('content-type') || '').includes('application/json')) return reject(response, 502, 'BACKEND_UNREACHABLE', 'The service is unavailable.');
  const cookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
  if (cookies.length) response.setHeader('set-cookie', cookies);
  response.status(upstream.status);
  for (const [key, value] of upstream.headers) if (RESPONSE_HEADERS.has(key)) response.setHeader(key, value);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.send(Buffer.from(await upstream.arrayBuffer()));
}

module.exports = handler;
module.exports.config = { maxDuration: 60, api: { bodyParser: false } };
