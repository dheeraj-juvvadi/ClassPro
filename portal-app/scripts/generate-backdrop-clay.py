#!/usr/bin/env python3
"""Original, static flat-colour backdrop for the Clay appearance. No deps."""
from collections import Counter, defaultdict
from math import sqrt
from pathlib import Path
from random import Random

OUT = Path(__file__).resolve().parents[1] / 'public'

WIDTH, HEIGHT = 1440, 1000

# Flat colours only: no gradients, filters, external files, or animation.
BASE = '#1c1310'
WALL_D = '#2b1c17'
WALL = '#3d2620'
SMOKE = '#4a332b'
MOUTH = '#120c0a'
WOOD = '#54382c'
POT_1, POT_2, POT_3 = '#6b3f30', '#8f5340', '#b06a4d'
RIM = '#c07d5c'
GLOW, CORE = '#e0a05a', '#f6cf94'
POTS = (POT_1, POT_2, POT_3)

# Layout: quiet sky on top, calm wall band where report text sits, detail below.
SKY_BOTTOM = 220
BAND_TOP, BAND_BOTTOM = 300, 760
ARCH_TOP, FLOOR_LINE = 758, 940
SEED = 20261009


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
            span = self.grid[row]
            for col in range(max(0, x), min(self.width, x + w)):
                span[col] = color

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

    def arch(self, x, y, w, h, color):
        """A rounded arch: semicircular head over straight jambs."""
        radius = w / 2
        for row in range(h):
            drop = radius - row
            half = radius if drop <= 0 else sqrt(max(0.0, radius * radius - drop * drop))
            x0, x1 = round(x + radius - half), round(x + radius + half)
            self.rect(x0, y + row, max(1, x1 - x0), 1, color)

    def erase(self, x, y, w, h, color=BASE):
        self.rect(x, y, w, h, color)

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
            f'<title id="title">{title}</title>',
            f'<rect width="{self.width}" height="{self.height}" fill="{BASE}"/>',
            *parts, '</svg>', ''])
        (OUT / name).write_text(svg)


# Preview glyphs: darkest first, so the scene reads as text at 16x16 per char.
KEY = {
    BASE: ' ', WALL_D: ',', WALL: ':', SMOKE: '~', MOUTH: '@', WOOD: 'w',
    POT_1: 'o', POT_2: 'p', POT_3: 'P', RIM: 'r', GLOW: '*', CORE: 'O',
}


