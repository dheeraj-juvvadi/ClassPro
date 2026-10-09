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


class Canvas:
    """A flat pixel grid. Empty cells stay None so later layers can overlap."""

    def __init__(self, width, height):
        self.width, self.height = width, height
        self.grid = [[None] * width for _ in range(height)]

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
        return SKY[min(len(SKY) - 1, max(0, y) // 4)]

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
    '#5e8f7d': 'p', '#4d7f70': 'P', '#6fa08c': 'q',
    '#2b2445': 'z', '#8a5560': 'u', '#a86a72': 'U', '#241f3c': 'e',
    CAT_GINGER[0]: 'g', CAT_GINGER[1]: 'G', CAT_GINGER[2]: 'h', CAT_GINGER[3]: 'k',
    CAT_DARK[0]: 'd', CAT_DARK[1]: 'D', CAT_DARK[2]: 'L', CAT_DARK[3]: 'K',
    CAT_CREAM[0]: 'n', CAT_CREAM[1]: 'N', CAT_CREAM[2]: 'M', CAT_CREAM[3]: 'j',
})


def sky(canvas):
    for index in range(len(SKY)):
        canvas.rect(0, index * 4, canvas.width, 4, SKY[index])
    canvas.rect(0, len(SKY) * 4, canvas.width, canvas.height - len(SKY) * 4, SKY[-1])


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


