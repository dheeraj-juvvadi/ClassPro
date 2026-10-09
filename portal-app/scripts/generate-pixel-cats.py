#!/usr/bin/env python3
"""Original, static pixel art for Anon's Cats appearance. No dependencies."""
from collections import Counter, defaultdict
from math import sqrt
from pathlib import Path
from random import Random

OUT = Path(__file__).resolve().parents[1] / 'public'

# Flat colours only: no gradients, filters, external files, or animation.
SKY = ['#101534', '#171d40', '#1f244c', '#292a58', '#342e5e', '#423261',
       '#523760', '#653c5e', '#7a425a', '#914954', '#a8524f', '#c05e4b',
       '#d56f4a', '#e6884c', '#f2a055']
SUN = ['#f2914c', '#ffb763', '#ffd68a', '#fff0bb']
HILL = '#2b2547'
CITY, CITY_TOP, CITY_SIDE = '#191533', '#262047', '#120f28'
WINDOW = ['#ffc678', '#f2a95e', '#c98a52']
TOWER, TOWER_LIT, TOWER_DARK, TOWER_DECK = '#e2684a', '#f7a06a', '#a8412f', '#f7e2c8'
LEDGE, LEDGE_LIT, LEDGE_MID, LEDGE_SEAM = '#151228', '#d08a6a', '#8f4f56', '#221c3c'
GLOW, GLOW_CORE = '#f4b25e', '#ffe6ad'
CAT_GINGER = ('#e09a5f', '#a4653e', '#f8ca8d', '#2b1c22')
CAT_DARK = ('#6d6a94', '#43406a', '#a09cc6', '#241f3a')
CAT_CREAM = ('#e8d3ae', '#ab9673', '#fff1d2', '#3a2b28')

# Full-screen backdrop: the same sunset, layered for depth behind live UI.
DUSK = ['#0b1029', '#111737', '#172045', '#1f2a56', '#2b3163', '#3a3668',
        '#4b3a68', '#5f3f65', '#76455f', '#8f4c58', '#a8544f', '#c05e4a',
        '#d46e48', '#e4814a', '#f0944e']
FAR, FAR_TOP = '#241f4a', '#2e2857'
MID, MID_TOP = '#1a1637', '#221d45'
NEAR, NEAR_TOP = '#120f2a', '#1a1637'
WALL, WALL_TOP, WALL_LIT = '#0d0a1e', '#6a3a45', '#b5645a'


