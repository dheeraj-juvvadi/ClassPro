import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDirectory = new URL('../public/', import.meta.url);
const fontFile = process.argv[2] ?? '/tmp/classpro-marks-Inter.ttf';
const outputFile = process.argv[3] ?? '/tmp/classpro-marks-agent.png';
const fontData = await readFile(new URL('InterVariable.woff2', publicDirectory));
const source = await readFile(new URL('marks-concept.svg', publicDirectory), 'utf8');
const embedded = source.replace("url('/InterVariable.woff2')", `url('data:font/woff2;base64,${fontData.toString('base64')}')`);

await sharp({ text: { text: 'Inter', font: 'Inter 12', fontfile: fontFile, rgba: true } }).png().toBuffer();
await sharp(Buffer.from(embedded), { density: 144 }).png().toFile(outputFile);
const metadata = await sharp(outputFile).metadata();
if (/gradient|opacity|filter|shadow/i.test(source)) throw new Error('Matte-only verification failed');
for (const label of ['Home', 'Attendance', 'Marks']) {
  if ((source.match(new RegExp(`>${label}</text>`, 'g')) ?? []).length !== 1) {
    throw new Error(`Expected exactly one ${label} navigation label`);
  }
}
const scores = [...source.matchAll(/class="score"[^>]*>(\d+)<tspan class="denominator"> \/ (\d+)/g)];
const earned = scores.reduce((total, match) => total + Number(match[1]), 0);
const maximum = scores.reduce((total, match) => total + Number(match[2]), 0);
if (!source.includes(`>${earned} / ${maximum}</text>`) || scores.length !== 3) throw new Error('Score total mismatch');
console.log(JSON.stringify({ source: fileURLToPath(new URL('marks-concept.svg', publicDirectory)), outputFile, width: metadata.width, height: metadata.height, font: 'Embedded local Inter; registered TTF for librsvg', verification: 'Flat fills; three navigation labels; totals consistent' }));