def cloud(canvas, x, y, width, shade, lit):
    canvas.oval(x, y + 3, width, 4, shade)
    canvas.oval(x + width // 6, y, width // 2, 6, shade)
    canvas.oval(x + width // 2, y + 2, width // 3, 5, shade)
    canvas.oval(x + width // 4, y + 5, width // 2, 2, lit)


def hills(canvas, base):
    canvas.oval(-40, base - 26, 190, 60, HILL)
    canvas.oval(120, base - 16, 240, 44, HILL)
    canvas.oval(430, base - 22, 200, 52, HILL)


def skyline(canvas, seed, base, gap=None, gap_heights=(5, 6, 7, 8)):
    rng = Random(seed)
    x = -4
    while x < canvas.width:
        width = rng.choice([8, 9, 11, 13, 15, 18, 22])
        height = rng.choice([14, 18, 22, 26, 30, 34, 38])
        if gap and x + width > gap[0] and x < gap[1]:
            height = rng.choice(gap_heights)
        top = base - height
        canvas.rect(x, top, width, height, CITY)
        canvas.rect(x, top, width, 1, CITY_TOP)
        canvas.rect(x + width - 1, top, 1, height, CITY_SIDE)
        for wy in range(top + 3, base - 4, 4):
            for wx in range(x + 2, x + width - 2, 4):
                if rng.random() < 0.55:
                    canvas.rect(wx, wy, 2, 2, rng.choice(WINDOW))
        x += width + rng.choice([0, 0, 1, 2, 3])


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


def pylon(canvas, x, base, top):
    canvas.rect(x, top, 3, base - top, CITY_SIDE)
    canvas.rect(x, top, 1, base - top, CITY_TOP)
    for arm in range(4):
        y = top + 3 + arm * 4
        canvas.rect(x - 7, y, 17, 1, CITY_SIDE)
    canvas.rect(x - 4, top + 14, 11, 1, CITY_SIDE)


def wire(canvas, x1, x2, y, sag, color):
    for x in range(x1, x2 + 1):
        t = (x - x1) / max(1, x2 - x1)
        canvas.px(x, y + round(sag * 4 * t * (1 - t)), color)
        canvas.px(x, y + round(sag * 4 * t * (1 - t)) + 1, color)


def ledge(canvas, y):
    canvas.rect(0, y, canvas.width, 1, LEDGE_LIT)
    canvas.rect(0, y + 1, canvas.width, 1, LEDGE_MID)
    canvas.rect(0, y + 2, canvas.width, canvas.height - y - 2, LEDGE)
    for x in range(10, canvas.width, 52):
        canvas.rect(x, y + 3, 1, canvas.height - y - 3, LEDGE_SEAM)


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


def pot_plant(canvas, x, y):
    canvas.oval(x + 1, y - 12, 12, 14, '#5e8f7d')
    canvas.oval(x + 8, y - 16, 12, 18, '#4d7f70')
    canvas.oval(x + 4, y - 9, 10, 11, '#6fa08c')
    canvas.rect(x - 1, y, 18, 3, '#2b2445')
    canvas.rect(x, y + 3, 16, 9, '#8a5560')
    canvas.rect(x, y + 3, 16, 2, '#a86a72')
    canvas.rect(x + 3, y + 12, 10, 1, '#241f3c')


def lantern(canvas, x, y):
    canvas.rect(x + 6, y - 10, 1, 10, CITY_SIDE)
    canvas.rect(x, y, 13, 14, GLOW)
    canvas.rect(x + 1, y + 1, 11, 12, GLOW_CORE)
    canvas.rect(x - 1, y - 2, 15, 3, '#2f2748')
    canvas.rect(x - 1, y + 14, 15, 2, '#2f2748')
    canvas.rect(x + 5, y + 1, 1, 12, '#f2a95e')
    canvas.rect(x + 8, y + 1, 1, 12, '#f2a95e')


def paint_tokyo(canvas):
    sky(canvas)
    sun(canvas, 428, 36, 18)
    cloud(canvas, 18, 20, 84, '#5a3960', '#a9555b')
    cloud(canvas, 146, 8, 66, '#2c2a56', '#5b3a5f')
    cloud(canvas, 256, 28, 88, '#633a5e', '#b45a58')
    cloud(canvas, 384, 16, 58, '#7a425a', '#cf6f56')
    hills(canvas, 58)
    skyline(canvas, 11, 58, (378, 486))
    tower(canvas, 116, 58, 14, 13)
    pylon(canvas, 32, 58, 24)
    pylon(canvas, 244, 58, 28)
    for offset in (0, 4, 8):
        wire(canvas, 33, 245, 24 + offset, 3, CITY_SIDE)
    ledge(canvas, 58)


def desktop():
    canvas = Canvas(560, 72)
    paint_tokyo(canvas)
    cat_stretch(canvas, 52, 41, CAT_CREAM)
    cat_loaf(canvas, 190, 40, CAT_GINGER)
    cat_curl(canvas, 300, 41, CAT_DARK)
    pot_plant(canvas, 486, 44)
    lantern(canvas, 142, 34)
    canvas.save('pixel-cats-desktop.svg',
                'Pixel cats resting on a rooftop above Tokyo at sunset')


def paint_mobile(canvas):
    sky(canvas)
    sun(canvas, 142, 32, 13)
    cloud(canvas, 6, 14, 62, '#5a3960', '#a9555b')
    cloud(canvas, 110, 20, 56, '#633a5e', '#b45a58')
    hills(canvas, 50)
    skyline(canvas, 5, 50, (104, 182), (4, 5, 6, 7))
    tower(canvas, 112, 50, 18, 9)
    pylon(canvas, 178, 50, 24)
    ledge(canvas, 50)


def mobile():
    canvas = Canvas(196, 64)
    paint_mobile(canvas)
    cat_curl(canvas, 10, 33, CAT_DARK)
    cat_loaf(canvas, 54, 32, CAT_GINGER)
    pot_plant(canvas, 148, 36)
    canvas.save('pixel-cats-mobile.svg',
                'A ginger pixel cat and a sleeping blue cat on a Tokyo rooftop at sunset')


def perched():
    canvas = Canvas(30, 28)
    cat_sit(canvas, 3, 3, CAT_GINGER)
    canvas.save('pixel-cats-perched.svg', 'A pixel cat sitting above the Anon wordmark')


if __name__ == '__main__':
    import sys
    if '--ascii' in sys.argv:
        show = Canvas(560, 72)
        paint_tokyo(show)
        show.preview(step=4)
        cat_stretch(show, 52, 41, CAT_CREAM)
        cat_loaf(show, 190, 40, CAT_GINGER)
        cat_curl(show, 300, 41, CAT_DARK)
        pot_plant(show, 486, 44)
        lantern(show, 142, 34)
        show.preview(step=2)
        print('--- mobile ---')
        paint_mobile(show := Canvas(196, 64))
        cat_curl(show, 10, 33, CAT_DARK)
        cat_loaf(show, 54, 32, CAT_GINGER)
        pot_plant(show, 148, 36)
        show.preview(step=2)
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
        desktop()
        mobile()
        perched()