def drift(canvas, rng, y, width, thickness=4):
    """A thin horizontal smoke drift, frayed at both ends."""
    x = rng.randint(-60, WIDTH - width + 60)
    canvas.rect(x, y, width, thickness, SMOKE)
    canvas.rect(x + width // 5, y - thickness, width // 2, thickness, SMOKE)
    canvas.rect(x + width // 3, y + thickness, width // 3, thickness, SMOKE)
    canvas.rect(x + width, y - 2 * thickness, width // 4, thickness, SMOKE)


def pot(canvas, x, base, width, height, body, lip=RIM):
    """A tapered terracotta pot standing on `base`."""
    foot = round(width * 0.62)
    for row in range(height):
        span = width - round((width - foot) * (row + 1) / height)
        canvas.rect(x + (width - span) // 2, base - height + row, max(2, span), 1, body)
    head = max(4, width - 2 * (width // 5))
    canvas.rect(x + (width - head) // 2, base - height - 5, head, 6, lip)
    canvas.rect(x + (width - head) // 2 + 2, base - height + 1, head - 4, 3, MOUTH)
    canvas.rect(x + width // 3, base - 4, width - 2 * (width // 3), 4, MOUTH)


def bowl(canvas, x, y, width, height, body, lip=RIM):
    """A shallow bowl whose rim sits on line `y`."""
    for row in range(height):
        inset = round(width * 0.5 * ((row + 1) / height) ** 2)
        canvas.rect(x + inset, y + row, max(1, width - inset * 2), 1, body)
    canvas.rect(x, y, width, 4, lip)
    canvas.rect(x + width // 5, y + 4, width - 2 * (width // 5), 2, MOUTH)


def rack(canvas, x, top, width, height, shelves=2):
    """A wooden drying rack: two posts, a top rail and shelf boards."""
    canvas.rect(x, top, width, 6, WOOD)
    canvas.rect(x + 6, top, 6, height, WOOD)
    canvas.rect(x + width - 12, top, 6, height, WOOD)
    for index in range(1, shelves + 1):
        canvas.rect(x, top + index * height // (shelves + 1), width, 5, WOOD)


def yard(canvas):
    """Back wall of the yard, its courses, and the shaded side edges."""
    canvas.rect(0, SKY_BOTTOM, WIDTH, HEIGHT - SKY_BOTTOM, WALL_D)
    canvas.rect(0, BAND_TOP, WIDTH, BAND_BOTTOM - BAND_TOP, WALL)
    for y in range(BAND_TOP + 92, BAND_BOTTOM, 92):
        canvas.rect(0, y, WIDTH, 3, WALL_D)
    canvas.rect(0, BAND_TOP, 104, HEIGHT - BAND_TOP, WALL_D)
    canvas.rect(WIDTH - 116, BAND_TOP, 116, HEIGHT - BAND_TOP, WALL_D)
    canvas.rect(104, BAND_TOP, 3, BAND_BOTTOM - BAND_TOP, SMOKE)
    canvas.rect(WIDTH - 119, BAND_TOP, 3, BAND_BOTTOM - BAND_TOP, SMOKE)


def sky(canvas, rng):
    """Quiet, near-flat top: only faint darker drifts, never a bright note."""
    for y, width in ((148, 320), (186, 250), (204, 420)):
        x = rng.randint(40, WIDTH - width - 40)
        canvas.rect(x, y, width, 2, WALL_D)



def edges(canvas):
    """Small pottery details hugging the left and right edges."""
    canvas.rect(0, 556, 152, 7, WOOD)
    canvas.rect(0, 563, 13, 28, WOOD)
    pot(canvas, 6, 556, 60, 64, POT_1)
    pot(canvas, 76, 556, 46, 48, POT_2)
    canvas.rect(WIDTH - 160, 612, 160, 7, WOOD)
    canvas.rect(WIDTH - 13, 619, 13, 26, WOOD)
    pot(canvas, WIDTH - 154, 612, 64, 68, POT_2)
    bowl(canvas, WIDTH - 84, 612, 66, 22, POT_1)

def arcade(canvas, gaps):
    """A repeating row of rounded arch mouths along the bottom third."""
    step, width, height = 176, 132, 182
    for index in range(-1, 10):
        x = 18 + index * step
        if any(x < stop and x + width > start for start, stop in gaps):
            continue
        canvas.arch(x - 9, ARCH_TOP - 9, width + 18, height + 9, WALL)
        canvas.arch(x, ARCH_TOP, width, height, MOUTH)
        canvas.rect(x - 9, FLOOR_LINE - 7, width + 18, 7, WALL)
        canvas.rect(x, FLOOR_LINE - 3, width, 3, MOUTH)


def kiln(canvas):
    """The kiln doorway in the lower-left corner, lit against the dusk."""
    centre, base = 186, FLOOR_LINE + 16
    canvas.arch(centre - 168, 598, 336, base - 598, WALL)
    canvas.arch(centre - 156, 610, 312, base - 610, WALL_D)
    canvas.rect(centre - 168, 598, 336, 7, WALL_D)
    canvas.arch(centre - 124, 726, 248, base - 726, WALL)
    canvas.arch(centre - 108, 762, 216, base - 762, GLOW)
    canvas.arch(centre - 72, 800, 144, base - 800, CORE)
    canvas.rect(centre - 108, base - 26, 216, 26, GLOW)
    canvas.rect(centre - 108, base - 10, 216, 10, MOUTH)
    canvas.rect(centre - 140, base, 280, 9, GLOW)


def floor_line(canvas):
    """A lit ledge across the yard with deep shadow beneath it."""
    canvas.rect(0, FLOOR_LINE, WIDTH, 5, WALL)
    canvas.rect(0, FLOOR_LINE + 5, WIDTH, HEIGHT - FLOOR_LINE - 5, WALL_D)
    canvas.rect(0, FLOOR_LINE + 5, WIDTH, 3, MOUTH)


def racks(canvas):
    """Two drying racks along the bottom edge."""
    rack(canvas, 506, 846, 206, 132)
    bowl(canvas, 528, 895, 68, 22, POT_1)
    bowl(canvas, 612, 895, 62, 20, POT_3)
    bowl(canvas, 542, 939, 84, 24, POT_2)
    pot(canvas, 566, 846, 62, 56, POT_2)
    rack(canvas, 1112, 862, 196, 126)
    bowl(canvas, 1132, 909, 64, 20, POT_3)
    bowl(canvas, 1214, 909, 58, 20, POT_1)
    bowl(canvas, 1146, 951, 80, 24, POT_2)


def bottom(canvas):
    """Stacked pots and bowls along the very bottom edge, and edge accents."""
    pot(canvas, -34, 992, 152, 170, POT_1)
    pot(canvas, 0, 988, 64, 70, POT_2)
    bowl(canvas, 206, 958, 90, 34, POT_2)
    bowl(canvas, 302, 966, 72, 26, POT_3)
    pot(canvas, 352, 990, 120, 138, POT_2)
    pot(canvas, 374, 852, 76, 74, POT_1)
    bowl(canvas, 700, 976, 64, 22, POT_2)
    pot(canvas, 756, 994, 130, 150, POT_3)
    bowl(canvas, 884, 970, 92, 28, POT_1)
    pot(canvas, 980, 992, 104, 118, POT_1)
    pot(canvas, 1000, 874, 64, 58, POT_2)
    bowl(canvas, 1250, 980, 70, 22, POT_1)
    pot(canvas, 1326, 996, 142, 164, POT_2)
    bowl(canvas, 1290, 968, 78, 26, POT_3)
    pot(canvas, -12, 862, 96, 112, POT_2)
    bowl(canvas, 1360, 902, 78, 24, POT_1)
    pot(canvas, 1352, 884, 100, 122, POT_1)


def paint(canvas, rng):
    """A potter's yard at dusk: wall first, then detail front to back."""
    yard(canvas)
    sky(canvas, rng)
    for y, width in ((248, 300), (286, 380), (346, 440), (512, 330), (628, 400), (692, 260)):
        drift(canvas, rng, y, width)
    edges(canvas)
    arcade(canvas, ((0, 386),))
    floor_line(canvas)
    kiln(canvas)
    racks(canvas)
    bottom(canvas)


if __name__ == '__main__':
    import sys
    if '--ascii' in sys.argv:
        show = Canvas(WIDTH, HEIGHT)
        paint(show, Random(SEED))
        show.preview(step=16)
    else:
        canvas = Canvas(WIDTH, HEIGHT)
        paint(canvas, Random(SEED))
        canvas.save('backdrop-clay.svg',
                    "A terracotta potter's yard at dusk, lit by a kiln doorway")
