#!/usr/bin/env python3
"""App-Store-Kopfzeile (Produktseite „Kopfzeile"), reproduzierbar aus der Brand-Basis.

App Store Connect nimmt seit 2026 eine Kopfzeilen-Grafik in 5244x2950 oder 3840x1646 (Jan,
12.10.2026). Aufbau wie das YouTube-Banner (banner.py): Navy-Verlauf, dezentes Wellen-Wasserzeichen,
links das horizontale Lockup mit Tagline (ohne Plattform-Liste), rechts drei iPhone-Screens und die
Apple Watch aus den Store-Bildern vom 10./11.10. Alles Wichtige liegt im mittleren Band, damit
auch ein Zuschnitt aufs breitere Format nichts abschneidet.

Aufruf:  ../../server/.venv/bin/python appstore_header.py   (aus brand/master/)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import banner
import gen

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.abspath(os.path.join(HIER, "../.."))
IOS = os.path.join(WURZEL, "screenshots/mobile/ios/20261011-neu/unkenntlich")
UHR = os.path.join(WURZEL, "brand/stores/apple/apple-watch/2026-10/ultra-01.png")
AUS = os.path.join(WURZEL, "brand/stores/apple/header")
SCREENS = (1, 10, 12)         # Startseite, Lauf auf der Karte (ohne Garmin-Name wie in #9), Fortschritt


def verlauf(w, h):
    c0, c1, c2 = map(banner._hex, ("#020617", "#061226", "#0a1f3a"))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = ((xx / w) + (yy / h)) / 2.0
    seg = np.where(t < 0.55, t / 0.55, (t - 0.55) / 0.45)[..., None]
    lo = np.where((t < 0.55)[..., None], np.array(c0), np.array(c1))
    hi = np.where((t < 0.55)[..., None], np.array(c1), np.array(c2))
    return Image.fromarray((lo + (hi - lo) * seg).astype(np.uint8), "RGB").convert("RGBA")


def lockup_block():
    """Wellen + Wordmark + Tagline (wie banner.main), OHNE die Plattform-Liste: Garmin, Wear OS
    usw. gehoeren nicht auf die App-Store-Seite (Jan, 12.10.2026: „das mag apple nicht")."""
    text = gen.load_text("dark", tagline=True); tw, th = text.size
    waves = gen.render_waves(gen.CYAN, int(th * 0.66)); gapw = int(th * 0.17)
    row_w = waves.width + gapw + tw; row_h = max(waves.height, th)
    row = Image.new("RGBA", (row_w, row_h), (0, 0, 0, 0))
    row.alpha_composite(waves, (0, (row_h - waves.height) // 2))
    row.alpha_composite(text, (waves.width + gapw, (row_h - th) // 2))
    return row


def gerahmt(img, breite, radius_anteil=0.07):
    """Screenshot mit runden Ecken, duennem Cyan-Rand und Schatten (wie die Store-Bilder)."""
    h = round(img.height * breite / img.width)
    img = img.convert("RGB").resize((breite, h), Image.LANCZOS).convert("RGBA")
    r = int(breite * radius_anteil)
    m = Image.new("L", (breite * 4, h * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, breite * 4 - 1, h * 4 - 1], radius=r * 4, fill=255)
    img.putalpha(m.resize((breite, h), Image.LANCZOS))
    pad = int(breite * 0.08)
    out = Image.new("RGBA", (breite + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([pad, pad + int(h * 0.015), pad + breite, pad + h + int(h * 0.015)],
                                         radius=r, fill=(0, 0, 0, 170))
    out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(int(breite * 0.035))))
    out.alpha_composite(img, (pad, pad))
    ImageDraw.Draw(out).rounded_rectangle([pad, pad, pad + breite, pad + h], radius=r,
                                          outline=(34, 211, 238, 110), width=max(2, int(breite * 0.004)))
    return out, pad


# Was das iPhone zeigt (Jan, 12.10.2026, Geraetevorschau in App Store Connect): nur einen kleinen
# MITTIGEN Ausschnitt, etwa ein Drittel der Breite und 40 % der Hoehe. Die erste Fassung hatte
# das Lockup links und die Screens rechts — auf dem iPhone sah man davon nur die Raender. Jetzt
# steht das Lockup genau in der Mitte und passt in diesen Ausschnitt; die Screens flankieren es
# links und rechts und sind auf iPad/Mac zu sehen.
MITTE_B, MITTE_H = 0.30, 0.36


def bauen(W, H, band_h):
    base = verlauf(W, H)
    wm = gen.render_waves(gen.CYAN, int(H * 0.6))
    for (x, y) in ((-int(W * 0.05), -int(H * 0.08)), (W - int(wm.width * 0.85), H - int(wm.height * 0.8))):
        faint = wm.copy(); faint.putalpha(faint.split()[3].point(lambda v: int(v * 0.08)))
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0)); layer.alpha_composite(faint, (x, y))
        base.alpha_composite(layer)
    top = (H - band_h) // 2
    # Seiten zuerst (liegen hinter dem Lockup, falls sie sich beruehren)
    sh = int(band_h * 0.80)
    bilder = {n: Image.open(os.path.join(IOS, f"{n:02d}.png")) for n in SCREENS}
    ratio = bilder[SCREENS[0]].width / bilder[SCREENS[0]].height
    rand = W * (1 - MITTE_B) / 2               # Breite je Seitenfeld
    def setze(img, f, cx, cy, radius=0.07):
        g, pad = gerahmt(img, int(sh * f * ratio) if radius < 0.2 else int(sh * f * 0.82), radius)
        base.alpha_composite(g, (int(cx - g.width / 2), int(cy - g.height / 2)))
    cy = top + band_h / 2
    # links: Startseite, davor die Uhr
    setze(bilder[SCREENS[0]], 0.92, rand * 0.42, cy)
    setze(Image.open(UHR), 0.42, rand * 0.80, cy + sh * 0.22, radius=0.22)
    # rechts: Lauf auf der Karte vorn, Fortschritt dahinter
    setze(bilder[SCREENS[2]], 0.84, W - rand * 0.30, cy - sh * 0.03)
    setze(bilder[SCREENS[1]], 0.92, W - rand * 0.62, cy)
    # Mitte: Lockup, passt in den Ausschnitt, den das iPhone zeigt
    block = lockup_block()
    s = min(W * MITTE_B * 0.86 / block.width, H * MITTE_H * 0.70 / block.height)
    block = block.resize((round(block.width * s), round(block.height * s)), Image.LANCZOS)
    base.alpha_composite(block, ((W - block.width) // 2, (H - block.height) // 2))
    return base.convert("RGB")


def main():
    os.makedirs(AUS, exist_ok=True)
    # 5244x2950: Band = Hoehe, die ein Zuschnitt auf 3840x1646 (2,33:1) uebrig liesse
    for (w, h) in ((5244, 2950), (3840, 1646)):
        band = min(h, round(w / (3840 / 1646)))
        p = os.path.join(AUS, f"header-{w}x{h}.png")
        bauen(w, h, int(band * 0.86)).save(p, optimize=True)
        print(p)


if __name__ == "__main__":
    main()