class Canvas:
    """A flat pixel grid. Empty cells stay None so later layers can overlap."""

    def __init__(self, width, height):
        self.width, self.height = width, height
        self.grid = [[None] * width for _ in range(height)]
        self.bands, self.band_step = SKY, 4

    def px(self, x, y, color):
        if color is not None and 0 <= x < self.width and 0 <= y < self.height:
            self.grid[y][x] = color

    def rect(self, x, y, w, h, color):
        for row in range(max(0, y), min(self.height, y + h)):
            for col in range(max(0, x), min(self.width, x + w)):
                self.grid[row][col] = color

    def oval(self, x, y, w, h, color):
        for row in range(h):
            t = (row + 0.5) / h
            inset = round(w / 2 * (1 - sqrt(max(0.0, 1 - (2 * t - 1) ** 2))))
            self.rect(x + inset, y + row, max(1, w - inset * 2), 1, color)

    def blob(self, x, y, w, h, fill, outline=None):
        if outline:
            self.oval(x - 1, y - 1, w + 2, h + 2, outline)
        self.oval(x, y, w, h, fill)

    def triangle(self, x, y, w, h, color, flip=False):
        for row in range(h):
            span = max(1, round(w * (row + 1) / h))
            self.rect(x + w - span if flip else x, y + row, span, 1, color)

    def sky_band(self, y):
        return self.bands[min(len(self.bands) - 1, max(0, y) // self.band_step)]

    def paint_sky(self, bands, step=4):
        """Fill the top of the canvas with a stepped ramp and remember it."""
        self.bands, self.band_step = bands, step
        for index, colour in enumerate(bands):
            self.rect(0, index * step, self.width, step, colour)
        self.rect(0, len(bands) * step, self.width,
                  self.height - len(bands) * step, bands[-1])

    def erase(self, x, y, w, h):
        for row in range(max(0, y), min(self.height, y + h)):
            self.rect(x, row, w, 1, self.sky_band(row))

    def preview(self, step=4, box=None):
        """Downsampled ASCII, so composition can be checked without an image."""
        x0, y0, x1, y1 = box or (0, 0, self.width, self.height)
        for y in range(y0, min(y1, self.height), step):
            line = ''
            for x in range(x0, min(x1, self.width), step):
                cell = [self.grid[row][col]
                        for row in range(y, min(self.height, y + step))
                        for col in range(x, min(self.width, x + step))]
                cell = [c for c in cell if c]
                common = Counter(cell).most_common(1)
                line += KEY.get(common[0][0], '?') if common else '.'
            print(line.rstrip())

    def save(self, name, title):
        """Greedy rectangle merge keeps each drawing small and still exact."""
        runs = defaultdict(list)
        used = [[False] * self.width for _ in range(self.height)]
        for y in range(self.height):
            for x in range(self.width):
                color = self.grid[y][x]
                if color is None or used[y][x]:
                    continue
                w = 1
                while x + w < self.width and self.grid[y][x + w] == color and not used[y][x + w]:
                    w += 1
                h = 1
                while y + h < self.height and all(
                        self.grid[y + h][x + i] == color and not used[y + h][x + i] for i in range(w)):
                    h += 1
                for row in range(y, y + h):
                    for col in range(x, x + w):
                        used[row][col] = True
                runs[color].append(f'M{x} {y}h{w}v{h}h{-w}z')
        parts = [f'<path fill="{color}" d="{"".join(paths)}"/>' for color, paths in runs.items()]
        svg = '\n'.join([
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {self.height}"'
            f' width="{self.width * 2}" height="{self.height * 2}" shape-rendering="crispEdges"'
            ' role="img" aria-labelledby="title">',
            f'<title id="title">{title}</title>', *parts, '</svg>', ''])
        (OUT / name).write_text(svg)


# Preview glyphs, darkest sky first, so the whole scene can be read as text.
KEY = dict(zip(SKY, ' .,-=+*~^%&$#@!'))
KEY.update({
    SUN[0]: '(', SUN[1]: ')', SUN[2]: '0', SUN[3]: 'O',
    HILL: 'm', CITY: 'b', CITY_TOP: 'B', CITY_SIDE: 'x',
    WINDOW[0]: 'w', WINDOW[1]: 'v', WINDOW[2]: 'V',
    TOWER: 'T', TOWER_LIT: 't', TOWER_DARK: 'Y', TOWER_DECK: 'D',
    LEDGE: ';', LEDGE_LIT: '_', LEDGE_MID: '/', LEDGE_SEAM: '|',
    GLOW: 'o', GLOW_CORE: 'Q', '#2f2748': 'y',
    '#5a3960': 'c', '#a9555b': 'C', '#2c2a56': 'c', '#5b3a5f': 'C',
    '#633a5e': 'c', '#b45a58': 'C', '#7a425a': 'c', '#cf6f56': 'C',
    '#3c3358': 'c', '#8a4a55': 'C', '#4a3558': 'c', '#a0525a': 'C',
    '#5c3a5c': 'c', '#b4595a': 'C',
    '#5e8f7d': 'p', '#4d7f70': 'P', '#6fa08c': 'q',
    '#2b2445': 'z', '#8a5560': 'u', '#a86a72': 'U', '#241f3c': 'e',
    CAT_GINGER[0]: 'g', CAT_GINGER[1]: 'G', CAT_GINGER[2]: 'h', CAT_GINGER[3]: 'k',
    CAT_DARK[0]: 'd', CAT_DARK[1]: 'D', CAT_DARK[2]: 'L', CAT_DARK[3]: 'K',
    CAT_CREAM[0]: 'n', CAT_CREAM[1]: 'N', CAT_CREAM[2]: 'M', CAT_CREAM[3]: 'j',
    FAR: 'f', FAR_TOP: 'F', MID: 'i', MID_TOP: 'I',
    NEAR: 'r', NEAR_TOP: 'R', WALL: 's', WALL_TOP: 'S', WALL_LIT: 'l',
})
KEY.update(dict(zip(DUSK, ' .,-=+*~^%&$#@!')))


def sun(canvas, cx, cy, radius, stripes=True):
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            distance = sqrt(dx * dx + dy * dy)
            if distance > radius:
                continue
            ring = 3 if distance > radius - 2 else 2 if distance > radius - 5 else 1 if distance > radius - 10 else 0
            canvas.px(cx + dx, cy + dy, SUN[ring])
    if stripes:
        for offset in range(2, radius, 4):
            canvas.erase(cx - radius - 1, cy + offset, radius * 2 + 3, 2)


def tower(canvas, cx, base, top, half):
    def span_at(y):
        t = max(0.0, (y - top) / (base - top))
        return 1 + round(half * t ** 1.5)
    for y in range(top, base):
        span = span_at(y)
        canvas.rect(cx - span, y, span * 2 + 1, 1, TOWER)
        canvas.px(cx - span, y, TOWER_LIT)
        canvas.px(cx + span, y, TOWER_DARK)
        if (y - top) % 6 in (0, 1):
            canvas.rect(cx - span, y, span * 2 + 1, 1, TOWER_DARK)
    canvas.rect(cx - 1, top - 7, 3, 8, TOWER_LIT)
    for deck_y, extra in ((base - 30, 3), (base - 18, 4)):
        span = span_at(deck_y)
        canvas.rect(cx - span - extra, deck_y, (span + extra) * 2 + 1, 2, TOWER_DECK)


def ears(canvas, x, y, colors):
    body, shade = colors[0], colors[1]
    canvas.triangle(x, y, 6, 6, body)
    canvas.triangle(x + 9, y, 6, 6, body, flip=True)
    canvas.triangle(x + 2, y + 2, 4, 4, shade)
    canvas.triangle(x + 10, y + 2, 4, 4, shade, flip=True)


def cat_loaf(canvas, x, y, colors):
    """A cat lying down with its head up and its tail curled forwards."""
    body, shade, light, dark = colors
    canvas.blob(x, y + 8, 27, 10, body, dark)
    canvas.oval(x + 2, y + 8, 23, 4, light)
    canvas.oval(x + 1, y + 15, 25, 3, shade)
    ears(canvas, x + 18, y - 4, colors)
    canvas.blob(x + 18, y + 2, 14, 13, body, dark)
    canvas.rect(x + 21, y + 7, 4, 1, dark)
    canvas.rect(x + 28, y + 7, 4, 1, dark)
    canvas.rect(x + 25, y + 10, 4, 1, shade)
    canvas.oval(x - 8, y + 15, 12, 5, body)
    canvas.oval(x - 8, y + 15, 12, 2, light)


def cat_curl(canvas, x, y, colors):
    """A sleeping cat, nose tucked towards its own tail."""
    body, shade, light, dark = colors
    canvas.blob(x, y + 4, 31, 12, body, dark)
    canvas.oval(x + 3, y + 4, 25, 4, light)
    canvas.oval(x, y + 14, 30, 4, shade)
    ears(canvas, x + 20, y - 2, colors)
    canvas.blob(x + 20, y + 3, 13, 12, body, dark)
    canvas.rect(x + 22, y + 8, 4, 1, dark)
    canvas.rect(x + 28, y + 8, 3, 1, dark)
    canvas.rect(x + 26, y + 11, 4, 1, shade)


def cat_stretch(canvas, x, y, colors):
    """A cat stretched out flat, front paws reaching over the edge."""
    body, shade, light, dark = colors
    canvas.blob(x, y + 7, 34, 9, body, dark)
    canvas.oval(x + 3, y + 7, 28, 3, light)
    canvas.oval(x + 2, y + 13, 30, 3, shade)
    ears(canvas, x + 28, y - 1, colors)
    canvas.blob(x + 27, y + 3, 13, 12, body, dark)
    canvas.rect(x + 29, y + 8, 4, 1, dark)
    canvas.rect(x + 35, y + 8, 3, 1, dark)
    canvas.rect(x + 30, y + 15, 11, 3, body)
    canvas.rect(x + 30, y + 17, 11, 1, dark)
    canvas.oval(x - 6, y + 2, 9, 4, body)
    canvas.rect(x - 8, y + 2, 3, 10, body)


def cat_sit(canvas, x, y, colors):
    """An alert cat sitting upright, facing right."""
    body, shade, light, dark = colors
    canvas.blob(x, y + 9, 17, 12, body, dark)
    canvas.blob(x + 5, y + 6, 13, 15, body, dark)
    ears(canvas, x + 6, y - 3, colors)
    canvas.blob(x + 6, y + 1, 14, 13, body, dark)
    canvas.rect(x + 9, y + 7, 4, 1, dark)
    canvas.rect(x + 15, y + 7, 4, 1, dark)
    canvas.rect(x + 12, y + 10, 4, 1, shade)
    canvas.rect(x + 5, y + 11, 4, 6, light)
    canvas.rect(x + 9, y + 18, 4, 3, body)
    canvas.rect(x + 14, y + 18, 4, 3, body)
    canvas.rect(x + 12, y + 20, 12, 3, body)
    canvas.rect(x + 12, y + 22, 12, 1, dark)
    canvas.rect(x + 16, y + 12, 3, 8, light)


def perched():
    canvas = Canvas(30, 28)
    cat_sit(canvas, 3, 3, CAT_GINGER)
    canvas.save('pixel-cats-perched.svg', 'A pixel cat sitting above the Anon wordmark')


def drift(canvas, x, y, w, h, shade, lit):
    """A long flat-bottomed cloud that reads at backdrop scale."""
    canvas.oval(x, y, w, h, shade)
    canvas.oval(x + w // 5, y - h // 2, w // 2, h, shade)
    canvas.oval(x + w // 2, y - h // 3, w // 3, h, shade)
    canvas.rect(x + 2, y + h - 2, w - 4, 2, lit)


def city_layer(canvas, seed, base, low, high, colour, top, odds=0.0, tallest_odds=0.15):
    rng = Random(seed)
    x = -20
    while x < canvas.width:
        width = rng.choice([26, 34, 42, 56, 70, 88])
        height = rng.randint(low, high)
        if rng.random() < tallest_odds:
            height = high + rng.randint(10, 46)
        roof = base - height
        canvas.rect(x, roof, width, height, colour)
        canvas.rect(x, roof, width, 2, top)
        if odds:
            for wy in range(roof + 8, base - 8, 12):
                for wx in range(x + 6, x + width - 6, 12):
                    if rng.random() < odds:
                        canvas.rect(wx, wy, 4, 6, rng.choice(WINDOW))
        x += width + rng.choice([0, 2, 4, 8])


def wall(canvas, y):
    canvas.rect(0, y, canvas.width, 3, WALL_LIT)
    canvas.rect(0, y + 3, canvas.width, 2, WALL_TOP)
    canvas.rect(0, y + 5, canvas.width, canvas.height - y - 5, WALL)
    for x in range(24, canvas.width, 96):
        canvas.rect(x, y + 6, 2, canvas.height - y - 6, '#151129')


def bird(canvas, x, y, colour):
    canvas.rect(x + 1, y, 2, 1, colour)
    canvas.px(x, y + 1, colour)
    canvas.px(x + 3, y + 1, colour)


def mast(canvas, x, base, top):
    canvas.rect(x, top, 5, base - top, NEAR)
    canvas.rect(x, top, 2, base - top, MID_TOP)
    for arm in range(5):
        y = top + 10 + arm * 16
        canvas.rect(x - 20, y, 45, 2, NEAR)
        canvas.rect(x - 12, y - 9, 29, 2, NEAR)


def cable(canvas, x1, x2, y, sag, colour):
    for x in range(x1, x2 + 1):
        t = (x - x1) / max(1, x2 - x1)
        canvas.px(x, y + round(sag * 4 * t * (1 - t)), colour)


def planter(canvas, x, y, tall=False):
    """A potted plant sized for the backdrop."""
    reach = 26 if tall else 16
    canvas.oval(x + 2, y - reach, 16, reach + 4, '#4d7f70')
    canvas.oval(x + 12, y - reach - 6, 16, reach + 8, '#5e8f7d')
    canvas.oval(x + 6, y - reach + 4, 14, reach, '#6fa08c')
    canvas.rect(x - 2, y, 26, 4, '#2b2445')
    canvas.rect(x, y + 4, 22, 13, '#8a5560')
    canvas.rect(x, y + 4, 22, 3, '#a86a72')
    canvas.rect(x + 4, y + 17, 14, 2, '#241f3c')


def lantern(canvas, x, y, scale=1):
    """A paper lantern hanging from a cable."""
    w, h = 20 * scale, 26 * scale
    canvas.rect(x + w // 2, y - 22 * scale, 2, 22 * scale, NEAR)
    canvas.rect(x, y, w, h, GLOW)
    canvas.rect(x + 2, y + 2, w - 4, h - 4, GLOW_CORE)
    canvas.rect(x - 3, y - 4, w + 6, 5, '#2f2748')
    canvas.rect(x - 3, y + h, w + 6, 4, '#2f2748')


WALL_TOP = 430
ROOF_LINE = 410

WIDE_CATS = [(cat_sit, 30, ROOF_LINE - 1, CAT_GINGER),
             (cat_loaf, 116, ROOF_LINE - 6, CAT_DARK),
             (cat_curl, 292, ROOF_LINE - 5, CAT_CREAM),
             (cat_stretch, 392, ROOF_LINE - 5, CAT_DARK),
             (cat_sit, 636, ROOF_LINE - 1, CAT_GINGER)]
TALL_CATS = [(cat_loaf, 26, ROOF_LINE - 6, CAT_GINGER),
             (cat_curl, 148, ROOF_LINE - 5, CAT_DARK),
             (cat_sit, 274, ROOF_LINE - 1, CAT_GINGER)]


def backdrop(canvas, sun_x, seed, cats, scale=1.0):
    """A full-viewport scene that sits behind live UI at every size."""
    canvas.paint_sky(DUSK, 20)
    sun(canvas, sun_x, 296, round(74 * scale))
    drift(canvas, 24, 118, round(248 * scale), 22, '#3c3358', '#8a4a55')
    drift(canvas, canvas.width - 226, 158, 196, 18, '#4a3558', '#a0525a')
    drift(canvas, 96, 214, round(300 * scale), 20, '#5c3a5c', '#b4595a')
    drift(canvas, sun_x - round(168 * scale), 248, 210, 16, '#7a425a', '#cf6f56')
    city_layer(canvas, seed, 350, 26, 66, FAR, FAR_TOP, tallest_odds=0.22)
    city_layer(canvas, seed + 1, 402, 34, 88, MID, MID_TOP, odds=0.07)
    city_layer(canvas, seed + 2, 452, 40, 112, NEAR, NEAR_TOP, odds=0.16)
    tower(canvas, round(canvas.width * 0.15), WALL_TOP, 126, 30)
    mast_at = round(canvas.width * 0.66)
    mast(canvas, mast_at, WALL_TOP, 236)
    for offset in (0, 7, 14):
        cable(canvas, mast_at + 2, canvas.width - 24, 234 + offset, 8, NEAR)
    for x, y in [(112, 96), (138, 82), (388, 132), (410, 120), (604, 74)]:
        bird(canvas, x, y, MID)
    wall(canvas, WALL_TOP)
    for draw, x, y, palette in cats:
        draw(canvas, x, y, palette)
    planter(canvas, round(canvas.width * 0.33), WALL_TOP, tall=True)
    planter(canvas, round(canvas.width * 0.92), WALL_TOP)
    lantern(canvas, mast_at - 26, 306)


if __name__ == '__main__':
    import sys
    if '--ascii' in sys.argv:
        show = Canvas(720, 500)
        backdrop(show, 470, 11, WIDE_CATS)
        show.preview(step=8)
    elif '--ascii-mobile' in sys.argv:
        show = Canvas(360, 500)
        backdrop(show, 180, 4, TALL_CATS, scale=0.86)
        show.preview(step=6)
    elif '--cats' in sys.argv:
        for name, draw, x, y in [('stretch', cat_stretch, 14, 5),
                                 ('loaf', cat_loaf, 14, 5),
                                 ('curl', cat_curl, 14, 5),
                                 ('sit', cat_sit, 3, 4)]:
            print(f'--- {name} ---')
            small = Canvas(58, 28)
            draw(small, x, y, CAT_GINGER)
            small.preview(step=1)
    else:
        wide = Canvas(720, 500)
        backdrop(wide, 470, 11, WIDE_CATS)
        wide.save('backdrop-cats.svg',
                  'Pixel cats on a Tokyo rooftop at sunset')
        tall = Canvas(360, 500)
        backdrop(tall, 180, 4, TALL_CATS, scale=0.86)
        tall.save('backdrop-cats-mobile.svg',
                  'Pixel cats on a Tokyo rooftop at sunset, tall crop')
        perched()
