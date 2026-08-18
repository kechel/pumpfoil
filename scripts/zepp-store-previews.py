#!/usr/bin/env python3
"""Baut die 360x360-Store-Vorschauen fuer ECKIGE Zepp-OS-Geraete.

Vorgabe (docs.zepp.com/docs/distribute): 360x360 PNG mit transparentem Hintergrund;
bei eckigen Geraeten der Screenshot in **voller Hoehe** mit **gleichem Rand links und rechts**.

Bei 384x432 heisst das rein rechnerisch: Hoehe 432 -> 360, Breite 384 -> 320,
also 20 px transparenter Rand je Seite. Kein Zuschnitt, keine Formerkennung, keine Heuristik.

Genau da lag der Fehler der ersten Fassung: sie hat die Bildform ueber den Alphakanal
gesucht. Deckende Rohbilder haben aber gar keinen Alphakanal-Inhalt, also war die
"gefundene" Box immer die ganze Leinwand -> alles wurde gestaucht statt zugeschnitten.
Damit derselbe Fehler nicht anders wiederkommt, wird die Displaygroesse NICHT erraten,
sondern uebergeben, und jedes Rohbild muss exakt so gross sein. Ein Fenster-Mitschnitt
(Display mit schwarzem Rand drumrum, z. B. 1184x1240) hat eine andere Groesse und fliegt
damit auf, ohne dass das Skript ueber Bildinhalte spekulieren muss.

Aufruf:
    python3 scripts/zepp-store-previews.py <roh-verzeichnis> <breite>x<hoehe>

z. B. `... raw-eckig 384x432`. Erwartet dort 11 PNG (alphabetisch = Reihenfolge im Store),
jedes ein exakter Display-Auszug eines eckigen Geraets. Schreibt nach
screenshots/watch/zepp/store360/eckig/zepp-eckig-NN.png.

Der RUNDE Satz wird nicht angefasst — der ist von Zepp bereits abgenommen.
"""
import pathlib
import sys

from PIL import Image

KANTE = 360           # Store-Leinwand
ZIEL = pathlib.Path(__file__).resolve().parent.parent / 'screenshots/watch/zepp/store360/eckig'


def vorschau(roh: Image.Image) -> Image.Image:
    """Volle Hoehe auf 360 skalieren, mittig auf transparente 360x360-Leinwand."""
    breite = round(roh.width * KANTE / roh.height)
    skaliert = roh.convert('RGBA').resize((breite, KANTE), Image.LANCZOS)
    leinwand = Image.new('RGBA', (KANTE, KANTE), (0, 0, 0, 0))
    leinwand.paste(skaliert, ((KANTE - breite) // 2, 0), skaliert)
    return leinwand


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(f'Aufruf: {sys.argv[0]} <roh-verzeichnis> <breite>x<hoehe>   (z. B. 384x432)')
    quelle = pathlib.Path(sys.argv[1])
    try:
        bt, ht = (int(v) for v in sys.argv[2].lower().split('x'))
    except ValueError:
        sys.exit(f'Groesse nicht lesbar: {sys.argv[2]!r} — erwartet z. B. 384x432')
    rohbilder = sorted(p for p in quelle.iterdir() if p.suffix.lower() == '.png')
    if not rohbilder:
        sys.exit(f'keine PNG in {quelle}')

    falsch = []
    for p in rohbilder:
        with Image.open(p) as im:
            if (im.width, im.height) != (bt, ht):
                falsch.append(f'  {p.name}: {im.width}x{im.height}')
    if falsch:
        sys.exit(
            f'Nicht genau {bt}x{ht} — das sind keine reinen Display-Ausschnitte\n'
            '(Fenster-Mitschnitt?). Skalieren wuerde verzerren:\n' + '\n'.join(falsch)
        )
    rand = (KANTE - round(bt * KANTE / ht)) // 2
    print(f'{bt}x{ht} -> Inhalt {round(bt * KANTE / ht)}x{KANTE}, {rand} px Rand je Seite')

    ZIEL.mkdir(parents=True, exist_ok=True)
    for i, p in enumerate(rohbilder, 1):
        with Image.open(p) as roh:
            aus = ZIEL / f'zepp-eckig-{i:02d}.png'
            vorschau(roh).save(aus)
            print(f'  {p.name} -> {aus.name}')
    print(f'{len(rohbilder)} Vorschauen in {ZIEL}')


main()
