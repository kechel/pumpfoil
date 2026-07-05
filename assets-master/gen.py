"""Pumpfoil-Logo-Generator — EINE Basis, beliebige Varianten.

Erzeugt aus der Basis (base/waves.svg + base/lockup-text-{theme}.png) alle Logo-
Varianten fuer Web, Stores, Uhren etc.: 3 Typen x 2 Themes, jede Groesse, mit
parametrisierbarem Padding/Zoom/Offset. Inhalt wird per Default zentriert.

3 Typen:
  icon        Kachel (Rounded Square) + Wellen        (App-/Favicon/Avatar)
  stacked     Wellen OBEN, darunter pumpfoil.org+Tagline
  horizontal  Wellen LINKS, daneben pumpfoil.org+Tagline

2 Themes:
  dark   fuer dunkle Flaechen  -> heller Inhalt (weisse Wellen/Text, cyan .org)
  light  fuer helle Flaechen   -> dunkler Inhalt (navy Text), cyan Wellen/.org

Farben (docs/BRAND.md, KEINE Verlaeufe): Cyan #22d3ee ueberall identisch.

Beispiele:
  python gen.py --type horizontal --theme dark --size 1200x400 --out x.png
  python gen.py --type stacked --theme light --size 1024x1024 --content-width 300 --out y.png
  python gen.py --type icon --theme light --size 512 --out icon.png
  python gen.py --type icon --theme dark --size 512 --pad 0 --out icon-dark.png
"""
from __future__ import annotations

import argparse
import io
import re
from pathlib import Path

import numpy as np
import cairosvg
from PIL import Image

BASE = Path(__file__).resolve().parent / "base"
CYAN = "#22d3ee"      # Brand-Cyan (Wellen, .org) — ueberall identisch
NAVY = "#020617"      # dunkler Hintergrund / Kachel-Dark
WHITE = "#ffffff"
GREY = "#94a3b8"      # Tagline


def _hex(c: str):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def render_waves(color: str, height_px: int) -> Image.Image:
    """Wellen (waves.svg) in `color`, auf `height_px` Hoehe, auf Inhalt zugeschnitten."""
    svg = (BASE / "waves.svg").read_text().replace("currentColor", color)
    # grob rendern, dann auf Zielhoehe skalieren (Aspekt aus dem Inhalt)
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=1600, output_height=1600)
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    im = _trim(im)
    w = max(round(im.width * height_px / im.height), 1)
    return im.resize((w, height_px), Image.LANCZOS)


def load_text(theme: str, tagline: bool = True) -> Image.Image:
    """Textblock (pumpfoil.org [+ Tagline]) transparent, theme-eingefaerbt."""
    im = Image.open(BASE / f"lockup-text-{theme}.png").convert("RGBA")
    im = _trim(im)
    if tagline:
        return im
    # nur die Wortmarke-Zeile: obere Zeile bis zur Luecke vor der Tagline
    a = np.array(im); rows = np.where(a[:, :, 3].max(axis=1) > 40)[0]
    if rows.size:
        # groesste vertikale Luecke finden -> Trenner zwischen Wortmarke und Tagline
        present = a[:, :, 3].max(axis=1) > 40
        gaps = []
        run = 0
        for y in range(len(present)):
            if not present[y]:
                run += 1
            else:
                if run > 0:
                    gaps.append((run, y - run, y))
                run = 0
        big = [g for g in gaps if g[1] > len(present) * 0.35]
        if big:
            cut = max(big)[1]
            im = im.crop((0, 0, im.width, cut))
    return _trim(im)


def _trim(im: Image.Image) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    ys, xs = np.where(a[:, :, 3] > 8)
    if not len(xs):
        return im
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def rounded_tile(size: int, color: str, radius_frac: float = 0.22) -> Image.Image:
    from PIL import ImageDraw
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(size * radius_frac)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=_hex(color))
    return im


# ---- Content-Builder (liefern eng zugeschnittenen Inhalt) --------------------

