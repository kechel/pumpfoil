#!/usr/bin/env python3
"""Profilbilder fuer einen weiteren Social-Kanal (Anlass: Kwai/Brasilien).

Erzeugt zwei Dateien nach ../social/:
  kanal-avatar-1024.png   quadratisch, Wellen mittig auf Navy — haelt auch als Kreis
  kanal-cover-1600.png    quadratisch mit grosszuegiger Schutzzone: der Inhalt sitzt in
                          der Mitte, damit jeder Zuschnitt (breiter Streifen, Hochkant,
                          Kreis) das Lockup behaelt

Warum quadratisch statt im Zielformat: Kwais Profilmasse sind nicht oeffentlich
dokumentiert und die App schneidet je nach Geraet anders zu. Ein Quadrat mit Inhalt in der
Mitte ueberlebt jeden dieser Zuschnitte; sobald das echte Mass bekannt ist, ist hier eine
Zeile zu aendern.

Aufruf:  python3 kanal-profil.py

Bewusst OHNE cairosvg/gen.py — wie endcard-band.py, damit es auch auf dem Mac laeuft.
"""
import os

from PIL import Image, ImageDraw

HIER = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HIER, "..", "logo", "logo-{art}-{theme}.png")
OUT = os.path.join(HIER, "..", "social", "kanal-{was}.png")

AVATAR = 1024
COVER = 1600
DUNKEL = ("#020617", "#061226", "#0a1f3a")
CYAN = "#22d3ee"


def _hex(s: str) -> tuple[int, int, int]:
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def verlauf(farben: tuple[str, str, str], w: int, h: int) -> Image.Image:
    """Diagonaler Dreiton-Verlauf wie im Banner.

    Klein gerechnet und hochskaliert: bei 1600x1600 waere Pixel fuer Pixel in Python zu
    langsam, und ein weicher Verlauf verliert beim Skalieren nichts.
    """
    n = 64
    c0, c1, c2 = (_hex(f) for f in farben)
    klein = Image.new("RGB", (n, n))
    d = ImageDraw.Draw(klein)
    for y in range(n):
        for x in range(n):
            t = ((x / n) + (y / n)) / 2.0
            if t < 0.55:
                lo, hi, seg = c0, c1, t / 0.55
            else:
                lo, hi, seg = c1, c2, (t - 0.55) / 0.45
            d.point((x, y), fill=tuple(round(a + (b - a) * seg) for a, b in zip(lo, hi)))
    return klein.resize((w, h), Image.BICUBIC)


def wasserzeichen(grund: Image.Image, welle: Image.Image, deckkraft: float,
                  stellen: list) -> None:
    """Dieselbe Welle sehr leise als Struktur im Hintergrund (wie in endcard.py)."""
    for (x, y, groesse) in stellen:
        w = welle.resize((groesse, groesse), Image.LANCZOS)
        a = w.split()[3].point(lambda v: int(v * deckkraft))
        w.putalpha(a)
        lage = Image.new("RGBA", grund.size, (0, 0, 0, 0))
        lage.alpha_composite(w, (x, y))
        grund.alpha_composite(lage)


def wellen() -> Image.Image:
    """Nur das Wellenzeichen, freigestellt.

    logo-icon-*.png bringt die abgerundete App-Kachel mit — auf eigenem Grund waere das
    eine Kachel in der Kachel. Also aus dem waagerechten Lockup schneiden: dort steht das
    Zeichen links, getrennt durch die erste voll durchsichtige Spalte.
    """
    im = Image.open(LOGO.format(art="horizontal", theme="dark")).convert("RGBA")
    im = im.crop(im.getbbox())
    alpha = im.split()[3]
    leer = None
    for x in range(im.width):
        if max(alpha.crop((x, 0, x + 1, im.height)).getdata()) < 8:
            leer = x
            break
    z = im.crop((0, 0, leer or im.width, im.height))
    return z.crop(z.getbbox())


def avatar() -> Image.Image:
    """Nur die Wellen, mittig, mit Luft zum Rand — der Kreiszuschnitt darf nichts abschneiden."""
    bild = verlauf(DUNKEL, AVATAR, AVATAR).convert("RGBA")
    welle = wellen()
    # 58 % Durchmesser: im Kreis bleibt ringsum sichtbar Luft, auch bei knappem Zuschnitt.
    breite = round(AVATAR * 0.58)
    welle = welle.resize((breite, round(welle.height * breite / welle.width)), Image.LANCZOS)
    bild.alpha_composite(welle, ((AVATAR - welle.width) // 2, (AVATAR - welle.height) // 2))
    return bild.convert("RGB")


def cover() -> Image.Image:
    bild = verlauf(DUNKEL, COVER, COVER).convert("RGBA")
    welle = wellen()
    wasserzeichen(bild, welle, 0.10,
                  [(-260, -180, 1100), (COVER - 840, COVER - 920, 1100)])

    lock = Image.open(LOGO.format(art="horizontal", theme="dark")).convert("RGBA")
    lock = lock.crop(lock.getbbox())
    # 52 % der Breite: ein 9:16-Ausschnitt aus dem Quadrat ist 900 px breit — das Lockup
    # bleibt darin ganz sichtbar.
    breite = round(COVER * 0.52)
    lock = lock.resize((breite, round(lock.height * breite / lock.width)), Image.LANCZOS)
    bild.alpha_composite(lock, ((COVER - lock.width) // 2, (COVER - lock.height) // 2))
    return bild.convert("RGB")


def main() -> None:
    os.makedirs(os.path.dirname(OUT.format(was="x")), exist_ok=True)
    for was, bild in (("avatar-1024", avatar()), ("cover-1600", cover())):
        ziel = os.path.normpath(OUT.format(was=was))
        bild.save(ziel)
        print(f"{ziel}  ({bild.width}x{bild.height})")


if __name__ == "__main__":
    main()
