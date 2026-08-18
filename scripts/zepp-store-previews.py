#!/usr/bin/env python3
"""Zepp-Store-Vorschaubilder aus den Roh-Screenshots erzeugen — runde UND eckige Geräte.

WARUM ES DAS GIBT: Zepp hat 1.0.5 am 18.08.2026 abgelehnt, weil die eckigen Vorschaubilder die
Vorgabe verletzten. Nachgemessen waren alle 11 Bilder im `eckig/`-Satz **vollständig deckend** und
**randlos** — die Vorgabe verlangt aber einen transparenten Hintergrund und bei eckigen Geräten
gleiche Ränder links und rechts.

DIE REGEL (docs.zepp.com/docs/distribute):
  * 360×360 px PNG, **transparenter** Hintergrund, keine Füllfarbe.
  * Rund:  die Oberfläche randlos zentriert.
  * Eckig: die Oberfläche auf **volle Höhe**, mit **gleichem Rand links und rechts**.
  * 3 oder mehr Bilder empfohlen.

WIE DAS EIGENE GERÄT AUSSIEHT: `watch-zepp/app.json` deklariert die eckige Plattform mit `dw: 390`,
und `watch-zepp/page/index.js` behandelt `DW >= 450` als rund. Die HÖHE steht nirgends in unserem
Code, ist aber BELEGT: die offizielle Geräteliste (docs.huami.com) nennt für ALLE sechs eckigen
Zepp-OS-Geräte 390×450 — Active 2 (Square), Bip 6, Active, Cheetah (Square), GTS 4, GTS 3.

KEIN VERZERREN: die Rohbilder sind bereits höher als breit (Inhalt ~1042×1097, Verhältnis 0,95).
Bis zum eckigen Verhältnis 390/450 = 0,867 fehlt wenig, deshalb wird SEITLICH BESCHNITTEN statt
gestaucht — gemessen etwa 4 % je Seite. Ein gestauchtes Vorschaubild zeigt eine Oberfläche, die es
auf keinem Gerät gibt, und kann im nächsten Review erneut auffallen.

Aufruf (rein erzeugend, überschreibt nur die Zielordner):
    python3 scripts/zepp-store-previews.py
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow fehlt: pip install pillow")

WURZEL = Path(__file__).resolve().parent.parent
ROH = WURZEL / "screenshots/watch/zepp/raw"
ZIEL = WURZEL / "screenshots/watch/zepp/store360"

KANTE = 360           # Vorgabe: 360×360-Leinwand
ECKIG_BREITE = 390    # app.json: dw
ECKIG_HOEHE = 450     # belegt, s. Kopf
RAND_RUND = 3         # die bisherigen runden Bilder hatten 3 px — bleibt so


def inhalt(im: Image.Image) -> tuple[int, int, int, int]:
    """Bereich mit sichtbaren Pixeln. Alpha > 16, damit ein Hauch Antialiasing nicht mitzählt."""
    a = im.getchannel("A").point(lambda v: 255 if v > 16 else 0)
    return a.getbbox() or (0, 0, im.width, im.height)


def auf_leinwand(bild: Image.Image, breite: int, hoehe: int) -> Image.Image:
    """Zentriert auf eine TRANSPARENTE 360×360-Leinwand."""
    leinwand = Image.new("RGBA", (KANTE, KANTE), (0, 0, 0, 0))
    skaliert = bild.resize((breite, hoehe), Image.LANCZOS)
    leinwand.paste(skaliert, ((KANTE - breite) // 2, (KANTE - hoehe) // 2), skaliert)
    return leinwand


def eckig(im: Image.Image) -> Image.Image:
    """Volle Höhe, gleiche Ränder links/rechts — SEITLICH beschnitten, nicht gestaucht."""
    l, o, r, u = inhalt(im)
    h = u - o
    soll_breite = round(h * ECKIG_BREITE / ECKIG_HOEHE)
    vorhanden = r - l
    if soll_breite < vorhanden:                      # Seiten wegschneiden
        weg = (vorhanden - soll_breite) // 2
        l, r = l + weg, r - weg
    zuschnitt = im.crop((l, o, r, u))
    ziel_h = KANTE
    ziel_b = round(ziel_h * ECKIG_BREITE / ECKIG_HOEHE)
    return auf_leinwand(zuschnitt, ziel_b, ziel_h)


def rund(im: Image.Image) -> Image.Image:
    """Randlos zentriert (bis auf den bisherigen 3-px-Saum)."""
    kante = KANTE - 2 * RAND_RUND
    return auf_leinwand(im.crop(inhalt(im)), kante, kante)


def main() -> None:
    quellen = sorted(ROH.glob("*.png"))
    if not quellen:
        sys.exit(f"keine Rohbilder in {ROH}")
    for name, macher in (("rund", rund), ("eckig", eckig)):
        ordner = ZIEL / name
        ordner.mkdir(parents=True, exist_ok=True)
        for i, q in enumerate(quellen, 1):
            im = Image.open(q).convert("RGBA")
            ergebnis = macher(im)
            ziel = ordner / f"zepp-{name}-{i:02d}.png"
            ergebnis.save(ziel)
        print(f"{name}: {len(quellen)} Bilder -> {ordner.relative_to(WURZEL)}")
    print("\nGegenprobe:")
    for name in ("rund", "eckig"):
        for p in sorted((ZIEL / name).glob("*.png"))[:1]:
            im = Image.open(p).convert("RGBA")
            a = im.getchannel("A")
            bb = a.getbbox()
            durchsichtig = a.getextrema()[0] == 0
            l, o, r, u = bb
            print(f"  {p.name}: {im.size}, transparent={durchsichtig}, "
                  f"Inhalt {r - l}x{u - o}, Rand L{l} O{o} R{im.width - r} U{im.height - u}")


if __name__ == "__main__":
    main()
