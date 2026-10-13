#!/usr/bin/env python3
"""HUAWEI-AppGallery-Icon (1024x1024 und 216x216 PNG, transparent): dasselbe Motiv wie das
Paket-Icon der Watch-5-App (watch-huawei/arkts/AppScope/resources/base/media/app_icon.png, 114 px):
Cyan-Kreis #22d3ee, weisse Wellen. AppGallery verlangt, dass das Store-Icon dem im Paket entspricht
(13.10.2026). Proportionen am 114-px-Icon gemessen: Wellen 46/114 hoch, mittig.

Aufruf:  ../../server/.venv/bin/python huawei_icon.py   (aus brand/master/)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw

import gen

AUS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../stores/huawei")


def icon(n: int) -> Image.Image:
    s = 4   # Kreis ueberabgetastet, damit der Rand glatt wird
    gross = Image.new("RGBA", (n * s, n * s), (0, 0, 0, 0))
    ImageDraw.Draw(gross).ellipse([0, 0, n * s - 1, n * s - 1], fill=gen.CYAN)
    im = gross.resize((n, n), Image.LANCZOS)
    w = gen.render_waves("#ffffff", round(n * 46 / 114))
    im.alpha_composite(w, ((n - w.width) // 2, (n - w.height) // 2))
    return im


def main():
    os.makedirs(AUS, exist_ok=True)
    for n in (1024, 216):
        icon(n).save(os.path.join(AUS, f"icon-{n}.png"), optimize=True)
    print(os.path.abspath(AUS))


if __name__ == "__main__":
    main()
