import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const publicDir = new URL('../public/', import.meta.url);
const logo = await readFile(new URL('logo.svg', publicDir), 'utf8');
// Keep the entire flower within the maskable icon's central safe circle.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#191b19"/>
  <svg x="22" y="22" width="84" height="84" viewBox="0 0 64 64">${logo.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>
</svg>`;
const favicon = icon.replace('x="22" y="22" width="84" height="84"', 'x="0" y="0" width="128" height="128"');
await writeFile(new URL('favicon.svg', publicDir), favicon);
for (const size of [192, 512]) {
  const png = await sharp(Buffer.from(icon)).resize(size, size).png().toBuffer();
  for (const suffix of ['', '-maskable']) {
    await writeFile(new URL(`icons/icon-${size}${suffix}.png`, publicDir), png);
  }
}
await writeFile(new URL('icons/apple-touch-icon.png', publicDir), await sharp(Buffer.from(icon)).resize(180, 180).png().toBuffer());
const pngs = await Promise.all([16, 32, 48].map(size => sharp(Buffer.from(favicon)).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + pngs.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((png, index) => {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = [16, 32, 48][index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(new URL('favicon.ico', publicDir), Buffer.concat([header, ...pngs]));
console.log('Generated favicon, touch icon, and four install icons from logo.svg');
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#191b19"/>
  <path d="M84 526H1116" stroke="#3b4035"/>
  <svg x="890" y="164" width="230" height="230" viewBox="0 0 64 64">${logo.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>
  <text x="84" y="122" fill="#f1eee3" font-family="sans-serif" font-size="32" font-weight="700">Anon</text>
  <text x="84" y="284" fill="#f1eee3" font-family="sans-serif" font-size="70">A little room</text>
  <text x="84" y="370" fill="#c5d4a7" font-family="sans-serif" font-size="70">to grow.</text>
  <text x="84" y="462" fill="#b3b8ab" font-family="sans-serif" font-size="25">Attendance. Marks. Your academic day.</text>
  <text x="84" y="574" fill="#b3b8ab" font-family="sans-serif" font-size="20">anon-tracker.vercel.app</text>
</svg>`;
await writeFile(new URL('og-image.png', publicDir), await sharp(Buffer.from(social)).png({ compressionLevel: 9 }).toBuffer());

// New URLs invalidate browser and OS icon caches without changing app identity.
async function versioned(path) {
  const data = await readFile(new URL(path, publicDir));
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 10);
  const name = path.replace(/(\.[^.]+)$/, `.${hash}$1`);
  await writeFile(new URL(name, publicDir), data);
  return `/${name}`;
}
const iconUrl = await versioned('favicon.svg');
const icoUrl = await versioned('favicon.ico');
const touchUrl = await versioned('icons/apple-touch-icon.png');
const manifestPath = new URL('manifest.webmanifest', publicDir);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.id = '/';
for (const icon of manifest.icons) {
  const source = icon.src.slice(1).replace(/\.[a-f0-9]{10}(?=\.png$)/, '');
  icon.src = await versioned(source);
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const manifestHash = createHash('sha256').update(await readFile(manifestPath)).digest('hex').slice(0, 10);
const indexPath = new URL('index.html', publicDir);
let html = await readFile(indexPath, 'utf8');
html = html.replace(/(<link rel="icon" href=")[^"]+(" sizes=)/, `$1${icoUrl}$2`)
  .replace(/(<link rel="icon" href=")[^"]+(" type=)/, `$1${iconUrl}$2`)
  .replace(/(<link rel="apple-touch-icon" href=")[^"]+/, `$1${touchUrl}`)
  .replace(/(<link rel="manifest" href=")[^"]+/, `$1/manifest.webmanifest?v=${manifestHash}`);
await writeFile(indexPath, html);
console.log('Versioned favicon and install icon URLs; stable manifest id /');
