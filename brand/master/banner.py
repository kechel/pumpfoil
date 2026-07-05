#!/usr/bin/env python3
"""YouTube-/Social-Banner (2560x1440) reproduzierbar aus der Brand-Basis.
Horizontales Lockup (kanonische Wellen LINKS + Avenir-Wordmark + Tagline) aus gen.py +
Plattform-Subline, komplett in die YouTube-Safe-Zone (1546x423, „auf allen Geräten sichtbar")
skaliert; auf Navy-Verlauf + dezentem Wellen-Wasserzeichen. Plattform-Subline bewusst unverändert.
Aufruf:  ../../server/.venv/bin/python banner.py   (aus brand/master/)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import gen

W, H = 2560, 1440
OUT = os.path.join(os.path.dirname(__file__), "../social/youtube-banner-2560x1440.png")
SUBLINE = "GARMIN · WEAR OS · APPLE WATCH · POLAR"   # Polar live (AccessLink); COROS/Suunto/iOS/Android erst nach Approval

def _hex(h): h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def gradient():
    c0, c1, c2 = map(_hex, ("#020617", "#061226", "#0a1f3a"))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = ((xx / W) + (yy / H)) / 2.0                      # 0..1 diagonal
    def lerp(a, b, tt): return a + (b - a) * tt
    seg = np.where(t < 0.55, t / 0.55, (t - 0.55) / 0.45)[..., None]
    lo = np.where((t < 0.55)[..., None], np.array(c0), np.array(c1))
    hi = np.where((t < 0.55)[..., None], np.array(c1), np.array(c2))
    img = (lo + (hi - lo) * seg).astype(np.uint8)
    return Image.fromarray(img, "RGB").convert("RGBA")

# YouTube-Safe-Zone (mittiger Streifen, auf ALLEN Geräten sichtbar).
SAFE_W, SAFE_H = 1546, 423
MARGIN = 24   # etwas Luft im Kasten

def subline_image(px: int, tracking: int) -> Image.Image:
    """Plattform-Subline als tightes, transparentes Bild (Montserrat, cyan, gesperrt)."""
    _mont = "/usr/share/fonts/opentype/montserrat/Montserrat-SemiBold.otf"
    _fallback = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font = ImageFont.truetype(_mont if os.path.exists(_mont) else _fallback, px)
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    widths = [probe.textlength(ch, font=font) + tracking for ch in SUBLINE]
    total = int(sum(widths) - tracking)
    asc, desc = font.getmetrics()
    img = Image.new("RGBA", (total, asc + desc), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = 0
    for ch, w in zip(SUBLINE, widths):
        d.text((x, 0), ch, font=font, fill=_hex("#22d3ee"))
        x += w
    return img

def main():
    base = gradient()

    # Dezentes Wellen-Wasserzeichen (kanonisch, cyan, ~9% Deckkraft), oversized, zwei Reihen.
    wm = gen.render_waves(gen.CYAN, 900)
    for (x, y) in ((-200, -120), (W - wm.width + 300, H - wm.height + 120)):
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        faint = wm.copy(); a = faint.split()[3].point(lambda v: int(v * 0.09)); faint.putalpha(a)
        layer.alpha_composite(faint, (x, y)); base.alpha_composite(layer)

    # Horizontales Lockup selbst zusammensetzen: Wellen LINKS, rechts eine Spalte aus
    # Wordmark+Tagline (load_text) und darunter die Plattform-Subline — beide MITTIG
    # unter der Domain (Subline bündig zur Tagline, nicht unter die Wellen verschoben).
    text = gen.load_text("dark", tagline=True); tw, th = text.size
    waves = gen.render_waves(gen.CYAN, int(th * 0.66)); gapw = int(th * 0.17)
    row_w = waves.width + gapw + tw; row_h = max(waves.height, th)
    row = Image.new("RGBA", (row_w, row_h), (0, 0, 0, 0))
    row.alpha_composite(waves, (0, (row_h - waves.height) // 2))
    x_text = waves.width + gapw
    row.alpha_composite(text, (x_text, (row_h - th) // 2))

    sub = subline_image(px=max(20, int(th * 0.16)), tracking=max(4, int(th * 0.032)))
    if sub.width > tw:                                   # nie breiter als der Wordmark
        s = tw / sub.width; sub = sub.resize((tw, int(sub.height * s)), Image.LANCZOS)
    gap_sub = int(th * 0.12)

    block_w = row_w; block_h = row_h + gap_sub + sub.height
    block = Image.new("RGBA", (block_w, block_h), (0, 0, 0, 0))
    block.alpha_composite(row, (0, 0))
    block.alpha_composite(sub, (x_text + (tw - sub.width) // 2, row_h + gap_sub))

    scale = min((SAFE_W - 2 * MARGIN) / block_w, (SAFE_H - 2 * MARGIN) / block_h)
    block = block.resize((round(block_w * scale), round(block_h * scale)), Image.LANCZOS)
    base.alpha_composite(block, ((W - block.width) // 2, (H - block.height) // 2))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    base.convert("RGB").save(OUT)
    print(f"{OUT}  {base.size}  block={block.width}x{block.height} (Safe {SAFE_W}x{SAFE_H})")

if __name__ == "__main__":
    main()
