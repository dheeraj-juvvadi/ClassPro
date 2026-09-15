import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.env.PORTAL_GO_BINARY = resolve(root, 'portal-go-binary');
process.env.PORTAL_BROWSER_PATH = resolve(root, 'chromium.sh');
process.env.SSL_CERT_FILE = resolve(root, 'system/etc/ssl/cert.pem');
process.env.APP_ORIGIN = process.env.APP_ORIGIN || 'https://revamp-tracker.vercel.app';
process.env.PORTAL_SUBMISSION_TRANSPORT = 'browser';
process.env.PORTAL_FINGERPRINT_HANDSHAKE = '1';
process.env.MAX_SESSIONS = '2';
process.env.MAX_CONCURRENT = '1';
delete process.env.STATIC_DIR;
let backend;
let starting;
const diagnostics = [];
async function ensureBackend() {
  if (starting) return starting;
  starting = (async () => {
    backend = spawn(process.execPath, ['portal-go/start.mjs'], {
      cwd: root, env: { ...process.env, PORT: '8080', NODE_OPTIONS: '' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [backend.stdout, backend.stderr]) createInterface({ input: stream }).on('line', line => {
      try {
        const entry = JSON.parse(line);
        if (['portal_browser_launch_failed', 'portal_browser_started', 'worker_error', 'api_started'].includes(entry.event || entry.msg)) {
          diagnostics.push(entry);
          if (diagnostics.length > 10) diagnostics.shift();
        }
      } catch {}
    });
    backend.once('error', () => { starting = null; });
    backend.once('exit', () => { starting = null; });
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const result = await fetch('http://127.0.0.1:8080/health', { signal: AbortSignal.timeout(250) });
        await result.body?.cancel();
        if (result.ok) return;
      } catch {}
      if (backend.exitCode !== null) throw new Error('Backend exited during startup');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Backend startup deadline exceeded');
  })().catch(error => { starting = null; backend?.kill('SIGTERM'); throw error; });
  return starting;
}
export async function handler(request, response) {
  response.on('finish', () => { for (const entry of diagnostics.splice(0)) console.log(JSON.stringify(entry)); });
  try { await ensureBackend(); } catch {
    response.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: { code: 'BACKEND_UNAVAILABLE', message: 'Backend startup failed.' } }));
    return;
  }
  const headers = { ...request.headers };
  for (const name of Object.keys(headers)) {
    if (name.startsWith('x-appwrite-') || name.startsWith('x-open-runtimes-')) delete headers[name];
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: 8080, path: request.url, method: request.method, headers }, result => {
    response.writeHead(result.statusCode, result.headers);
    result.pipe(response);
  });
  upstream.setTimeout(55000, () => upstream.destroy());
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: { code: 'BACKEND_UNAVAILABLE', message: 'Backend is starting. Please retry.' } }));
  });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
}
process.once('SIGTERM', () => backend?.kill('SIGTERM'));
process.once('SIGINT', () => backend?.kill('SIGTERM'));
