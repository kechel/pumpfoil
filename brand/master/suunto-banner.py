#!/usr/bin/env python3
"""Banner fuer den SuuntoPlus Store (600 x 300 PNG, Hintergrund der Sport-App-Ansicht).

Marken-Regeln (docs/BRAND.md): flache Farben, keine Verlaeufe; Lockup aus gen.py.
Aufruf aus brand/master/:  ../../server/.venv/bin/python suunto-banner.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont
import gen

W, H = 600, 300
OUT = os.path.join(os.path.dirname(__file__), "../stores/suunto/suuntoplus-banner-600x300.png")
NAVY, CYAN, SLATE = "#020617", "#22d3ee", "#94a3b8"
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf"


def main():
    img = Image.new("RGBA", (W, H), NAVY)
    # Wellen als dezentes Wasserzeichen rechts unten
    wm = gen.render_waves(CYAN, 260)
    wm.putalpha(wm.split()[3].point(lambda v: int(v * 0.07)))
    img.alpha_composite(wm, (W - wm.width + 90, H - wm.height + 70))
    lock = gen.build_fit("stacked", "dark", tagline=True)
    bw = 300
    lock = lock.resize((bw, round(lock.height * bw / lock.width)), Image.LANCZOS)
    y = (H - lock.height) // 2 - 22
    img.alpha_composite(lock, ((W - bw) // 2, y))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(F % "", 19)
    t = "Runs, pumps and alarms for pump foiling"
    b = d.textbbox((0, 0), t, font=f)
    d.text(((W - (b[2] - b[0])) / 2 - b[0], y + lock.height + 22), t, font=f, fill=SLATE)
    img.convert("RGB").save(OUT, optimize=True)
    print(OUT, img.size)


if __name__ == "__main__":
    main()
