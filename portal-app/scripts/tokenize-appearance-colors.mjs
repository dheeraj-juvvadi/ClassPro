import { readFile, writeFile, readdir } from 'node:fs/promises';
import { roleGroups, translucentRoles } from './catnap-color-roles.mjs';

// One-time migration utility. Never changes layout declarations or the default
// color value. Re-running skips values already using a Catnap role.
const root = new URL('../public/', import.meta.url);
const roles = new Map(Object.entries(roleGroups).flatMap(([role, colors]) =>
  colors.split(/\s+/).map(color => ['#' + color, role])));
const unknown = new Set();
function themed(source) {
  return source.replace(/var\(--catnap-[\w-]+,\s*#[\da-f]+\)|#[\da-f]{3,8}\b/gi, value => {
    if (value.startsWith('var(')) return value;
    const color = value.toLowerCase();
    const role = roles.get(color);
    if (role) return `var(--catnap-${role}, ${value})`;
    if (translucentRoles[color.slice(1)]) {
      const name = `--catnap-overlay-${color.slice(1)}`;
      return `var(${name}, ${value})`;
    }
    unknown.add(color);
    return value;
  });
}
let changed = 0;
for (const name of await readdir(root)) {
  if (!name.endsWith('.css') || ['appearance-scenes.css', 'pixel-cats.css', 'public-pages.css'].includes(name)) continue;
  const file = new URL(name, root), before = await readFile(file, 'utf8');
  const after = themed(before);
  if (after !== before) { await writeFile(file, after); changed++; }
}
// Inline SVG presentation attributes can inherit custom properties as well.
const timetable = new URL('timetable-svg.js', root);
const before = await readFile(timetable, 'utf8');
const after = themed(before);
if (after !== before) { await writeFile(timetable, after); changed++; }
console.log(`Updated colors in ${changed} files; layout declarations preserved.`);
console.log('Unmapped colors:', [...unknown].sort().join(' '));
