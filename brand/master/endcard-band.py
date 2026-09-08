#!/usr/bin/env python3
"""Endcard als UNTERES DRITTEL (1080x1920, transparent darueber) — hell und dunkel.

Gegenstueck zu `endcard.py`: die volle Endcard deckt das Bild ganz zu, diese hier nimmt nur das
untere Drittel ein, damit das Video weiterlaeuft, waehrend die App beworben wird (Jan, 06.09.).
Dafuer faellt die ganze Uhrenliste weg — in einem Drittel ist kein Platz fuer neun Markennamen,
und die Aussage traegt ohnehin die Zeile darunter.

Aufruf:  python3 endcard-band.py        (erzeugt beide Fassungen nach ../social/)

Bewusst OHNE cairosvg/gen.py: das Lockup kommt als fertiges PNG aus brand/logo/, damit das
Skript auch auf Jans Mac laeuft (dort fehlt die SVG-Kette, die `endcard.py` braucht).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
BAND_H = H // 3                 # exakt das untere Drittel
RAND = 90                       # seitlicher Rand wie in endcard.py
KANTE = 8                       # Cyan-Kante als Trennung zum Video darueber
# Logo und Zeile nur in der OBEREN HAELFTE des Streifens. Die untere Haelfte
# belegen auf allen Plattformen fremde Elemente: bei YouTube Kanalbild, Handle
# und Videotitel, bei Instagram und TikTok Caption und Knoepfe (Jan, 08.09. —
# vorher lag "@pumpfoil-org" genau auf der Zeile FREE APP & COMMUNITY).
INHALT_ANTEIL = 0.5

HIER = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HIER, "..", "logo", "logo-horizontal-{theme}.png")
OUT = os.path.join(HIER, "..", "social", "shorts-endcard-band-{theme}-1080x1920.png")

HELL = ("#ffffff", "#eef2f7", "#dde7f0")
DUNKEL = ("#020617", "#061226", "#0a1f3a")
CYAN = "#22d3ee"
CYAN_HELL = "#0e7490"           # auf Weiss ist das Marken-Cyan zu blass
APP_ZEILE = "FREE APP & COMMUNITY"

# Schrift: auf der VM dieselbe wie in allen anderen Brand-Assets (Montserrat), auf dem Mac die
# Markenschrift aus docs/BRAND.md. Der Rest ist Notnagel, damit das Skript nirgends abbricht.
SCHRIFTEN = [
    ("/usr/share/fonts/opentype/montserrat/Montserrat-SemiBold.otf", 0),
    ("/System/Library/Fonts/Avenir Next.ttc", 2),          # Demi Bold (Index 4 waere Italic)
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 0),
]


def _hex(s: str) -> tuple[int, int, int]:
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def schrift(px: int) -> ImageFont.FreeTypeFont:
    for pfad, index in SCHRIFTEN:
        if os.path.exists(pfad):
            try:
                return ImageFont.truetype(pfad, px, index=index)
            except OSError:
                continue
    raise SystemExit("Keine passende Schrift gefunden — siehe SCHRIFTEN oben.")


def gesperrt(text: str, px: int, tracking: int, farbe: str) -> Image.Image:
    """Versalien mit Sperrung, Zeichen fuer Zeichen — wie banner.subline_image."""
    f = schrift(px)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    breiten = [probe.textlength(ch, font=f) + tracking for ch in text]
    asc, desc = f.getmetrics()
    img = Image.new("RGBA", (max(1, round(sum(breiten))), asc + desc), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = 0.0
    for ch, b in zip(text, breiten):
        d.text((x, 0), ch, font=f, fill=_hex(farbe))
        x += b
    return img.crop(img.getbbox() or (0, 0, img.width, img.height))


def verlauf(farben: tuple[str, str, str], w: int, h: int) -> Image.Image:
    """Derselbe diagonale Dreiton-Verlauf wie in endcard.py, nur fuer den Streifen.

    Ohne numpy: der Streifen ist klein genug, dass zeilenweises Zeichnen reicht.
    """
    c0, c1, c2 = (_hex(f) for f in farben)
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        # je Zeile ein waagerechter Verlauf: t laeuft ueber x UND y wie im Original
        for x in range(0, w, 4):
            t = ((x / w) + (y / h)) / 2.0
            if t < 0.55:
                lo, hi, seg = c0, c1, t / 0.55
            else:
                lo, hi, seg = c1, c2, (t - 0.55) / 0.45
            d.rectangle([x, y, x + 3, y],
                        fill=tuple(round(a + (b - a) * seg) for a, b in zip(lo, hi)))
    return img


def band(theme: str) -> Image.Image:
    hell = theme == "light"
    bild = Image.new("RGBA", (W, H), (0, 0, 0, 0))     # oben durchsichtig: das Video bleibt sichtbar
    streifen = verlauf(HELL if hell else DUNKEL, W, BAND_H).convert("RGBA")
    bild.alpha_composite(streifen, (0, H - BAND_H))

    # Kante nach oben: trennt den Streifen sauber vom Bild, statt ihn ausfransen zu lassen.
    d = ImageDraw.Draw(bild)
    d.rectangle([0, H - BAND_H, W, H - BAND_H + KANTE - 1],
                fill=_hex(CYAN_HELL if hell else CYAN))

    lock = Image.open(LOGO.format(theme="light" if hell else "dark")).convert("RGBA")
    breite = W - 2 * RAND
    lock = lock.resize((breite, round(lock.height * breite / lock.width)), Image.LANCZOS)
    zeile = gesperrt(APP_ZEILE, 52, 12, CYAN_HELL if hell else "#cbd5e1")
    z_faktor = (breite * 0.78) / zeile.width
    zeile = zeile.resize((round(zeile.width * z_faktor), round(zeile.height * z_faktor)),
                         Image.LANCZOS)

    # Mittig in der oberen Haelfte des Streifens — die untere bleibt den
    # Bedienelementen der Plattformen. Passt der Block nicht hinein, schrumpft
    # er als Ganzes: lieber etwas kleiner als in fremde Elemente hineinragen.
    abstand = 46
    frei = round(BAND_H * INHALT_ANTEIL) - KANTE
    block = lock.height + abstand + zeile.height
    if block > frei:
        f = (frei * 0.94) / block          # 6 % Luft, sonst klebt es an der Kante
        abstand = round(abstand * f)
        lock = lock.resize((round(lock.width * f), round(lock.height * f)), Image.LANCZOS)
        zeile = zeile.resize((round(zeile.width * f), round(zeile.height * f)), Image.LANCZOS)
        block = lock.height + abstand + zeile.height
    y = H - BAND_H + KANTE + max(0, (frei - block) // 2)
    bild.alpha_composite(lock, ((W - lock.width) // 2, y))
    y += lock.height + abstand
    bild.alpha_composite(zeile, ((W - zeile.width) // 2, y))
    return bild


def main() -> None:
    os.makedirs(os.path.dirname(OUT.format(theme="dark")), exist_ok=True)
    for theme in ("dark", "light"):
        ziel = os.path.normpath(OUT.format(theme=theme))
        band(theme).save(ziel)
        print(f"{ziel}  ({W}x{H}, unteres Drittel, oben transparent)")


if __name__ == "__main__":
    main()
