#!/usr/bin/env python3
"""YouTube-Video-Overlay (1080x1920, transparent) reproduzierbar aus der Brand-Basis.
Gestapeltes Lockup (kanonische Wellen + Wordmark + Tagline) oben-mittig, mit weichem
dunklem Schatten für Lesbarkeit über beliebigem Videomaterial. Transparenz bleibt erhalten.
Aufruf:  ../../server/.venv/bin/python overlay.py   (aus brand/master/)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageFilter
import gen

W, H = 1080, 1920
TARGET_W = 640           # Lockup-Breite
TOP = 90                 # Abstand von oben
OUT = os.path.join(os.path.dirname(__file__), "../social/youtube-overlay-1080x1920.png")

def main():
    lock = gen.build_fit("stacked", "dark", tagline=True)
    scale = TARGET_W / lock.width
    lock = lock.resize((TARGET_W, round(lock.height * scale)), Image.LANCZOS)

    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x = (W - lock.width) // 2

    # Weicher dunkler Schatten (aus der Lockup-Silhouette) für Kontrast über Video.
    alpha = lock.split()[3]
    shadow = Image.new("RGBA", lock.size, (2, 6, 23, 0))
    shadow.putalpha(alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    shadow.putalpha(shadow.split()[3].point(lambda v: int(v * 0.55)))
    # Schatten leicht vergrößert/mittig hinterlegen (zwei Versätze = gleichmäßiger Halo).
    for dx, dy in ((0, 8), (0, 0)):
        canvas.alpha_composite(shadow, (x + dx, TOP + dy))

    canvas.alpha_composite(lock, (x, TOP))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    canvas.save(OUT)   # RGBA — Transparenz erhalten
    print(f"{OUT}  {canvas.size}")

if __name__ == "__main__":
    main()
