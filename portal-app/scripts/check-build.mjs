import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
const root = new URL('../public/', import.meta.url);
for (const name of await readdir(root)) {
  if (name.endsWith('.js')) {
    const checked = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(name, root))], { stdio: 'inherit' });
    if (checked.status !== 0) process.exit(1);
  }
  if (!name.endsWith('.html')) continue;
  const $ = load(await readFile(new URL(name, root), 'utf8'));
  if (!$('title').text() || !$('meta[name="description"]').attr('content')) throw new Error(`Missing metadata: ${name}`);
  for (const element of $('[src], link[href]')) {
    const path = $(element).attr('src') || $(element).attr('href');
    if (!path?.startsWith('/') || path.startsWith('/_vercel/')) continue;
    await access(new URL(path.split('?')[0].slice(1), root));
  }
  for (const img of $('img')) if ($(img).attr('alt') === undefined) throw new Error(`Missing alt: ${name}`);
}
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
for (const icon of manifest.icons) await access(new URL(icon.src.slice(1), root));
console.log('Static build checks passed: JavaScript, metadata, assets, icons and alt text.');
