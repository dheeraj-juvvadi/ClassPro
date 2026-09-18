"""Remove only texture marks fully outside their existing polygon clip.

Run after build-floral-art.py. No source silhouette, visible mark, transform,
color or opacity changes. Unknown path/clip syntax is kept conservatively.
"""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1] / "public"
NS = "{http://www.w3.org/2000/svg}"
ET.register_namespace("", NS[1:-1])
NUMBER = r"[-+]?(?:\d*\.\d+|\d+\.?\d*)"
PATH = re.compile(rf"^M({NUMBER})[ ,]+({NUMBER})l([\d., +\-]+)(?:Z)?$")


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def crossing(a, b, c, d):
    if max(a[0], b[0]) < min(c[0], d[0]) or max(c[0], d[0]) < min(a[0], b[0]):
        return False
    if max(a[1], b[1]) < min(c[1], d[1]) or max(c[1], d[1]) < min(a[1], b[1]):
        return False
    return cross(a, b, c) * cross(a, b, d) <= 0 and cross(c, d, a) * cross(c, d, b) <= 0


def inside(point, polygon):
    x, y = point
    result = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            result = not result
    return result


def overlaps(bounds, polygon):
    x0, y0, x1, y1 = bounds
    box = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    if any(x0 <= x <= x1 and y0 <= y <= y1 for x, y in polygon):
        return True
    if any(inside(p, polygon) for p in box):
        return True
    return any(crossing(a, b, c, d)
               for a, b in zip(box, box[1:] + box[:1])
               for c, d in zip(polygon, polygon[1:] + polygon[:1]))


def bounds(element):
    allowed = {"d", "fill", "opacity", "stroke", "stroke-width"}
    if element.tag != NS + "path" or set(element.attrib) - allowed:
        return None
    match = PATH.fullmatch(element.get("d", ""))
    if not match:
        return None
    x, y = float(match[1]), float(match[2])
    numbers = [float(n) for n in re.findall(NUMBER, match[3])]
    if len(numbers) % 2:
        return None
    points = [(x, y)]
    for dx, dy in zip(numbers[::2], numbers[1::2]):
        x += dx
        y += dy
        points.append((x, y))
    # Keep extra space for strokes, round caps and antialiasing near edges.
    padding = 1 + float(element.get("stroke-width", "1"))
    return (min(p[0] for p in points) - padding, min(p[1] for p in points) - padding,
            max(p[0] for p in points) + padding, max(p[1] for p in points) + padding)


def optimize(path):
    original = path.read_bytes()
    root = ET.fromstring(original)
    clips = {}
    for clip in root.iter(NS + "clipPath"):
        if set(clip.attrib) != {"id"} or len(clip) != 1:
            continue
        polygon = clip[0]
        if polygon.tag == NS + "polygon" and set(polygon.attrib) == {"points"}:
            values = [float(n) for n in re.findall(NUMBER, polygon.get("points"))]
            if len(values) >= 6 and len(values) % 2 == 0:
                clips[f'url(#{clip.get("id")})'] = list(zip(values[::2], values[1::2]))
    removed = 0
    for group in root.iter(NS + "g"):
        if set(group.attrib) != {"clip-path"}:
            continue
        polygon = clips.get(group.get("clip-path"))
        if not polygon:
            continue
        for child in list(group):
            box = bounds(child)
            if box and not overlaps(box, polygon):
                group.remove(child)
                removed += 1
    if removed:
        path.write_bytes(ET.tostring(root, encoding="utf-8"))
    print(f"{path.name}: removed {removed} invisible marks; {len(original)} → {path.stat().st_size} bytes")


if __name__ == "__main__":
    for name in ["floral-screenprint.svg", "floral-mobile.svg"]:
        optimize(ROOT / name)
