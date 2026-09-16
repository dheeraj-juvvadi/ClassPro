'use strict';

// Server-side proxy: the browser only ever talks to this origin. The secret that unlocks
// the backend lives in Vercel environment variables and never reaches the browser bundle.
// vercel.json rewrites /api/:path* here as ?__path=:path*.

const REQUEST_SKIP = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length']);
const RESPONSE_SKIP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  'content-encoding', 'content-length', 'set-cookie']);

function readRaw(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function requestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const raw = await readRaw(request);
  if (raw.length) return raw;
  if (request.body && typeof request.body === 'object') return JSON.stringify(request.body);
  if (typeof request.body === 'string') return request.body;
  return raw;
}

function subpath(request) {
  const supplied = request.query && request.query.__path;
  if (Array.isArray(supplied)) return supplied.join('/');
  if (typeof supplied === 'string' && supplied) return supplied;
  return new URL(request.url, 'http://internal').pathname.replace(/^\/api\/proxy\/?/, '');
}

async function handler(request, response) {
  const backend = process.env.BACKEND_URL;
  const token = process.env.BACKEND_TOKEN;
  if (!backend || !token) {
    response.status(503).json({ error: { code: 'NOT_CONFIGURED', message: 'The service is not configured.' } });
    return;
  }
  const headers = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (REQUEST_SKIP.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  headers['x-classpro-key'] = token;
  const incoming = new URL(request.url, 'http://internal');
  incoming.searchParams.delete('__path');
  incoming.search = incoming.searchParams.toString();
  const target = new URL(`/api/${subpath(request).replace(/^\/+/, '')}${incoming.search}`, backend);
  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method, headers, body: await requestBody(request), redirect: 'manual',
    });
  } catch {
    response.status(502).json({ error: { code: 'BACKEND_UNREACHABLE', message: 'The service is unavailable.' } });
    return;
  }
  const cookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
  if (cookies.length) response.setHeader('set-cookie', cookies);
  response.status(upstream.status);
  for (const [key, value] of upstream.headers) {
    if (RESPONSE_SKIP.has(key.toLowerCase())) continue;
    response.setHeader(key, value);
  }
  response.send(Buffer.from(await upstream.arrayBuffer()));
}

module.exports = handler;
module.exports.config = { maxDuration: 60, api: { bodyParser: false } };
