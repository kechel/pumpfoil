#!/usr/bin/env python3
"""Endcard für Shorts/Reels (1080x1920) — hell UND dunkel, reproduzierbar aus der Brand-Basis.

Gedacht zum Einblenden am ENDE eines Videos (Jan, 04.09.): stehendes Bild, das die Marke, die
Adresse und die unterstützten Plattformen zeigt. Welche Fassung passt, hängt vom Filmmaterial ab
— helle Wasseraufnahmen vertragen die helle, Abendlicht die dunkle. Deshalb beide.

Aufruf:  python3 endcard.py            (aus brand/master/, erzeugt beide Fassungen)

Inhalt und Reihenfolge sind bewusst dieselben wie im YouTube-Banner (`banner.py`): dasselbe
Lockup, dieselbe Plattform-Liste aus derselben Quelle (`banner.SUBLINE`) — sonst laufen die
Assets auseinander, sobald eine Plattform dazukommt.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image

import banner
import gen

W, H = 1080, 1920
RAND = 90                      # seitlicher Rand
OUT = os.path.join(os.path.dirname(__file__), "../social/shorts-endcard-{theme}-1080x1920.png")

# Hell: fast weiss mit einem Hauch Blau, damit die Wortmarke nicht auf Papier zu schweben scheint.
HELL = ("#ffffff", "#eef2f7", "#dde7f0")
DUNKEL = ("#020617", "#061226", "#0a1f3a")
# Cyan auf Weiss ist zu blass — auf hellem Grund die dunklere Stufe derselben Farbfamilie.
CYAN_HELL = "#0e7490"
# Einleitung ueber der Plattform-Liste. Ohne sie steht dort nur eine Reihe Markennamen, und
# niemand sieht, dass es um eine App geht (Jan, 04.09.). Mit ihr liest sich die Liste als Satz:
# „FREE APP FOR — GARMIN · WEAR OS · …". Englisch wie die Tagline, weil die Endcard international
# laeuft; „FREE" stimmt und ist das staerkste Wort, das wir ehrlich sagen koennen (AGPL-3.0).
APP_ZEILE = "FREE APP FOR"


def verlauf(farben: tuple[str, str, str]) -> Image.Image:
    """Diagonaler Dreiton-Verlauf wie im Banner, nur hochkant."""
    c0, c1, c2 = (banner._hex(f) for f in farben)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = ((xx / W) + (yy / H)) / 2.0
    seg = np.where(t < 0.55, t / 0.55, (t - 0.55) / 0.45)[..., None]
    lo = np.where((t < 0.55)[..., None], np.array(c0), np.array(c1))
    hi = np.where((t < 0.55)[..., None], np.array(c1), np.array(c2))
    return Image.fromarray((lo + (hi - lo) * seg).astype(np.uint8), "RGB").convert("RGBA")


def endcard(theme: str) -> Image.Image:
    hell = theme == "light"
    grund = verlauf(HELL if hell else DUNKEL)
    wellen_farbe = CYAN_HELL if hell else gen.CYAN

    # Wasserzeichen: dieselbe Welle, sehr leise. Auf Weiss braucht es etwas mehr Deckkraft,
    # sonst verschwindet sie ganz.
    wm = gen.render_waves(wellen_farbe, 1100)
    for (x, y) in ((-260, 120), (W - wm.width + 260, H - wm.height - 120)):
        faint = wm.copy()
        a = faint.split()[3].point(lambda v: int(v * (0.13 if hell else 0.09)))
        faint.putalpha(a)
        lage = Image.new("RGBA", grund.size, (0, 0, 0, 0))
        lage.alpha_composite(faint, (x, y))
        grund.alpha_composite(lage)

    # Gestapeltes Lockup (Wellen über Wortmarke + Tagline) — dieselbe Bauweise wie das Overlay.
    lock = gen.build_fit("stacked", "light" if hell else "dark", tagline=True)
    breite = W - 2 * RAND
    lock = lock.resize((breite, round(lock.height * breite / lock.width)), Image.LANCZOS)

    # Plattform-Liste — hier ANDERS als im Banner: nur ZWEI Eintraege je Zeile. Ein Short laeuft
    # auf einem Handy und ist drei Sekunden zu sehen; neun Namen in zwei Zeilen kann dort niemand
    # lesen (Jan, 04.09.). Weniger Zeichen je Zeile heisst groessere Schrift bei gleicher Breite.
    # Die Quelle bleibt dieselbe wie im Banner, nur die Umbruch-Regel unterscheidet sich.
    zeilen = [banner.subline_image(z, px=64, tracking=6) for z in banner.subline_zeilen(2)]
    faktor = breite / max(z.width for z in zeilen)
    # Die Einleitung in derselben Schrift, aber kleiner und ruhiger als die Marken darunter —
    # sie soll fuehren, nicht mit ihnen konkurrieren.
    einleitung = banner.subline_image(APP_ZEILE, px=44, tracking=10)
    ein_faktor = (breite * 0.52) / einleitung.width
    einleitung = einleitung.resize((round(einleitung.width * ein_faktor),
                                    round(einleitung.height * ein_faktor)), Image.LANCZOS)
    grau = "#64748b" if hell else "#94a3b8"
    r, g, b = banner._hex(grau)
    voll = Image.new("RGBA", einleitung.size, (r, g, b, 255))
    voll.putalpha(einleitung.split()[3])
    einleitung = voll
    zeilen = [z.resize((round(z.width * faktor), round(z.height * faktor)), Image.LANCZOS)
              for z in zeilen]
    if hell:
        # subline_image faerbt in Marken-Cyan; auf hellem Grund umfaerben statt neu zu rendern.
        r, g, b = banner._hex(CYAN_HELL)
        for i, z in enumerate(zeilen):
            voll = Image.new("RGBA", z.size, (r, g, b, 255))
            voll.putalpha(z.split()[3])
            zeilen[i] = voll

    abstand = 84                                   # Lockup -> Einleitung
    nach_einleitung = round(einleitung.height * 0.85)
    zeilenabstand = round(zeilen[0].height * 0.30)  # Luft zwischen den Plattform-Zeilen
    block_h = (lock.height + abstand + einleitung.height + nach_einleitung
               + sum(z.height for z in zeilen) + zeilenabstand * (len(zeilen) - 1))
    y = (H - block_h) // 2
    grund.alpha_composite(lock, ((W - lock.width) // 2, y))
    y += lock.height + abstand
    grund.alpha_composite(einleitung, ((W - einleitung.width) // 2, y))
    y += einleitung.height + nach_einleitung
    for z in zeilen:
        grund.alpha_composite(z, ((W - z.width) // 2, y))
        y += z.height + zeilenabstand
    return grund.convert("RGB")


def main() -> None:
    os.makedirs(os.path.dirname(OUT.format(theme="dark")), exist_ok=True)
    for theme in ("dark", "light"):
        ziel = OUT.format(theme=theme)
        endcard(theme).save(ziel)
        print(f"{ziel}  ({W}x{H})")


if __name__ == "__main__":
    main()
