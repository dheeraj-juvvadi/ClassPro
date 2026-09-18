import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';

const root = new URL('../public/', import.meta.url);
const check = process.argv.includes('--check');
const pages = ['/', '/privacy.html', '/terms.html', '/404.html', '/report-issue.html', '/thank-you.html'];
const assets = new Set(pages);
const digest = createHash('sha256');
const versions = [];
// Release validation reuses the exact same content-derived asset URLs.
for (const name of await readdir(root)) {
  if (!/\.(?:js|css)$/.test(name) || name === 'service-worker.js') continue;
  const hash = createHash('sha256').update(await readFile(new URL(name, root))).digest('hex').slice(0, 10);
  const pattern = new RegExp('/' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\?v=[a-f0-9]+)?(?=")', 'g');
  versions.push([pattern, '/' + name + '?v=' + hash]);
}
for (const page of pages) {
  const path = new URL(page === '/' ? 'index.html' : page.slice(1), root);
  const source = await readFile(path, 'utf8');
  let html = source;
  for (const [pattern, replacement] of versions) html = html.replace(pattern, replacement);
  if (html !== source) {
    if (check) throw new Error('Asset versions changed. Run npm run build:offline and stage the generated files.');
    await writeFile(path, html);
  }
}
const add = value => {
  if (!value?.startsWith('/') || value.startsWith('//') || /^\/(api|_vercel|ocr)\//.test(value)) return;
  assets.add(value);
};
for (const page of pages) {
  const html = await readFile(new URL(page === '/' ? 'index.html' : page.slice(1), root), 'utf8');
  const $ = load(html);
  for (const element of $('[src], [data-src], link[href]')) {
    add($(element).attr('src') || $(element).attr('data-src') || $(element).attr('href'));
  }
}
// Include stylesheet dependencies and install icons, not OCR/runtime APIs.
for (const asset of assets) {
  const path = asset.split('?')[0];
  if (path.endsWith('.css')) {
    const css = await readFile(new URL(path.slice(1), root), 'utf8');
    for (const match of css.matchAll(/url\(['"]?(\/[^)'"\s]+)['"]?\)/g)) add(match[1]);
  }
}
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
for (const icon of manifest.icons) add(icon.src);
const list = [...assets].sort();
let total = 0;
for (const asset of list) {
  const path = asset === '/' ? 'index.html' : asset.slice(1).split('?')[0];
  const bytes = await readFile(new URL(path, root));
  total += bytes.length;
  digest.update(asset); digest.update(bytes);
}
if (list.length > 100 || total > 4 * 1024 * 1024) throw new Error('Offline shell exceeds its 100-asset / 4 MiB budget.');
const template = await readFile(new URL('service-worker.template.js', import.meta.url), 'utf8');
digest.update(template);
const revision = digest.digest('hex').slice(0, 16);
const worker = template.replace('__REVISION__', revision).replace('__ASSETS__', JSON.stringify(list, null, 2)).replace('__PAGES__', JSON.stringify(pages));
if (check) {
  if (worker !== await readFile(new URL('service-worker.js', root), 'utf8')) throw new Error('Offline shell is stale. Run npm run build:offline and stage the generated files.');
} else await writeFile(new URL('service-worker.js', root), worker);
console.log(`Offline shell ${revision}: ${list.length} public assets, ${(total / 1024 / 1024).toFixed(2)} MiB.`);
