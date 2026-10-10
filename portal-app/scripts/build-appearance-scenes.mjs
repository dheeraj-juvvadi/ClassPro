import { writeFile } from 'node:fs/promises';
import { catSprite, catSvg } from './cat-sprites.mjs';

// Static, locally generated panoramas: no canvas or animation work in the app.
const root = new URL('../public/', import.meta.url);
const width = 480, height = 84;
const scene = { name: 'Catnap Alley', sky: ['#383a40', '#696670', '#a29a9d'], moon: '#c6bdac', warm: '#baa589' };
const rgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16));
const hex = values => '#' + values.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => a.map((n, i) => n * (1 - t) + b[i] * t);
const noise = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
let pixels, palette;
function rect(x, y, w, h, color) {
  for (let yy = Math.max(0, Math.round(y)); yy < Math.min(height, Math.round(y) + Math.round(h)); yy++) {
    for (let xx = Math.max(0, Math.round(x)); xx < Math.min(width, Math.round(x) + Math.round(w)); xx++) pixels[yy * width + xx] = color;
  }
}
function sky() {
  const colors = palette.sky.map(rgb);
  for (let y = 0; y < height; y++) {
    const t = Math.min(1, y / 66), segment = t < .6 ? 0 : 1;
    const amount = segment ? (t - .6) / .4 : t / .6;
    rect(0, y, width, 1, hex(mix(colors[segment], colors[segment + 1], Math.round(amount * 10) / 10)));
  }
  const cx = 365, cy = palette.moon ? 17 : 31, radius = palette.moon ? 6 : 10;
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
    if (x * x + y * y > radius * radius) continue;
    if (palette.moon && (x - 3) ** 2 + (y + 2) ** 2 < (radius - 1) ** 2) continue;
    rect(cx + x, cy + y, 1, 1, palette.moon || palette.sun);
  }
  if (palette.moon) for (let i = 0; i < 46; i++) {
    rect(noise(i + 9) * width, 3 + noise(i + 77) * 27, 1, 1, i % 7 ? '#77849c' : '#c0b5bc');
  }
  for (let i = 0; i < 8; i++) {
    const x = noise(i + 81) * width, y = 17 + noise(i + 22) * 17;
    rect(x, y, 13 + noise(i) * 33, 1, hex(mix(rgb(palette.sky[1]), rgb(palette.sky[2]), .3)));
  }
}
function cat(x, y, pose, colors, flip = false) {
  const sprite = catSprite(pose, ...colors);
  for (const [xx, yy, color] of sprite.pixels) {
    rect(x + (flip ? sprite.width - 1 - xx : xx), y - sprite.height + yy, 1, 1, color);
  }
}
function rooftops() {
  const perches = [];
  for (let layer = 0; layer < 2; layer++) {
    for (let x = -4, i = 0; x < width; i++) {
      const w = 17 + Math.floor(noise(i + 12) * 15), top = 43 + Math.floor(noise(i + 18) * 20) + layer * 8;
      rect(x, top, w, height - top, layer ? '#3b3c40' : '#57565c');
      rect(x - 1, top, w + 2, 1, layer ? '#777175' : '#81797a');
      rect(x + w - 3, top + 1, 3, height - top, '#34363a');
      for (let xx = x + 3; xx < x + w - 3; xx += 5) for (let yy = top + 4; yy < 80; yy += 6) {
        rect(xx, yy, 2, 3, noise(xx + yy) > .7 ? palette.warm : '#4b4d53');
      }
      if (layer && [1, 4, 7, 10, 13, 16].includes(i)) perches.push([x, top, i]);
      if (i % 4 === 0) { rect(x + 5, top - 8, 1, 8, '#76727a'); rect(x + 2, top - 6, 7, 1, '#76727a'); }
      x += w + 2;
    }
  }
  const coats = [
    ['#bca88e', '#887b6c', '#d1c1aa'],
    ['#96948e', '#6c6e6b', '#b3b0a7'],
    ['#b3a79b', '#807a73', '#cdc1b3'],
  ];
  perches.forEach(([x, y], i) => {
    cat(x, y, ['sleep', 'sit', 'loaf'][i % 3], coats[i % 3], i % 2 === 0);
  });
}
function svg(name, x = 0, w = width) {
  const paths = new Map();
  for (let y = 0; y < height; y++) for (let xx = x; xx < x + w;) {
    const color = pixels[y * width + xx]; let end = xx + 1;
    while (end < x + w && pixels[y * width + end] === color) end++;
    const path = `M${xx - x} ${y}h${end - xx}v1h-${end - xx}z`;
    paths.set(color, (paths.get(color) || '') + path); xx = end;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${height}" shape-rendering="crispEdges" data-art-style="pixel"><title>${name} pixel panorama</title>`
    + [...paths].map(([color, path]) => `<path fill="${color}" d="${path}"/>`).join('') + '</svg>\n';
}
palette = scene; pixels = new Array(width * height);
sky(); rooftops();
await writeFile(new URL('scene-cats.svg', root), svg(scene.name));
// A real pixel wordmark, with a text alternative in the HTML header.
const glyphs = {
  A: ['01110','11011','11011','11111','11011','11011','11011'],
  n: ['00000','00000','11110','11011','11011','11011','11011'],
  o: ['00000','00000','01110','11011','11011','11011','01110'],
};
let wordmark = '', offset = 0;
for (const letter of 'Anon') {
  glyphs[letter].forEach((row, y) => [...row].forEach((on, x) => {
    if (on === '1') wordmark += `M${offset + x} ${y}h1v1h-1z`;
  }));
  offset += 6;
}
await writeFile(new URL('anon-pixel.svg', root), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 7" shape-rendering="crispEdges"><title>Anon</title><path fill="#f3ece0" d="${wordmark}"/></svg>\n`);
await writeFile(new URL('anon-sleeping-cat.svg', root), catSvg(catSprite('sleep'), 'A tabby sleeping with tucked paws on Anon'));
console.log('Built Catnap Alley, the pixel Anon wordmark and its sleeping cat.');
