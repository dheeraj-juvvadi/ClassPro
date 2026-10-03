import { execFileSync } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const output = resolve(root, 'dist');
await mkdir(output, { recursive: true });
const releases = await fetch('https://go.dev/dl/?mode=json');
if (!releases.ok) throw new Error('Go release metadata unavailable');
const release = (await releases.json()).find(item => item.stable);
const archiveInfo = release?.files.find(item => item.os === 'linux' && item.arch === 'amd64' && item.kind === 'archive');
if (!archiveInfo) throw new Error('Go toolchain archive unavailable');
const archive = await fetch(`https://go.dev/dl/${archiveInfo.filename}`);
if (!archive.ok) throw new Error('Go toolchain download failed');
const bytes = Buffer.from(await archive.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== archiveInfo.sha256) throw new Error('Go toolchain checksum mismatch');
await writeFile('/tmp/anon-go.tar.gz', bytes);
execFileSync('tar', ['-xzf', '/tmp/anon-go.tar.gz', '-C', '/tmp']);
execFileSync('/tmp/go/bin/go', ['build', '-trimpath', '-ldflags=-s -w', '-o', output + '/portal-go-binary', '.'], {
  cwd: root + '/portal-go', env: { ...process.env, CGO_ENABLED: '0', GOOS: 'linux', GOARCH: 'amd64' }, stdio: 'inherit',
});
for (const path of ['appwrite-backend/start.mjs']) {
  await cp(resolve(root, path), resolve(output, path), { recursive: true });
}
await mkdir(output + '/client', { recursive: true });
await cp('/etc/ssl/certs/ca-certificates.crt', resolve(output, 'ca-certificates.crt'));
await writeFile(output + '/package.json', JSON.stringify({ private: true, type: 'module' }));
await writeFile(output + '/handler.js', "export { handler } from './appwrite-backend/start.mjs';\n");
console.log('Browser-free Go backend build ready');
