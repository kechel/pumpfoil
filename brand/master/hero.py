#!/usr/bin/env python3
"""Garmin-Connect-IQ-Store-Hero (1440x720) reproduzierbar aus der Brand-Basis.
Gestapeltes Lockup (kanonische Wellen + Avenir-Wordmark + Tagline) mittig auf Navy-Verlauf +
dezentem Wellen-Wasserzeichen. Aufruf:  ../../server/.venv/bin/python hero.py  (aus brand/master/)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import gen

W, H = 1440, 720
TARGET_W = 900          # Lockup-Breite
OUT = os.path.join(os.path.dirname(__file__), "../stores/garmin/hero-1440x720.png")

def _hex(h): h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def gradient():
    c0, c1, c2 = map(_hex, ("#020617", "#061226", "#0a1f3a"))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = ((xx / W) + (yy / H)) / 2.0
    seg = np.where(t < 0.55, t / 0.55, (t - 0.55) / 0.45)[..., None]
    lo = np.where((t < 0.55)[..., None], np.array(c0), np.array(c1))
    hi = np.where((t < 0.55)[..., None], np.array(c1), np.array(c2))
    return Image.fromarray((lo + (hi - lo) * seg).astype(np.uint8), "RGB").convert("RGBA")

def main():
    base = gradient()

    # Dezentes Wellen-Wasserzeichen (kanonisch, cyan, ~9%), oversized, zwei Ecken.
    wm = gen.render_waves(gen.CYAN, 520)
    for (x, y) in ((-120, -80), (W - wm.width + 160, H - wm.height + 70)):
        faint = wm.copy(); faint.putalpha(faint.split()[3].point(lambda v: int(v * 0.09)))
        base.alpha_composite(faint, (x, y))

    # Gestapeltes Lockup mittig.
    lock = gen.build_fit("stacked", "dark", tagline=True)
    scale = TARGET_W / lock.width
    lock = lock.resize((TARGET_W, round(lock.height * scale)), Image.LANCZOS)
    base.alpha_composite(lock, ((W - lock.width) // 2, (H - lock.height) // 2))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    base.convert("RGB").save(OUT)
    print(f"{OUT}  {base.size}")

if __name__ == "__main__":
    main()
