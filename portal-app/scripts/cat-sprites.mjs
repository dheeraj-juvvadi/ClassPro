// Small side-profile cats: rounded haunches, tucked paws and a resting head.
// Shared by the rooftop scene and the logo so both use the same anatomy.
export function catSprite(pose = 'sleep', coat = '#bca88e', shade = '#887b6c', light = '#d1c1aa') {
  const pixels = new Map(), outline = '#57544f';
  const put = (x, y, color) => pixels.set(`${x},${y}`, [x, y, color]);
  const box = (x, y, w, h, color) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, color);
  };
  const oval = (cx, cy, rx, ry, color) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(x, y, color);
      }
    }
  };
  if (pose === 'sit') {
    // Back/three-quarter view; a narrow neck above a broad seated haunch.
    oval(12, 17, 6, 7, outline); oval(12, 17, 5, 6, coat);
    oval(10, 12, 3, 6, coat); oval(13, 18, 3, 4, shade);
    oval(10, 7, 4, 4, outline); oval(10, 7, 3, 3, coat);
    box(7, 2, 1, 4, outline); box(8, 3, 1, 3, coat);
    box(13, 2, 1, 4, outline); box(12, 3, 1, 3, coat);
    box(9, 10, 2, 2, light); box(8, 17, 1, 6, light);
    box(7, 23, 5, 1, coat);
    // Tail lies along the ledge, not an upright rectangular hook.
    for (const [x, y] of [[16,20],[17,21],[18,22],[19,23],[21,23],[23,22]]) oval(x,y,2,1,shade);
    return { width: 26, height: 25, pixels: [...pixels.values()] };
  }
  const lounging = pose === 'loaf';
  oval(21, 10, 11, 7, outline); oval(21, 9, 10, 6, coat);
  oval(21, 7, 7, 3, light); oval(24, 12, 7, 3, shade);
  // Small low head, with the muzzle projecting beyond the cheek.
  oval(9, lounging ? 8 : 10, 5, 4, outline);
  oval(9, lounging ? 8 : 10, 4, 3, coat);
  const earY = lounging ? 3 : 5;
  box(7, earY, 1, 4, outline); box(8, earY + 1, 1, 3, coat);
  box(12, earY + 1, 1, 2, shade);
  oval(5, lounging ? 10 : 12, 2, 1, light);
  put(3, lounging ? 10 : 12, outline);
  // A single closed eye reads as profile, not a two-eyed cartoon face.
  box(7, lounging ? 9 : 11, 2, 1, outline);
  box(9, lounging ? 8 : 10, 1, 1, outline);
  oval(11, 15, 5, 1, light);
  // Tail curls around the sleeping body and tapers beside the tucked paw.
  for (const [x,y,r] of [[30,11,2],[30,13,2],[28,15,2],[24,16,3],[19,16,3],[16,15,2]]) oval(x,y,r,1,shade);
  box(22, 4, 2, 2, shade); box(26, 5, 2, 2, shade);
  return { width: 34, height: 18, pixels: [...pixels.values()] };
}

export function catSvg(sprite, title) {
  const paths = new Map();
  for (const [x, y, color] of sprite.pixels) paths.set(color, (paths.get(color) || '') + `M${x} ${y}h1v1h-1z`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sprite.width} ${sprite.height}" shape-rendering="crispEdges"><title>${title}</title>`
    + [...paths].map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('') + '</svg>\n';
}
