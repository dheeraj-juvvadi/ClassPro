import { execFileSync } from 'node:child_process';
import { cp, mkdir, writeFile, chmod, readdir, lstat, readlink, symlink, unlink } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'dist');
await mkdir(output, { recursive: true });
await mkdir(output + '/system/etc/apk', { recursive: true });
await cp('/etc/apk/keys', output + '/system/etc/apk/keys', { recursive: true });
console.log('Preparing Go API and Alpine Chromium runtime');
execFileSync('apk', ['--root', output + '/system', '--initdb', '--no-scripts', '--repositories-file', '/etc/apk/repositories', 'add', 'chromium', 'ca-certificates', 'font-noto'], { stdio: 'inherit' });
const archive = await fetch('https://go.dev/dl/go1.25.0.linux-amd64.tar.gz');
if (!archive.ok) throw new Error('Go toolchain download failed');
await writeFile('/tmp/classpro-go.tar.gz', Buffer.from(await archive.arrayBuffer()));
execFileSync('tar', ['-xzf', '/tmp/classpro-go.tar.gz', '-C', '/tmp']);
execFileSync('/tmp/go/bin/go', ['build', '-trimpath', '-ldflags=-s -w', '-o', output + '/portal-go-binary', '.'], {
  cwd: root + '/portal-go', env: { ...process.env, CGO_ENABLED: '0', GOOS: 'linux', GOARCH: 'amd64' }, stdio: 'inherit',
});
for (const path of ['portal-app/src', 'portal-go/start.mjs', 'portal-go/worker.mjs', 'appwrite-backend/start.mjs']) {
  await cp(resolve(root, path), resolve(output, path), { recursive: true });
}
await mkdir(output + '/client', { recursive: true });
await writeFile(output + '/handler.js', "export { handler } from './appwrite-backend/start.mjs';\n");
await writeFile(output + '/chromium.sh', '#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexport FONTCONFIG_PATH="$ROOT/system/etc/fonts"\nexport SSL_CERT_FILE="$ROOT/system/etc/ssl/cert.pem"\nexport LD_LIBRARY_PATH="$ROOT/system/lib:$ROOT/system/usr/lib:$ROOT/system/usr/lib/chromium:$ROOT/system/usr/lib/pulseaudio"\nexec "$ROOT/system/usr/lib/chromium/chrome" "$@"\n');
await chmod(output + '/chromium.sh', 0o755);
execFileSync(output + '/chromium.sh', ['--version'], { stdio: 'inherit' });
execFileSync(output + '/chromium.sh', ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', 'about:blank'], { stdio: 'inherit', timeout: 20000 });
async function normalizeBundle(directory) {
  await chmod(directory, 0o755);
  for (const name of await readdir(directory)) {
    const path = resolve(directory, name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      const target = await readlink(path);
      if (target.startsWith('/')) {
        await unlink(path);
        const bundled = resolve(output, 'system', '.' + target);
        try { await lstat(bundled); await symlink(relative(dirname(path), bundled), path); } catch {}
      }
    } else if (info.isDirectory()) await normalizeBundle(path);
    else await chmod(path, info.mode & 0o111 ? 0o755 : 0o644);
  }
}
await normalizeBundle(output + '/system');
console.log('Backend build ready');
