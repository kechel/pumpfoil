#!/usr/bin/env python3
"""Baut die 360x360-Store-Vorschauen fuer Zepp OS aus Simulator-Fenster-Mitschnitten.

Vorgabe (docs.zepp.com/docs/distribute, wortlaut):
  - "The output size: 360x360px, format: PNG"
  - "The background of screenshots should be transparent and not have a fill color."
  - rund:  Screenshot mittig auf 360x360 transparent, OHNE Rand ringsum
  - eckig: Screenshot mittig auf 360x360 transparent, gleicher Rand LINKS/RECHTS, oben/unten keiner
Transparenz gilt fuer BEIDE Formen -- der abgenommene runde Satz war genau so.

Warum hier gemessen und nicht geschnitzt wird: eine erste Fassung hat die Bildform ueber den
Alphakanal bestimmt. Die Rohbilder sind aber deckend, also war die "Inhalts"-Box immer die ganze
Leinwand und beide Saetze wurden 1:1 gestaucht statt zugeschnitten -- auch der runde, der schon
abgenommen war. Deshalb sucht dieses Skript das Displayfeld ueber die FENSTERSTRUKTUR (heller
Titelbalken, Displayflaeche darunter) und prueft das Ergebnis gegen harte Erwartungen, statt
irgendetwas zu vermuten. Schlaegt eine Pruefung fehl, bricht es ab.

Aufruf (ohne Argumente, Pfade stehen unten):
    python3 scripts/zepp-store-previews.py
"""
import pathlib
import sys

import numpy as np
from PIL import Image

KANTE = 360
WURZEL = pathlib.Path(__file__).resolve().parent.parent
ROH = WURZEL / 'screenshots/watch/zepp/raw'
ZIEL = WURZEL / 'screenshots/watch/zepp/store360'
SAETZE = [('circle', 'rund', 'rund'), ('square', 'eckig', 'eckig')]


def grau(p: pathlib.Path) -> np.ndarray:
    with Image.open(p) as im:
        return np.asarray(im.convert('L'), dtype=np.int16)


def fensterfeld(g: np.ndarray) -> tuple[int, int, int, int]:
    """Displayflaeche im Fenster-Mitschnitt: (x0, y0, x1, y1), Ende exklusiv.

    Der Desktop um das Fenster ist schwarz, das Fenster hat einen hellen Titelbalken. Also:
    zuerst die Box aller nicht-schwarzen Pixel = Fenster inkl. Titelbalken, dann den Titelbalken
    ueber seine Helligkeit abschneiden.
    """
    hell = g > 45
    ys, xs = np.where(hell)
    if not len(ys):
        raise ValueError('kein helles Pixel — kein Fenster erkennbar')
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    # Titelbalken: von oben weg alle Zeilen, die ueberwiegend hell sind (>50 % ueber 150).
    balken = y0
    while balken < y1 and (g[balken, x0:x1] > 150).mean() > 0.5:
        balken += 1
    if balken == y0:
        raise ValueError('kein Titelbalken gefunden')
    return int(x0), int(balken), int(x1), int(y1)


def scheibe(g: np.ndarray, feld: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """Runde Uhr: die schwarze Scheibe auf grauem Grund innerhalb der Displayflaeche."""
    x0, y0, x1, y1 = feld
    dunkel = g[y0:y1, x0:x1] < 25
    ys, xs = np.where(dunkel)
    if not len(ys):
        raise ValueError('keine dunkle Scheibe gefunden')
    return int(x0 + xs.min()), int(y0 + ys.min()), int(x0 + xs.max() + 1), int(y0 + ys.max() + 1)


def rand_weg(g: np.ndarray, feld: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """Eckige Uhr: den hellen Fensterrahmen von der schwarzen Displayflaeche abziehen."""
    x0, y0, x1, y1 = feld
    while x0 < x1 and (g[y0:y1, x0] > 45).mean() > 0.5: x0 += 1
    while x1 > x0 and (g[y0:y1, x1 - 1] > 45).mean() > 0.5: x1 -= 1
    while y1 > y0 and (g[y1 - 1, x0:x1] > 45).mean() > 0.5: y1 -= 1
    return x0, y0, x1, y1


def kreismaske(kante: int) -> Image.Image:
    """Alpha: innerhalb des eingeschriebenen Kreises 255, ausserhalb 0 (weiche Kante durch 4x-Raster)."""
    n = kante * 4
    y, x = np.ogrid[:n, :n]
    r = (n - 1) / 2
    innen = ((x - r) ** 2 + (y - r) ** 2) <= r ** 2
    m = Image.fromarray((innen * 255).astype(np.uint8))
    return m.resize((kante, kante), Image.LANCZOS)


def main() -> None:
    fehler = []
    for quelle, ziel, form in SAETZE:
        qdir, zdir = ROH / quelle, ZIEL / ziel
        rohbilder = sorted(p for p in qdir.iterdir() if p.suffix.lower() == '.png') if qdir.is_dir() else []
        if not rohbilder:
            fehler.append(f'{qdir}: keine PNG'); continue

        # 1) Displayfeld je Bild bestimmen ...
        felder = []
        for p in rohbilder:
            g = grau(p)
            feld = fensterfeld(g)
            feld = scheibe(g, feld) if form == 'rund' else rand_weg(g, feld)
            felder.append((p, feld))

        # 2) ... und gegen harte Erwartungen pruefen, statt dem Ergebnis zu glauben.
        groessen = {(f[2] - f[0], f[3] - f[1]) for _, f in felder}
        if len(groessen) != 1:
            fehler.append(f'{quelle}: Displayfeld nicht einheitlich -> {sorted(groessen)}')
            continue
        (bt, ht), = groessen
        if form == 'rund' and abs(bt - ht) > 2:
            fehler.append(f'{quelle}: rund erwartet quadratisch, gemessen {bt}x{ht}')
            continue
        print(f'{quelle}/ -> {ziel}/  Displayfeld {bt}x{ht} in {len(felder)} Bildern')

        # 3) Schreiben.
        zdir.mkdir(parents=True, exist_ok=True)
        for alt in sorted(zdir.glob(f'zepp-{ziel}-*.png')):
            alt.unlink()
        maske = kreismaske(KANTE) if form == 'rund' else None
        breite = KANTE if form == 'rund' else round(bt * KANTE / ht)
        for i, (p, (x0, y0, x1, y1)) in enumerate(felder, 1):
            with Image.open(p) as im:
                aus = im.convert('RGBA').crop((x0, y0, x1, y1)).resize((breite, KANTE), Image.LANCZOS)
            leinwand = Image.new('RGBA', (KANTE, KANTE), (0, 0, 0, 0))
            leinwand.paste(aus, ((KANTE - breite) // 2, 0))
            if maske is not None:
                leinwand.putalpha(maske)          # rund: Ecken transparent, Kreis randlos
            ziel_p = zdir / f'zepp-{ziel}-{i:02d}.png'
            leinwand.save(ziel_p)
            print(f'   {p.name} -> {ziel_p.name}')
        if form == 'eckig':
            print(f'   Inhalt {breite}x{KANTE}, {(KANTE - breite) // 2} px Rand je Seite')

    if fehler:
        sys.exit('ABBRUCH:\n  ' + '\n  '.join(fehler))


main()
