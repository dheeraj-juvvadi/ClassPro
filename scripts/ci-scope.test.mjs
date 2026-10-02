import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { changedPaths, scopeFor } from './ci-scope.mjs';
import { shouldBuild } from './vercel-ignore.mjs';

test('documentation and inactive adapters do not deploy production services', () => {
  assert.deepEqual(scopeFor(['docs/releasing.md', 'work-performed.md', 'portal-app/README.md']), { frontend: false, backend: false });
  assert.deepEqual(scopeFor(['portal-go/routes.go', 'appwrite-backend/build.mjs']), { frontend: false, backend: false });
});
test('Vercel skips only when the last successful deployment proves app inputs unchanged', () => {
  assert.equal(shouldBuild(null), true);
  assert.equal(shouldBuild([]), false);
  assert.equal(shouldBuild(['docs/releasing.md', 'ratio-diagnostic/server.py']), false);
  assert.equal(shouldBuild(['portal-app/public/index.html']), true);
  assert.equal(shouldBuild(['portal-app/package-lock.json']), true);
  assert.equal(shouldBuild(['portal-app/README.md']), false);
  assert.equal(shouldBuild(['portal-app/README.md', 'portal-app/public/app.js']), true);
  assert.equal(shouldBuild(['scripts/vercel-ignore.mjs']), true);
  assert.equal(shouldBuild(['.gitignore']), true);
});
test('runtime, dependency, test and shared deployment inputs select the right checks', () => {
  for (const path of ['portal-app/public/app.js', 'portal-app/package-lock.json', 'portal-app/test/cache-boot.test.js']) {
    assert.deepEqual(scopeFor([path]), { frontend: true, backend: false }, path);
  }
  for (const path of ['ratio-diagnostic/server.py', 'ratio-diagnostic/requirements.txt', 'portal-python/ocr.py', 'portal-python/model/model.onnx']) {
    assert.deepEqual(scopeFor([path]), { frontend: false, backend: true }, path);
  }
  for (const path of ['scripts/ci-scope.mjs', '.github/workflows/production.yml', '.dockerignore', '.gitignore']) {
    assert.deepEqual(scopeFor([path]), { frontend: true, backend: true }, path);
  }
});
test('missing history falls back, while deletion and rename retain the old input path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anon-ci-scope-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    git('init'); git('config', 'user.name', 'Scope Test'); git('config', 'user.email', 'scope@example.invalid');
    mkdirSync(join(dir, 'portal-app'));
    writeFileSync(join(dir, 'portal-app/app.js'), 'example');
    git('add', '.'); git('commit', '-m', 'input');
    const base = git('rev-parse', 'HEAD');
    git('mv', 'portal-app/app.js', 'archived.md'); git('commit', '-m', 'move input');
    const head = git('rev-parse', 'HEAD');
    assert.deepEqual(scopeFor(changedPaths(base, head, dir)), { frontend: true, backend: false });
    assert.equal(changedPaths('0'.repeat(40), head, dir), null);
    assert.equal(changedPaths('f'.repeat(40), head, dir), null);
    assert.equal(changedPaths(undefined, head, dir), null);
    assert.deepEqual(changedPaths(head, head, dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
