#!/usr/bin/env python3
"""Original, static flat-colour backdrop for the Sand appearance. No deps."""
from collections import Counter, defaultdict
from math import sqrt
from pathlib import Path
from random import Random

OUT = Path(__file__).resolve().parents[1] / 'public'

WIDTH, HEIGHT = 1440, 1000

# Flat colours only: no gradients, filters, opacity tricks, or external files.
BASE = '#1d1710'
BANDS = ['#2a2114', '#3a2d1a', '#4d3b21', '#63502c']
DARK = '#16110b'
SUN = '#d9b877'
CLOUD = '#7a5c3a'
FLORA = '#4a5c3a'

# Layout: quiet sky on top, calm dune band where report text sits, detail below.
SKY_BOTTOM = 220
BAND_TOP, BAND_BOTTOM = 300, 760
SEED = 20261009


class Canvas:
    """A flat pixel grid. Empty cells stay None so the base rect shows through."""

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

    def erase(self, x, y, w, h):
        """Clear back to BASE, which the full-bleed rect already painted."""
        self.rect(x, y, w, h, None)

    def preview(self, step=16, box=None):
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
            f' width="{self.width}" height="{self.height}" shape-rendering="crispEdges"'
            ' role="img" aria-labelledby="title">',
            f'<rect width="{self.width}" height="{self.height}" fill="{BASE}"/>',
            f'<title id="title">{title}</title>',
            *parts, '</svg>', ''])
        (OUT / name).write_text(svg)


# Preview glyphs: '.' is bare base, then darker sand to denser silhouettes.
KEY = dict(zip(BANDS, ':=+*'))
KEY.update({DARK: '#', SUN: 'O', CLOUD: '~', FLORA: 'Y'})


def smooth(t):
    return t * t * (3 - 2 * t)


def crest(points, x):
    """Piecewise-smooth ridge height, so filled crests stay soft but crisp."""
    if x <= points[0][0]:
        return float(points[0][1])
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * smooth((x - x0) / (x1 - x0))
    return float(points[-1][1])


def ridge(canvas, points, color):
    """Fill a whole dune band from its crest line down to the bottom edge."""
    for x in range(canvas.width):
        top = int(round(crest(points, x)))
        canvas.rect(x, top, 1, canvas.height - top, color)


