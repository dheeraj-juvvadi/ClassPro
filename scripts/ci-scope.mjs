// Detect deployment inputs; unknown/missing commit history always runs checks.
import { readFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function scopeFor(paths) {
  const scope = { frontend: false, backend: false };
  for (const path of paths) {
    if (/^docs\//.test(path) || /\.md$/i.test(path)) continue;
    if (path === '.github/workflows/production.yml' || /^scripts\//.test(path)) {
      scope.frontend = scope.backend = true;
    } else if (/^portal-app\//.test(path)) scope.frontend = true;
    else if (/^portal-backend\//.test(path) || path === 'portal-python/ocr.py' || /^portal-python\/model\//.test(path)) scope.backend = true;
    else if (path === '.dockerignore' || path === '.gitignore') scope.frontend = scope.backend = true;
  }
  return scope;
}

export function changedPaths(base, head, cwd) {
  if (![base, head].every(sha => /^[a-f0-9]{40}$/.test(sha || '') && !/^0+$/.test(sha))) return null;
  const diff = spawnSync('git', ['diff', '--name-only', '--no-renames', '-z', base, head, '--'], { cwd, encoding: 'utf8' });
  return diff.status === 0 ? diff.stdout.split('\0').filter(Boolean) : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let scope = { frontend: true, backend: true };
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    try {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
      const paths = changedPaths(event.pull_request?.base.sha || event.before,
        event.pull_request?.head.sha || event.after || process.env.GITHUB_SHA);
      if (paths) scope = scopeFor(paths);
    } catch { /* Missing event/history runs all checks. */ }
  }
  const output = Object.entries(scope).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(output.trim());
}
