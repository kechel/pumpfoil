#!/usr/bin/env python3
"""Erzeugt die vier Watch-Screenshots für die Landing-Page ("Auf der Uhr"-Sektion)
aus den Store-Asset-PNGs (-> WebP nach web/public/).

Neue Screenshots? PNGs in store-assets/{apple-watch,wear-os}/ ablegen, ggf. die
QUELLEN unten anpassen, dann ausführen:

    python3 scripts/make-landing-watch-shots.py
    (danach: cd web && npm run build  — dist wird live ausgeliefert)

Die Apple-Bilder werden rechteckig (rounded-rect im UI), die Wear-Bilder rund
maskiert dargestellt — hier nur konvertieren, das Maskieren macht das CSS.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# (Quelle relativ zum Repo-Root) -> (Ziel in web/public)
SOURCES = {
    "store-assets/apple-watch/ultra3-02.png": "web/public/watch-apple-1.webp",
    "store-assets/apple-watch/ultra3-04.png": "web/public/watch-apple-2.webp",
    "store-assets/wear-os/wear-02.png":       "web/public/watch-wear-1.webp",
    "store-assets/wear-os/wear-04.png":       "web/public/watch-wear-2.webp",
}

def main() -> None:
    for src, dst in SOURCES.items():
        s, d = ROOT / src, ROOT / dst
        if not s.exists():
            print(f"FEHLT: {src} — übersprungen")
            continue
        Image.open(s).convert("RGB").save(d, "WEBP", quality=88, method=6)
        print(f"ok  {src} -> {dst}")

if __name__ == "__main__":
    main()