def sun(canvas, cx, cy, radius):
    """A pale disc, cut by flat stripes through its lower half."""
    for dy in range(-radius, radius + 1):
        span = int(sqrt(max(0.0, radius * radius - dy * dy)))
        canvas.rect(cx - span, cy + dy, span * 2 + 1, 1, SUN)
    for offset in (radius // 6, radius // 3, radius // 2):
        canvas.erase(cx - radius - 2, cy + offset, radius * 2 + 5, 5)


def clouds(canvas, seed):
    """Thin flat bars: one inside the quiet top, the rest above the text band."""
    rng = Random(seed)
    for x, y, w, h in ((1014, SKY_BOTTOM - 44, 206, 3), (1288, SKY_BOTTOM + 12, 132, 3),
                       (148, SKY_BOTTOM + 26, 238, 4), (524, SKY_BOTTOM + 48, 176, 3),
                       (912, SKY_BOTTOM + 32, 148, 3), (300, SKY_BOTTOM + 72, 120, 2)):
        canvas.rect(x, y, w, h, CLOUD)
        canvas.rect(x + rng.randint(6, 18), y + h + 2,
                    w // 2, 2 if h > 2 else 1, CLOUD)


def cactus(canvas, x, base, height, color=FLORA):
    """A saguaro: one ribbed column with two elbows, kept flat and crisp."""
    trunk, top = 13, base - height
    canvas.rect(x, top, trunk, height, color)
    for side in (-1, 1):
        drop = 18 if side < 0 else 44
        arm_top = top + drop
        arm_h = max(20, height // 2 - drop)
        ax = x - 14 if side < 0 else x + trunk + 1
        canvas.rect(ax, arm_top, 11, arm_h, color)
        left, right = min(x, ax), max(x + trunk, ax + 11)
        canvas.rect(left, arm_top + arm_h - 10, right - left, 10, color)


def grass(canvas, x, base, blades, seed, color=FLORA):
    """A dry tuft: thin blades fanning out of one root at the dune floor."""
    rng = Random(seed)
    for _ in range(blades):
        height = rng.randint(18, 48)
        lean = rng.choice((-3, -2, -1, 0, 1, 2, 3))
        root = x + rng.randint(-8, 8)
        for step in range(height):
            canvas.px(root + round(lean * step / height), base - step, color)


def ripples(canvas, seed, upper, lower, colors, count, max_len, x0=0, x1=WIDTH):
    """Sparse wind lines, drawn only on the band that is visible at that x."""
    rng = Random(seed)
    for _ in range(count):
        x = rng.randint(x0, max(x0, x1 - max_len))
        length, y = rng.randint(10, max_len), rng.randint(520, HEIGHT - 4)
        if any(not (crest(upper, px) + 5 <= y <= crest(lower, px) - 3)
               for px in (x, x + length)):
            continue
        canvas.rect(x, y, length, 1 if rng.random() < 0.7 else 2, rng.choice(colors))


def stones(canvas, seed, y0, y1, count, colors):
    """Half-buried stones, so the near dune does not read as a flat slab."""
    rng = Random(seed)
    for _ in range(count):
        width = rng.randint(8, 26)
        canvas.oval(rng.randint(0, canvas.width - width), rng.randint(y0, y1),
                    width, max(3, width // 2), rng.choice(colors))


def highlight(canvas, points, color, step=9, inset=0):
    """A thin lit edge riding along a crest, so bands read as separate dunes."""
    for x in range(0, canvas.width, step):
        top = int(round(crest(points, x))) + inset
        canvas.rect(x, top, step, 2, color)


# Crest lines run left to right; the horizon sags on the right so the sun sets
# into open sky while the dune mass stays stacked over the left and middle.
FAR = [(-60, 588), (160, 552), (340, 592), (540, 544), (720, 598), (860, 650),
       (900, 700), (940, 800), (980, 878), (1060, 906), (1300, 910), (1500, 898)]
MID_A = [(-60, 646), (180, 612), (360, 652), (560, 606), (740, 660), (880, 712),
         (930, 790), (990, 880), (1080, 916), (1300, 920), (1500, 908)]
MID_B = [(-60, 706), (140, 668), (300, 712), (500, 662), (660, 716), (800, 770),
         (880, 830), (950, 896), (1040, 930), (1200, 934), (1500, 918)]
LIT = [(-60, 790), (120, 772), (280, 800), (460, 772), (620, 812), (760, 858),
       (840, 900), (920, 940), (1020, 952), (1200, 956), (1500, 938)]
SHADE = [(-60, 822), (150, 796), (300, 832), (480, 866), (620, 892), (760, 908),
         (900, 918), (1100, 922), (1300, 924), (1500, 918)]
FORE = [(-60, 886), (150, 862), (300, 896), (480, 924), (620, 944), (760, 956),
        (900, 962), (1100, 966), (1300, 968), (1500, 962)]
BELOW = [(0, HEIGHT + 40)]


def flora(canvas):
    """Sparse cacti and dry grass, hugging the two outer edges only."""
    cactus(canvas, 92, 968, 134)
    cactus(canvas, 198, 980, 96)
    cactus(canvas, 1268, 972, 126)
    cactus(canvas, 1372, 982, 88)
    for index, (x, base, blades) in enumerate(((40, 962, 9), (148, 974, 11),
                                               (232, 968, 8), (58, 994, 10),
                                               (1218, 970, 8), (1326, 984, 11),
                                               (1412, 966, 9), (1248, 996, 7))):
        grass(canvas, x, base, blades, SEED + index)


def paint_sand(canvas):
    """Layer order: sun first, then the dunes that swallow its lower half."""
    sun(canvas, 1046, BAND_BOTTOM + 84 + 6, 84)
    clouds(canvas, SEED)
    for points, color in ((FAR, BANDS[0]), (MID_A, BANDS[1]),
                          (MID_B, BANDS[2]), (LIT, BANDS[3])):
        ridge(canvas, points, color)
    highlight(canvas, LIT, CLOUD, step=13)
    ridge(canvas, SHADE, BANDS[0])
    highlight(canvas, SHADE, BANDS[2], step=11)
    ridge(canvas, FORE, DARK)
    highlight(canvas, FORE, BANDS[1], step=15)
    stones(canvas, SEED + 61, 912, 986, 26, [BANDS[1], BANDS[2]])
    flora(canvas)
    ripples(canvas, SEED + 47, LIT, SHADE, [CLOUD], 40, 96, 0, 1000)
    ripples(canvas, SEED + 31, SHADE, FORE, [BANDS[2]], 40, 120)
    ripples(canvas, SEED + 73, FORE, BELOW, [BANDS[1], BANDS[2]], 80, 132)


if __name__ == '__main__':
    import sys
    if '--ascii' in sys.argv:
        show = Canvas(WIDTH, HEIGHT)
        paint_sand(show)
        show.preview(step=16)
    else:
        sheet = Canvas(WIDTH, HEIGHT)
        paint_sand(sheet)
        sheet.save('backdrop-sand.svg',
                   'A warm desert at golden hour, drawn as flat pixel bands')
