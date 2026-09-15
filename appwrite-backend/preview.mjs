import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

const upstream = new URL(process.env.APPWRITE_BACKEND_ORIGIN || 'https://6aa88e2365f2b5078af8.appwrite.network');
if (upstream.protocol !== 'https:' || !upstream.hostname.endsWith('.appwrite.network') || upstream.pathname !== '/') throw new Error('Expected an Appwrite deployment origin');
const port = 8087;
const localOrigin = `http://localhost:${port}`;
const frontend = resolve('portal-app/public');
const paths = new Set(['/api/session', '/api/challenge', '/api/challenge/prepare', '/api/login/client', '/api/reports']);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (request.headers.host !== `localhost:${port}`) { response.writeHead(403).end(); return; }
    const path = new URL(request.url, localOrigin).pathname;
    if (path.startsWith('/api/')) {
      if (!paths.has(path) || !['GET', 'POST', 'DELETE'].includes(request.method)) { response.writeHead(404).end(); return; }
      if (request.method !== 'GET' && request.headers.origin !== localOrigin) { response.writeHead(403).end(); return; }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 8192) { response.writeHead(413).end(); return; } chunks.push(chunk); }
      const headers = { 'Content-Type': 'application/json', Origin: 'https://revamp-tracker.vercel.app', 'Sec-Fetch-Site': 'same-origin', 'X-Client-Trace': randomUUID(), 'X-Login-Mode': 'manual' };
      const cookie = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => /^classpro_go_session=[a-f0-9]{64}$/.test(value));
      if (cookie) headers.Cookie = cookie;
      const result = await fetch(new URL(path, upstream), { method: request.method, headers, body: request.method === 'POST' ? Buffer.concat(chunks) : undefined, redirect: 'manual', signal: AbortSignal.timeout(60000) });
      const cookies = result.headers.getSetCookie().filter(value => value.startsWith('classpro_go_session=')).map(value => value.replace(/;\s*Secure\b/gi, ''));
      if (cookies.length) response.setHeader('Set-Cookie', cookies);
      response.setHeader('Content-Type', result.headers.get('content-type') || 'application/json');
      response.writeHead(result.status).end(Buffer.from(await result.arrayBuffer()));
      console.log(JSON.stringify({ path, status: result.status, request_id: result.headers.get('x-request-id') }));
      return;
    }
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    const decoded = decodeURIComponent(path === '/' ? '/index.html' : path);
    if (decoded.split('/').some(part => part.startsWith('.')) || decoded.includes('\\')) { response.writeHead(404).end(); return; }
    const file = resolve(frontend, '.' + decoded);
    if (!file.startsWith(frontend + '/')) { response.writeHead(404).end(); return; }
    const content = await readFile(file);
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    response.writeHead(200).end(content);
  } catch {
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'Appwrite test connection failed.' } }));
  }
}).listen(port, '127.0.0.1', () => console.log(`Local frontend → Appwrite: ${localOrigin}`));
