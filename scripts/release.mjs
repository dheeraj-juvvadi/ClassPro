#!/usr/bin/env node
// Validate exactly the staged snapshot, then commit and push to the deploy repo.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} failed; nothing pushed.`);
  return result;
}
function output(command, args) {
  return run(command, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).stdout.trim();
}
const message = process.argv.slice(2).join(' ');
if (!message) throw new Error('Usage: node scripts/release.mjs "Commit message" (stage intended files first)');
if (output('git', ['branch', '--show-current']) !== 'main') throw new Error('Release from main only.');
const remote = output('git', ['remote', 'get-url', 'revamp']);
if (!/github\.com[/:]dheeraj-juvvadi\/revamp-tracker(?:\.git)?$/.test(remote)) throw new Error('Unexpected deployment remote.');
run('git', ['diff', '--cached', '--check']);
if (!output('git', ['diff', '--cached', '--name-only'])) throw new Error('Stage the completed agenda first.');
run('git', ['fetch', 'revamp', 'main']);
run('git', ['merge-base', '--is-ancestor', 'revamp/main', 'HEAD']);
const tree = output('git', ['write-tree']);
const directory = mkdtempSync(join(tmpdir(), 'anon-release-'));
try {
  const archive = join(directory, 'source.tar');
  run('git', ['archive', '--format=tar', '-o', archive, tree]);
  run('tar', ['-xf', archive, '-C', directory]);
  run('node', ['--test', 'scripts/ci-scope.test.mjs'], { cwd: directory });
  const frontend = join(directory, 'portal-app');
  run('npm', ['ci', '--ignore-scripts'], { cwd: frontend });
  run('npm', ['run', 'build'], { cwd: frontend });
  run('npm', ['run', 'test:release'], { cwd: frontend });
  const python = process.env.RELEASE_PYTHON || 'python3.11';
  run(python, ['-m', 'unittest', 'discover'], { cwd: join(directory, 'ratio-diagnostic') });
  if (output('git', ['write-tree']) !== tree) throw new Error('Staged files changed during validation; retry.');
  run('git', ['commit', '-m', message]);
  run('git', ['push', 'revamp', 'HEAD:main']);
  console.log('Validated and pushed. Vercel and Azure production workflows now run on GitHub.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
