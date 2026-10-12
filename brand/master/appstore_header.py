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
# MITTIGEN Ausschnitt, etwa ein Drittel der Breite und 40 % der Hoehe. Deshalb steht alles in einer
# schmalen Spalte in der Mitte (Jan: „etwas kleiner, das logo drueber, die Uhr mit an die obere
# kante der screenshots, dann ist es nicht schlimm wenn drunter was abgeschnitten wird … links und
# rechts einfach komplett leer lassen"): oben das Lockup, darunter drei Screens und die Uhr mit
# buendiger Oberkante. Unten darf der Ausschnitt abschneiden, links und rechts ist nur Hintergrund.
# Zweite Vorschau (Jan, 12.10.2026: „etwas groesser, weiter oben anfangen"): das iPhone zeigt die
# mittleren ~54 % der Breite und von OBEN bis ~63 % der Hoehe (darunter liegt die App-Info).
# Oben liegen Dynamic Island und die Knoepfe Zurueck/Teilen (bis ~0,22 H, aussen) — das Lockup
# sitzt knapp darunter, die Screens beginnen direkt danach und laufen unten aus dem Bild.
SPALTE_B = 0.46                # Breite der Spalte (Anteil von W)
LOGO_Y, SCREENS_Y = 0.255, 0.335   # Mitte des Lockups / Oberkante der Screens (Anteil von H)


def bauen(W, H):
    base = verlauf(W, H)
    wm = gen.render_waves(gen.CYAN, int(H * 0.6))
    for (x, y) in ((-int(W * 0.05), -int(H * 0.08)), (W - int(wm.width * 0.85), H - int(wm.height * 0.8))):
        faint = wm.copy(); faint.putalpha(faint.split()[3].point(lambda v: int(v * 0.08)))
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0)); layer.alpha_composite(faint, (x, y))
        base.alpha_composite(layer)
    spalte = W * SPALTE_B
    # Lockup oben, etwas kleiner als die Spalte
    block = lockup_block()
    s = spalte * 0.58 / block.width
    block = block.resize((round(block.width * s), round(block.height * s)), Image.LANCZOS)
    base.alpha_composite(block, ((W - block.width) // 2, int(H * LOGO_Y - block.height / 2)))
    # Darunter: drei Screens + Uhr nebeneinander, Oberkanten buendig
    gap = spalte * 0.025
    uhr_anteil = 0.72                          # Uhr-Breite relativ zur Screen-Breite
    sb = (spalte - 3 * gap) / (3 + uhr_anteil)
    teile = [(Image.open(os.path.join(IOS, f"{n:02d}.png")), sb, 0.07) for n in SCREENS]
    teile.append((Image.open(UHR), sb * uhr_anteil, 0.22))
    x = (W - spalte) / 2
    oben = H * SCREENS_Y
    for img, b, r in teile:
        g, pad = gerahmt(img, int(b), r)
        base.alpha_composite(g, (int(x - pad), int(oben - pad)))
        x += b + gap
    return base.convert("RGB")


def main():
    os.makedirs(AUS, exist_ok=True)
    gross = bauen(5244, 2950)
    gross.save(os.path.join(AUS, "header-5244x2950.png"), optimize=True)
    # 3840x1646 (2,33:1) = mittiger Zuschnitt davon — gleiche Spalte, gleiche Lage
    h = round(5244 / (3840 / 1646)); y0 = (2950 - h) // 2
    gross.crop((0, y0, 5244, y0 + h)).resize((3840, 1646), Image.LANCZOS).save(
        os.path.join(AUS, "header-3840x1646.png"), optimize=True)
    print(AUS)


if __name__ == "__main__":
    main()
