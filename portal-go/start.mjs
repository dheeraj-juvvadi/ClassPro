import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const environment = { ...process.env, WORKER_TOKEN: process.env.WORKER_TOKEN || randomBytes(32).toString('hex') };
const children = [
  spawn(process.execPath, ['portal-go/worker.mjs'], { env: environment, stdio: ['ignore', 'ignore', 'ignore'] }),
  spawn(process.env.PORTAL_GO_BINARY || '/usr/local/bin/portal-go', [], { env: environment, stdio: ['ignore', 'inherit', 'inherit'] }),
];
let stopping = false;
let remaining = children.length;
let exitCode = 0;
function stop(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(exitCode);
  }, 10000).unref();
}
for (const child of children) {
  child.once('error', () => stop(1));
  child.once('exit', code => {
    remaining--;
    if (!stopping) stop(code || 1);
    if (remaining === 0) process.exit(exitCode);
  });
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
