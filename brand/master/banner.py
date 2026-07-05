#!/usr/bin/env python3
"""YouTube-/Social-Banner (2560x1440) reproduzierbar aus der Brand-Basis.
Nutzt das gestapelte Lockup (kanonische Wellen + Avenir-Wordmark + Tagline) aus gen.py,
auf Navy-Verlauf + dezentem Wellen-Wasserzeichen. Plattform-Subline bewusst unverändert.
Aufruf:  ../../server/.venv/bin/python banner.py   (aus brand/master/)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import gen

W, H = 2560, 1440
OUT = os.path.join(os.path.dirname(__file__), "../social/youtube-banner-2560x1440.png")
SUBLINE = "GARMIN · WEAR OS · APPLE WATCH"   # Plattform-Liste NICHT ändern (erst nach Approval erweitern)

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

def main():
    base = gradient()

    # Dezentes Wellen-Wasserzeichen (kanonisch, cyan, ~8% Deckkraft), oversized, zwei Reihen.
    wm = gen.render_waves(gen.CYAN, 900)
    for (x, y) in ((-200, -120), (W - wm.width + 300, H - wm.height + 120)):
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        faint = wm.copy(); a = faint.split()[3].point(lambda v: int(v * 0.09)); faint.putalpha(a)
        layer.alpha_composite(faint, (x, y)); base.alpha_composite(layer)

    # Gestapeltes Lockup (Wellen + pumpfoil.org + TRACK EVERY PUMP), dark, tight -> auf Zielbreite.
    lock = gen.build_fit("stacked", "dark", tagline=True)
    target_w = 1500
    scale = target_w / lock.width
    lock = lock.resize((target_w, int(lock.height * scale)), Image.LANCZOS)
    lx = (W - lock.width) // 2
    ly = (H - lock.height) // 2 - 40
    base.alpha_composite(lock, (lx, ly))

    # Plattform-Subline (Montserrat SemiBold = freier Avenir-naher Ersatz, cyan, gesperrt).
    d = ImageDraw.Draw(base)
    _mont = "/usr/share/fonts/opentype/montserrat/Montserrat-SemiBold.otf"
    _fallback = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font = ImageFont.truetype(_mont if os.path.exists(_mont) else _fallback, 34)
    tracking = 10
    widths = [d.textlength(ch, font=font) + tracking for ch in SUBLINE]
    total = sum(widths) - tracking
    x = (W - total) / 2
    y = ly + lock.height + 34
    for ch, w in zip(SUBLINE, widths):
        d.text((x, y), ch, font=font, fill=_hex("#22d3ee"))
        x += w

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    base.convert("RGB").save(OUT)
    print(f"{OUT}  {base.size}")

if __name__ == "__main__":
    main()
