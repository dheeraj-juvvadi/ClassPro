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
and rests between turns. Motion pauses
when hidden and respects reduced motion.

The selected botanical backgrounds remain SVG. The optional standard-library
`python portal-app/scripts/optimize-floral-art.py` removes texture marks only
when their padded bounds lie entirely outside their existing polygon clip.
Unknown path syntax is retained. Run it after regenerating floral artwork.

| Background | Before → after bytes | Before → after elements | Gzip bytes |
| --- | --- | --- | --- |
| Desktop | 463,371 → 401,850 | 5,294 → 4,467 | 60,824 → 52,586 |
| Mobile | 379,883 → 313,848 | 4,315 → 3,447 | 50,796 → 41,945 |

Sharp raster comparisons before/after had zero changed color channels at
desktop widths 1440/1920/2880 and mobile widths 480/960/1440. The visible paths,
colors and clipping boundaries are unchanged. This reduces parsing and drawing
work without adding bitmap memory or a rendering dependency.

The calendar banner was removed at the user's request; its 126,966-byte SVG
is no longer referenced or downloaded by the app/offline shell. The new Cally
calendar component adds 38,355 bytes (about 12 KB gzip) on demand. The complete
public offline shell is now about 1.62 MiB, including the component.
`painted-flowers.webp` is 144,860 bytes; PNG install icons are generated at the
required sizes. HTML images have explicit alt text, including empty alt for
decoration; build validation checks this.

Next optimization candidates include avoiding unnecessary idle shell downloads
on constrained connections. Desktop browser checks and lower element counts do
not establish physical-phone frame rate or battery cost.
