"""Optional asset preparation: pip install 'fonttools[woff]'. Not a runtime dependency."""
from pathlib import Path
from fontTools.ttLib import TTFont

public = Path(__file__).resolve().parents[1] / "public"
source = public / "Newsreader.ttf"
target = public / "Newsreader.woff2"
font = TTFont(source, recalcTimestamp=False)
font.flavor = "woff2"
font.save(target)
compressed = TTFont(target)
assert font.getGlyphOrder() == compressed.getGlyphOrder()
assert font.getBestCmap() == compressed.getBestCmap()
assert [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in font["fvar"].axes] == [
    (a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in compressed["fvar"].axes]
print(f"Editorial font: {source.stat().st_size} → {target.stat().st_size} bytes")
