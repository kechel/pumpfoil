#!/usr/bin/env python3
"""Baut die 360x360-Store-Vorschauen fuer ECKIGE Zepp-OS-Geraete.

Vorgabe (docs.zepp.com/docs/distribute): 360x360 PNG mit transparentem Hintergrund;
bei eckigen Geraeten der Screenshot in **voller Hoehe** mit **gleichem Rand links und rechts**.

Bei 390x450 heisst das rein rechnerisch: Hoehe 450 -> 360, Breite 390 -> 312,
also 24 px transparenter Rand je Seite. Kein Zuschnitt, keine Formerkennung, keine Heuristik.

Genau da lag der Fehler der ersten Fassung: sie hat die Bildform ueber den Alphakanal
gesucht. Deckende Rohbilder haben aber gar keinen Alphakanal-Inhalt, also war die
"gefundene" Box immer die ganze Leinwand -> alles wurde gestaucht statt zugeschnitten.
Deshalb prueft dieses Skript das Seitenverhaeltnis und bricht ab, statt still etwas
Falsches zu erzeugen: ein Fenster-Mitschnitt (schwarzer Rand um das Display) hat nicht
390:450 und wuerde sonst genauso verzerrt landen.

Aufruf:
    python3 scripts/zepp-store-previews.py <roh-verzeichnis>

Erwartet dort 11 PNG (alphabetisch = Reihenfolge im Store), jedes ein exakter
Display-Auszug eines eckigen Geraets. Schreibt nach
screenshots/watch/zepp/store360/eckig/zepp-eckig-NN.png.

Der RUNDE Satz wird nicht angefasst — der ist von Zepp bereits abgenommen.
"""
import pathlib
import sys

from PIL import Image

KANTE = 360           # Store-Leinwand
SEITE = (390, 450)    # eckiges Zepp-OS-Ziel (app.json: st "s", dw 390)
ZIEL = pathlib.Path(__file__).resolve().parent.parent / 'screenshots/watch/zepp/store360/eckig'


def vorschau(roh: Image.Image) -> Image.Image:
    """Volle Hoehe auf 360 skalieren, mittig auf transparente 360x360-Leinwand."""
    breite = round(roh.width * KANTE / roh.height)
    skaliert = roh.convert('RGBA').resize((breite, KANTE), Image.LANCZOS)
    leinwand = Image.new('RGBA', (KANTE, KANTE), (0, 0, 0, 0))
    leinwand.paste(skaliert, ((KANTE - breite) // 2, 0), skaliert)
    return leinwand


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(f'Aufruf: {sys.argv[0]} <roh-verzeichnis>')
    quelle = pathlib.Path(sys.argv[1])
    rohbilder = sorted(p for p in quelle.iterdir() if p.suffix.lower() == '.png')
    if not rohbilder:
        sys.exit(f'keine PNG in {quelle}')

    soll = SEITE[0] / SEITE[1]
    falsch = []
    for p in rohbilder:
        with Image.open(p) as im:
            if abs(im.width / im.height - soll) > 0.01:
                falsch.append(f'  {p.name}: {im.width}x{im.height}')
    if falsch:
        sys.exit(
            f'Seitenverhaeltnis nicht {SEITE[0]}:{SEITE[1]} — das sind keine reinen\n'
            'Display-Ausschnitte (Fenster-Mitschnitt?). Skalieren wuerde verzerren:\n'
            + '\n'.join(falsch)
        )

    ZIEL.mkdir(parents=True, exist_ok=True)
    for i, p in enumerate(rohbilder, 1):
        with Image.open(p) as roh:
            aus = ZIEL / f'zepp-eckig-{i:02d}.png'
            vorschau(roh).save(aus)
            print(f'  {p.name} -> {aus.name}')
    print(f'{len(rohbilder)} Vorschauen in {ZIEL}')


main()
