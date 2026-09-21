"""Draw original ASCII art on a fixed grid, without browser font dependencies."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "public"
# Each glyph occupies the same 10 x 18 cell. Paths preserve the character-art
# style while avoiding line centering, font fallback, ligatures, and wrapping.
GLYPHS = {
    "-": "M2 9H8", "_": "M1 16H9", "|": "M5 2V16",
    "/": "M9 2L1 16", "\\": "M1 2L9 16",
    "(": "M8 2Q1 4 1 9T8 16", ")": "M2 2Q9 4 9 9T2 16",
    "'": "M5 2V5", ".": "M5 15V16",
    "o": "M5 6C0 6 0 14 5 14S10 6 5 6Z",
    ":": "M5 6V7M5 12V13",
}
ART = {
    "sunflower-side": [
        "                        _",
        "                    _.-/ /-.",
        "                 .-'  / /   \\",
        "                /  __/ /  .-.\\",
        "               /.-'   /  /:::|",
        "              (______/  /::::|",
        "             /      /  |:::::|",
        "             \\_____/   |:::::|",
        "              /    \\   |:::::|",
        "              \\____/\\   \\::::|",
        "                  /  \\   \\::/",
        "                  \\___\\___)/",
        "                 /   \\_\\_.'",
        "      ____      /",
        "     /    '-.  /",
        "     \\____   \\/",
        "          '--./    __",
        "             /_.--' /",
        "            /______/'",
        "           /",
        "          /",
    ],
    "dino": [
        "                          __",
        "                         / o)",
        "                        /  /",
        "        __      _______/  /",
        "       /  \\____/         /",
        "      /                 /",
        "      \\____      ______/",
        "           |    | |   |",
        "           |____| |___|",
        "",
        "   .  .       .      .      .  .",
    ],
    "flower": [
        "          .-.",
        "      .--(   )--.",
        "     (    \\ /    )",
        "      '---(o)---'",
        "     (    / \\    )",
        "      '--(   )--'",
        "          '-'",
        "           |",
        "      __   |   __",
        "     /  \\  |  /  \\",
        "     \\___\\ | /___/",
        "          \\|/",
        "           |",
        "        ___|___",
    ],
}


def build(name, rows):
    # Trim shared indentation so the image, not each text row, is centered.
    indent = min(len(row) - len(row.lstrip()) for row in rows if row.strip())
    rows = [row[indent:].rstrip() for row in rows]
    width, height = max(map(len, rows)) * 10 + 16, len(rows) * 18 + 16
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" fill="none" stroke="#c5d4a7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">']
    for y, row in enumerate(rows):
        for x, glyph in enumerate(row):
            if glyph == " ":
                continue
            if glyph not in GLYPHS:
                raise ValueError(f"Unknown glyph: {glyph!r}")
            parts.append(f'<path transform="translate({x * 10 + 8} {y * 18 + 8})" d="{GLYPHS[glyph]}"/>')
    parts.append('</svg>')
    (ROOT / f"ascii-{name}.svg").write_text("\n".join(parts) + "\n")
    print(f"ascii-{name}.svg: {width} × {height}")


if __name__ == "__main__":
    for name, rows in ART.items():
        build(name, rows)
