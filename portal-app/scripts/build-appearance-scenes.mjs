import { writeFile } from 'node:fs/promises';
import { styledScenes } from './scene-styles.mjs';

// Static, locally generated panoramas: no canvas or animation work in the app.
const root = new URL('../public/', import.meta.url);
const width = 480, height = 84;
const scenes = {
  sunrise: { name: 'First Light', sky: ['#244b50', '#70a59a', '#e6dcab'], sun: '#fff0bb', warm: '#f5d3a0' },
  sunset: { name: 'Ember Coast', sky: ['#572d48', '#c76054', '#ffa454'], sun: '#ffe5a3', warm: '#ffd0a3' },
  moonlight: { name: 'Roman Nocturne', sky: ['#0d1734', '#243f77', '#526ca8'], stone: [91, 132, 197], moon: '#d5e5fc', warm: '#efcb8a' },
  cats: { name: 'Catnap Alley', sky: ['#30244b', '#6d528b', '#b797b8'], moon: '#e8cfb4', warm: '#f1c292' },
  sand: { name: 'Saffron Dunes', sky: ['#57482b', '#b08743', '#edca79'], sun: '#fff0bb', warm: '#e8c9a3' },
  clay: { name: 'Rosewood Valley', sky: ['#522e3a', '#ae7583', '#edd0c3'], sun: '#f8e8d6', warm: '#eac3a5' },
};
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
function cat(x, y, color, sitting = true) {
  rect(x, y - 5, 5, 5, color);
  rect(x, y - 7, 1, 3, color); rect(x + 4, y - 7, 1, 3, color);
  rect(x + 1, y - 3, 1, 1, '#e8c9a3'); rect(x + 3, y - 3, 1, 1, '#e8c9a3');
  rect(x, y, sitting ? 5 : 9, 4, color);
  rect(x - 3, y + 3, 5, 1, color); rect(x - 3, y + 1, 1, 2, color);
}
function sleepingCat(x, y, color) {
  rect(x + 2, y - 4, 7, 1, color); rect(x + 1, y - 3, 10, 3, color);
  rect(x, y - 3, 4, 3, color); rect(x, y - 5, 1, 2, color);
  rect(x + 3, y - 4, 1, 1, color); rect(x + 1, y - 1, 2, 1, '#4b374f');
  rect(x + 7, y - 2, 6, 2, '#98738b'); rect(x + 10, y - 3, 3, 1, '#98738b');
}
function rooftops() {
  const perches = [];
  for (let layer = 0; layer < 2; layer++) {
    for (let x = -4, i = 0; x < width; i++) {
      const w = 17 + Math.floor(noise(i + 12) * 15), top = 43 + Math.floor(noise(i + 18) * 20) + layer * 8;
      rect(x, top, w, height - top, layer ? '#343046' : '#5c4b62');
      rect(x - 1, top, w + 2, 1, layer ? '#a1828d' : '#927181');
      rect(x + w - 3, top + 1, 3, height - top, '#29293d');
      for (let xx = x + 3; xx < x + w - 3; xx += 5) for (let yy = top + 4; yy < 80; yy += 6) {
        rect(xx, yy, 2, 3, noise(xx + yy) > .7 ? palette.warm : '#4f4a62');
      }
      if (layer && [1, 3, 5, 7, 8, 9, 11, 12, 14, 16].includes(i)) perches.push([x + 7, top, i]);
      if (i % 4 === 0) { rect(x + 5, top - 8, 1, 8, '#756580'); rect(x + 2, top - 6, 7, 1, '#756580'); }
      x += w + 2;
    }
  }
  for (const [x, y, i] of perches) {
    const color = ['#d9c6bc', '#e4b782', '#aea9c8', '#c79286'][i % 4];
    if (i % 3 === 0) sleepingCat(x, y, color);
    else cat(x, y - 4, color, i % 3 !== 1);
  }
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
for (const [name, colors] of Object.entries(scenes)) {
  if (name === 'cats') {
    palette = colors; pixels = new Array(width * height);
    sky(); rooftops();
    await writeFile(new URL(`scene-${name}.svg`, root), svg(colors.name));
  } else {
    await writeFile(new URL(`scene-${name}.svg`, root), styledScenes[name]());
  }
}
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
console.log(`Built ${Object.keys(scenes).length} responsive scenes and the pixel Anon wordmark.`);
