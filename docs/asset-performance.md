# Public asset performance

The editorial font is served as WOFF2: 214,960 bytes instead of the original
451,664-byte TTF (52.4% smaller). The conversion preserves the glyph order,
Unicode map and variable-axis ranges/defaults. It does not subset languages or
weights. `font-display: swap` keeps text available during a slow download.

To regenerate after replacing the source font, install `fonttools[woff]` in a
separate Python environment and run
`python portal-app/scripts/compress-editorial-font.py`, then regenerate the
offline shell. Font tooling is not a runtime/build dependency. The TTF remains
the editable source; only WOFF2 is referenced by the app and offline shell.

The shared flower loader is a 966-byte SVG. It rotates with a CSS transform
and rests between turns; the sync controller adds no polling. Motion pauses
when hidden and respects reduced motion.

The selected botanical backgrounds remain SVG: desktop 463,371 bytes and
mobile 379,883 bytes before HTTP compression. They contain 5,294 and 4,315
elements respectively, so their small compressed transfer sizes alone do not
establish cheap rasterization. The calendar SVG is 126,966 bytes and loads when
opened. `painted-flowers.webp` is 144,860 bytes; PNG install icons are generated
at the required sizes. HTML images have explicit alt text, including empty alt
for decoration; build validation checks this.

Next optimization candidates are reducing the background drawing operations
while preserving its approved appearance and avoiding unnecessary idle shell
downloads on constrained connections. Desktop browser checks do not establish
physical-phone frame rate or battery cost.