def content_icon(theme: str, tile_px: int = 1024) -> Image.Image:
    # dark: navy Kachel + cyan Wellen | light: cyan Kachel + weisse Wellen
    tile_col, wave_col = (NAVY, CYAN) if theme == "dark" else (CYAN, WHITE)
    tile = rounded_tile(tile_px, tile_col)
    waves = render_waves(wave_col, int(tile_px * 0.42))
    tile.alpha_composite(waves, ((tile_px - waves.width) // 2, (tile_px - waves.height) // 2))
    return tile


def content_stacked(theme: str, tagline: bool = True) -> Image.Image:
    text = load_text(theme, tagline)
    tw, th = text.size
    waves = render_waves(CYAN, int(th * 0.62))
    gap = int(th * 0.10)
    W = max(tw, waves.width); H = waves.height + gap + th
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(waves, ((W - waves.width) // 2, 0))
    c.alpha_composite(text, ((W - tw) // 2, waves.height + gap))
    return _trim(c)


def content_horizontal(theme: str, tagline: bool = True) -> Image.Image:
    text = load_text(theme, tagline)
    tw, th = text.size
    waves = render_waves(CYAN, int(th * 0.66))
    gap = int(th * 0.17)
    W = waves.width + gap + tw; H = max(waves.height, th)
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(waves, (0, (H - waves.height) // 2))
    c.alpha_composite(text, (waves.width + gap, (H - th) // 2))
    return _trim(c)


# ---- Platzierung auf Canvas --------------------------------------------------

def place(content: Image.Image, cw: int, ch: int, *, content_w=None, content_h=None,
          zoom=None, pad=None, offset=(0, 0), bg="transparent") -> Image.Image:
    """content mittig (+optional offset) auf cw x ch, skaliert nach content_w/h/zoom/pad."""
    scale = None
    if content_w:
        scale = content_w / content.width
    elif content_h:
        scale = content_h / content.height
    elif zoom:
        scale = zoom * min(cw / content.width, ch / content.height)
    else:
        p = 0.12 if pad is None else pad
        avail_w, avail_h = cw * (1 - 2 * p), ch * (1 - 2 * p)
        scale = min(avail_w / content.width, avail_h / content.height)
    cont = content.resize((max(round(content.width * scale), 1),
                           max(round(content.height * scale), 1)), Image.LANCZOS)
    bgcol = (0, 0, 0, 0) if bg == "transparent" else _hex(
        {"dark": NAVY, "cyan": CYAN, "white": "#ffffff", "navy": NAVY}.get(bg, bg))
    canvas = Image.new("RGBA", (cw, ch), bgcol)
    x = (cw - cont.width) // 2 + offset[0]
    y = (ch - cont.height) // 2 + offset[1]
    canvas.alpha_composite(cont, (x, y))
    return canvas


def build(type_: str, theme: str, size: tuple[int, int], *, tagline=True, **place_kw) -> Image.Image:
    cw, ch = size
    if type_ == "icon":
        # Icon-Kachel fuellt (per Default) das ganze Canvas; pad steuert Rand.
        pad = place_kw.pop("pad", 0.0)
        tile = content_icon(theme, tile_px=max(cw, ch))
        return place(tile, cw, ch, pad=pad if pad else 0.0, bg=place_kw.pop("bg", "transparent"),
                     **{k: v for k, v in place_kw.items() if k in ("offset", "content_w", "content_h", "zoom")})
    content = content_stacked(theme, tagline) if type_ == "stacked" else content_horizontal(theme, tagline)
    return place(content, cw, ch, **place_kw)


def _parse_size(s: str):
    if "x" in s.lower():
        w, h = re.split("[xX]", s); return int(w), int(h)
    return int(s), int(s)


def main():
    ap = argparse.ArgumentParser(description="Pumpfoil-Logo-Generator")
    ap.add_argument("--type", required=True, choices=["icon", "stacked", "horizontal"])
    ap.add_argument("--theme", required=True, choices=["light", "dark"])
    ap.add_argument("--size", required=True, help="WxH oder N (quadratisch)")
    ap.add_argument("--content-width", type=int)
    ap.add_argument("--content-height", type=int)
    ap.add_argument("--zoom", type=float, help="Anteil des Canvas (0..1), zentriert")
    ap.add_argument("--pad", type=float, help="Rand als Anteil (0..0.5), Default 0.12 (icon 0)")
    ap.add_argument("--offset", default="0,0", help="dx,dy in px")
    ap.add_argument("--bg", default="transparent", help="transparent|dark|cyan|white|#hex")
    ap.add_argument("--no-tagline", action="store_true")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    ox, oy = (int(v) for v in a.offset.split(","))
    kw = dict(offset=(ox, oy), bg=a.bg)
    if a.content_width: kw["content_w"] = a.content_width
    if a.content_height: kw["content_h"] = a.content_height
    if a.zoom: kw["zoom"] = a.zoom
    if a.pad is not None: kw["pad"] = a.pad
    img = build(a.type, a.theme, _parse_size(a.size), tagline=not a.no_tagline, **kw)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    img.save(a.out)
    print(f"{a.out}  {img.size}  type={a.type} theme={a.theme}")


if __name__ == "__main__":
    main()
