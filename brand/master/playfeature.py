#!/usr/bin/env python3
"""Play-Store-Vorstellungsgrafik (1024x500) reproduzierbar aus der Brand-Basis.

Aufruf:  ../../server/.venv/bin/python playfeature.py   (aus brand/master/)

Warum es dieses Skript gibt: die bisherige Grafik lag seit dem 28.06.2026 nur als PNG in
`brand/stores/google/` — ohne Quelle, ohne Generator. Ihre Plattform-Zeile nannte drei
Namen (Garmin, Wear OS, Apple Watch), inzwischen sind es neun. Genau so veraltet etwas
still: was man nicht neu erzeugen kann, zieht auch niemand nach (Jan, 05.09.2026).

Inhalt und Reihenfolge kommen deshalb aus DERSELBEN Quelle wie YouTube-Banner und
Shorts-Endcards (`banner.SUBLINE`) — kommt eine Plattform dazu, sind alle drei Assets mit
je einem Aufruf wieder aktuell.

Zum Format: 1024x500 ist klein und wird in den Play-Empfehlungen zusaetzlich verkleinert
und teils beschnitten. Deshalb bewusst KEINE Aufzaehlungspunkte wie in der alten Fassung —
vier Zeilen Kleingedrucktes sind dort nicht mehr lesbar. Es bleibt, was auf Briefmarken-
groesse noch traegt: Wortmarke, Tagline, Plattform-Liste — und rechts ein echter Screenshot
statt der frueheren Track-Dekoration (Jan, 05.09.2026).

Der Screenshot kommt aus den Store-Bildern (`brand/stores/apple/iphone-6.5/03.png`, der
farbige GPS-Track). Aus dem fertigen Store-Bild wird NUR das Telefon herausgeschnitten —
die eingebrannte Ueberschrift bleibt draussen, sonst staenden zwei Titel im Bild. Der
Ausschnitt ist unten offen: das Telefon laeuft aus dem Bild heraus, das wirkt lebendiger
als ein freigestelltes Geraet in der Mitte.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image

import banner
import gen

W, H = 1024, 500
OUT = os.path.join(os.path.dirname(__file__), "../stores/google/feature-graphic-1024x500.png")
# Rand rundum. Play beschneidet die Grafik je nach Platzierung an den Seiten, deshalb bleibt
# ringsum reichlich Luft — nichts Wichtiges nah an den Rand.
RAND = 48
# Quelle fuer das Telefon rechts und der Ausschnitt darin (in Pixeln des Store-Bildes,
# 1242x2688). Die Werte sind GEMESSEN: nicht ueber Helligkeit — der Gehaeuserand ist fast so
# dunkel wie der Hintergrund und faellt dabei durch, der Ausschnitt schnitte dann ins Display.
# Statt dessen gegen die Hintergrundfarbe der Store-Grafik verglichen (`a[5,5]`, ein sehr
# dunkles Navy): das Geraet liegt zwischen x=116 und x=1125 und endet bei y=2645. Oben bleibt
# die eingebrannte Ueberschrift draussen, die endet bei y~460.
SHOT = os.path.join(os.path.dirname(__file__), "../stores/apple/iphone-6.5/03.png")
SHOT_BOX = (116, 500, 1126, 2646)
# Anteil der Bildbreite, den die rechte Spalte mit dem Telefon einnimmt.
SHOT_SPALTE = 0.34


def verlauf() -> Image.Image:
    """Derselbe diagonale Dreiton-Verlauf wie im Banner, nur auf dieses Format gerechnet."""
    c0, c1, c2 = (banner._hex(f) for f in ("#020617", "#061226", "#0a1f3a"))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = ((xx / W) + (yy / H)) / 2.0
    seg = np.where(t < 0.55, t / 0.55, (t - 0.55) / 0.45)[..., None]
    lo = np.where((t < 0.55)[..., None], np.array(c0), np.array(c1))
    hi = np.where((t < 0.55)[..., None], np.array(c1), np.array(c2))
    return Image.fromarray((lo + (hi - lo) * seg).astype(np.uint8), "RGB").convert("RGBA")


def main() -> None:
    grund = verlauf()

    # Wellen-Wasserzeichen, sehr leise — wie in Banner und Endcard, damit die Flaeche nicht
    # tot wirkt. Zwei Reihen ueber Eck, angeschnitten.
    wm = gen.render_waves(gen.CYAN, 420)
    for (x, y) in ((-120, -70), (W - wm.width + 150, H - wm.height + 70)):
        lage = Image.new("RGBA", grund.size, (0, 0, 0, 0))
        leise = wm.copy()
        leise.putalpha(leise.split()[3].point(lambda v: int(v * 0.09)))
        lage.alpha_composite(leise, (x, y))
        grund.alpha_composite(lage)

    # Horizontales Lockup: Wellen links, rechts Wortmarke + Tagline — genau wie im Banner.
    text = gen.load_text("dark", tagline=True)
    tw, th = text.size
    wellen = gen.render_waves(gen.CYAN, int(th * 0.66))
    luecke = int(th * 0.17)
    zeile_w = wellen.width + luecke + tw
    zeile_h = max(wellen.height, th)
    zeile = Image.new("RGBA", (zeile_w, zeile_h), (0, 0, 0, 0))
    zeile.alpha_composite(wellen, (0, (zeile_h - wellen.height) // 2))
    zeile.alpha_composite(text, (wellen.width + luecke, (zeile_h - th) // 2))

    # Plattform-Liste zweizeilig. Bei neun Namen in einer Zeile waere die Schrift auf
    # 1024 px Breite zu klein; zwei Zeilen halbieren die Zeichenzahl und verdoppeln damit
    # praktisch die Groesse. Beide Zeilen mit DEMSELBEN Faktor, sonst saehen sie
    # verschieden gross aus.
    zeilen = [banner.subline_image(z, px=max(20, int(th * 0.24)), tracking=max(2, int(th * 0.022)))
              for z in banner.subline_zeilen()]
    faktor = (zeile_w * banner.SUB_BREITE) / max(z.width for z in zeilen)
    zeilen = [z.resize((max(1, round(z.width * faktor)), max(1, round(z.height * faktor))),
                       Image.LANCZOS) for z in zeilen]

    abstand = int(th * 0.13)
    zeilenabstand = int(zeilen[0].height * 0.04)
    block_h = zeile_h + abstand + sum(z.height for z in zeilen) + zeilenabstand
    block = Image.new("RGBA", (zeile_w, block_h), (0, 0, 0, 0))
    block.alpha_composite(zeile, (0, 0))
    y = zeile_h + abstand
    for z in zeilen:
        block.alpha_composite(z, ((zeile_w - z.width) // 2, y))
        y += z.height + zeilenabstand

    # Rechts das Telefon: unten offen, damit es aus dem Bild laeuft. Die Hoehe ist bewusst
    # groesser als die Leinwand — ein vollstaendig sichtbares Geraet wirkt auf diesem flachen
    # Format wie ein Briefmarkenbild.
    telefon = Image.open(SHOT).convert("RGB").crop(SHOT_BOX)
    t_h = round(H * 1.22)
    telefon = telefon.resize((round(telefon.width * t_h / telefon.height), t_h), Image.LANCZOS)
    spalte_x = round(W * (1 - SHOT_SPALTE))
    t_x = spalte_x + (W - spalte_x - telefon.width) // 2
    grund.paste(telefon, (t_x, round(H * 0.10)))

    # Links der Markenblock, mittig in der verbleibenden Spalte.
    text_breite = spalte_x - RAND
    skala = min((text_breite - RAND) / zeile_w, (H - 2 * RAND) / block_h)
    block = block.resize((round(zeile_w * skala), round(block_h * skala)), Image.LANCZOS)
    grund.alpha_composite(block, (RAND + (text_breite - RAND - block.width) // 2,
                                  (H - block.height) // 2))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    grund.convert("RGB").save(OUT)
    print(f"{OUT}  {W}x{H}  Block={block.width}x{block.height}  "
          f"Listenzeile={round(zeilen[0].height * skala)} px")
    print("Plattformen:", " | ".join(banner.subline_zeilen()))


if __name__ == "__main__":
    main()
