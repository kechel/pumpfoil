#!/usr/bin/env python3
"""YouTube-Video-Overlay VARIANTE (1080x1920, transparent) — kleineres Lockup, oben-rechts.
Wie overlay.py, aber Lockup auf 70 % (448 px) und nach rechts versetzt statt zentriert;
Oberkante identisch (TOP=90). Reproduzierbar aus der Brand-Basis (gen.build_fit).
Aufruf:  ../../server/.venv/bin/python overlay-small.py   (aus brand/master/)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageFilter
import gen

W, H = 1080, 1920
TARGET_W = 448           # Lockup-Breite (= 70 % von 640)
TOP = 90                 # Abstand von oben (wie overlay.py — Oberkante gleich)
RIGHT_MARGIN = 90        # Abstand vom rechten Rand (nach rechts versetzt statt zentriert)
OUT = os.path.join(os.path.dirname(__file__), "../social/youtube-overlay-small-1080x1920.png")

def main():
    lock = gen.build_fit("stacked", "dark", tagline=True)
    scale = TARGET_W / lock.width
    lock = lock.resize((TARGET_W, round(lock.height * scale)), Image.LANCZOS)

    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x = W - lock.width - RIGHT_MARGIN

    # Weicher dunkler Schatten (aus der Lockup-Silhouette) für Kontrast über Video.
    alpha = lock.split()[3]
    shadow = Image.new("RGBA", lock.size, (2, 6, 23, 0))
    shadow.putalpha(alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    shadow.putalpha(shadow.split()[3].point(lambda v: int(v * 0.55)))
    for dx, dy in ((0, 8), (0, 0)):
        canvas.alpha_composite(shadow, (x + dx, TOP + dy))

    canvas.alpha_composite(lock, (x, TOP))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    canvas.save(OUT)   # RGBA — Transparenz erhalten
    print(f"{OUT}  {canvas.size}")

if __name__ == "__main__":
    main()
