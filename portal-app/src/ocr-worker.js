import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { PortalError } from './parsers.js';

const script = fileURLToPath(new URL('../scripts/captcha-worker.py', import.meta.url));
const localPython = fileURLToPath(new URL('../.venv-ocr/bin/python', import.meta.url));
let child;
let sequence = 0;
let idleTimer;
const pending = new Map();
const failure = () => new PortalError('OCR_UNAVAILABLE', 'Local verification is unavailable. Please retry shortly.', 503);

function stopWorker() {
  clearTimeout(idleTimer);
  const previous = child;
  child = undefined;
  previous?.kill();
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(failure());
  }
  pending.clear();
}

function startWorker() {
  if (child) return child;
  const python = process.env.PORTAL_OCR_PYTHON || (existsSync(localPython) ? localPython : 'python3');
  const worker = spawn(python, ['-u', script], {
    stdio: ['pipe', 'pipe', 'ignore'],
    env: { ...process.env, OMP_NUM_THREADS: '1' },
  });
  child = worker;
  const lines = createInterface({ input: worker.stdout });
  const onFailure = () => { if (child === worker) stopWorker(); };
  worker.once('error', onFailure);
  worker.once('exit', onFailure);
  worker.stdin.on('error', onFailure);
  lines.on('line', line => {
    if (child !== worker) return;
    let data;
    try { data = JSON.parse(line); } catch { onFailure(); return; }
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.error) entry.reject(new PortalError('CAPTCHA_UNREADABLE', 'Could not read the portal challenge.', 422));
    else if (Array.isArray(data.candidates)) entry.resolve(data.candidates);
    else entry.reject(failure());
    if (!pending.size) idleTimer = setTimeout(stopWorker, 60000);
  });
  return worker;
}

export function recognizeWithModel(image) {
  if (typeof image !== 'string' || image.length > 1024 * 1024
    || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)) {
    return Promise.reject(new PortalError('CAPTCHA_UNREADABLE', 'Invalid portal challenge.', 422));
  }
  if (pending.size >= 8) return Promise.reject(new PortalError('CAPACITY', 'Verification is busy. Please retry shortly.', 503));
  clearTimeout(idleTimer);
  const worker = startWorker();
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(stopWorker, 30000);
    pending.set(id, { resolve, reject, timer });
    worker.stdin.write(JSON.stringify({ id, image: image.split(',')[1] }) + '\n');
  });
}

export function closeOcrWorker() { stopWorker(); }
