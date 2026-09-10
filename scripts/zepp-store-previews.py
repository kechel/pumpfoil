#!/usr/bin/env python3
"""Baut die 360x360-Store-Vorschauen fuer Zepp OS aus Simulator-Fenster-Mitschnitten.

Vorgabe (docs.zepp.com/docs/distribute, wortlaut):
  - "The output size: 360x360px, format: PNG"
  - "The background of screenshots should be transparent and not have a fill color."
  - rund:  Screenshot mittig auf 360x360 transparent, OHNE Rand ringsum
  - eckig: Screenshot mittig auf 360x360 transparent, gleicher Rand LINKS/RECHTS, oben/unten keiner
Transparenz gilt fuer BEIDE Formen -- der abgenommene runde Satz war genau so.

ACHTUNG, der Link aus der Zepp-Ablehnungsmail
(docs.zepp.com/docs/guides/app-development/app-submission/#preview-images) ist TOT (404, im Browser
wie per Abruf). Gueltig ist der oben genannte Pfad; die neue Doku-Spiegelung traegt denselben Text.

Warum hier gemessen und nicht geschnitzt wird: eine erste Fassung hat die Bildform ueber den
Alphakanal bestimmt. Die Rohbilder sind aber deckend, also war die "Inhalts"-Box immer die ganze
Leinwand und beide Saetze wurden 1:1 gestaucht statt zugeschnitten -- auch der runde, der schon
abgenommen war. Deshalb sucht dieses Skript das Displayfeld ueber die FENSTERSTRUKTUR (heller
Titelbalken, Displayflaeche darunter) und prueft das Ergebnis gegen harte Erwartungen, statt
irgendetwas zu vermuten. Schlaegt eine Pruefung fehl, bricht es ab.

ZWEI FALLEN, die den eckigen Satz zweimal Ablehnung gekostet haben -- deshalb steht das hier:

1. **Die Rohbilder sind macOS-FENSTER-Mitschnitte und tragen Schatten UND runde untere Ecken.**
   `rand_weg` schneidet nur Zeilen/Spalten weg, die ueberwiegend HELL sind -- eine runde Ecke ist
   das nicht, also ueberlebte sie den Zuschnitt. Ergebnis waren Bilder mit scharfen OBEREN und
   runden UNTEREN Ecken (42 halbdurchsichtige Pixel je Datei, Alpha ~44 = Fensterschatten). So
   sieht kein Geraet aus -> Zepp lehnte am 10.09.2026 genau damit ab ("does not comply ... and
   corresponding device shape"). Deshalb wird der Alphakanal des eckigen Satzes jetzt HART gesetzt:
   255 im Inhalt, 0 aussen. Kein Schatten, keine Rundung, keine Teildurchsichtigkeit.

2. **Die Breite muss GERADE sein, sonst ist "an equal margins on the left and right" unmoeglich.**
   Aus dem gemessenen Displayfeld (776x898) fiel `round(776*360/898)` = 311 -> Rand 24/25. Genau
   das war der am 01.09.2026 von Hand geheilte Regelbruch: die eingecheckten Dateien hatten 312,
   dieses Skript haette beim naechsten Lauf wieder 311 erzeugt. Jetzt wird der Zuschnitt vorher auf
   das EXAKTE Geraeteverhaeltnis geschnappt (390:450, das eckige Amazfit -- s.
   watch-zepp/page/index.js:140 "die 390er ist die Ausnahme"), dann faellt 312 zwangslaeufig heraus.

Aufruf (ohne Argumente, Pfade stehen unten). ZEPP_OUT setzt das Ausgabeverzeichnis um, damit man
das Ergebnis erst gegen den eingecheckten Stand vergleichen kann, statt ihn zu ueberschreiben:
    python3 scripts/zepp-store-previews.py
    ZEPP_OUT=/tmp/probe python3 scripts/zepp-store-previews.py
"""
import itertools
import os
import pathlib
import sys

import numpy as np
from PIL import Image

KANTE = 360
# Das eckige Amazfit: 390x450. Daraus die Inhaltsbreite auf 360 Hoehe -- 312, also gerade,
# also gleicher Rand links und rechts (24/24).
GERAET_B, GERAET_H = 390, 450
BREITE_ECKIG = round(KANTE * GERAET_B / GERAET_H)
# Mittlere Pixelabweichung, unter der zwei Aufnahmen als dasselbe Bild gelten.
# Gemessen: das Duplikat lag bei 0.03, das naechstaehnlichste echte Paar bei 4.32.
DUPLIKAT_SCHWELLE = 1.0
WURZEL = pathlib.Path(__file__).resolve().parent.parent
ROH = WURZEL / 'screenshots/watch/zepp/raw'
ZIEL = pathlib.Path(os.environ.get('ZEPP_OUT') or WURZEL / 'screenshots/watch/zepp/store360')
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


def auf_verhaeltnis(feld: tuple[int, int, int, int], w: int, h: int) -> tuple[int, int, int, int]:
    """Eckige Uhr: die Box symmetrisch aufweiten/beschneiden, bis sie GERAET_B:GERAET_H traegt.

    `rand_weg` schneidet ueber die Helligkeit, trifft die Displaykante also auf ein bis drei Pixel
    genau -- gemessen 776x898 = 0.8641 statt 0.8667. Ohne diesen Schnappschritt fiele die
    Zielbreite auf 311 (ungerade -> Rand 24/25, s. Kopf). Mit ihm auf 312.
    """
    x0, y0, x1, y1 = feld
    soll_b = round((y1 - y0) * GERAET_B / GERAET_H)
    mitte = (x0 + x1) / 2
    nx0 = int(round(mitte - soll_b / 2))
    nx1 = nx0 + soll_b
    if nx0 < 0 or nx1 > w:                       # passt seitlich nicht -> ueber die Hoehe loesen
        return x0, y0, x1, y0 + round((x1 - x0) * GERAET_H / GERAET_B)
    return nx0, y0, nx1, y1


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
            with Image.open(p) as im:
                w, h = im.size
            feld = fensterfeld(g)
            if form == 'rund':
                feld = scheibe(g, feld)
            else:
                feld = auf_verhaeltnis(rand_weg(g, feld), w, h)
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
        breite = KANTE if form == 'rund' else BREITE_ECKIG
        if form == 'eckig':
            if breite % 2:
                fehler.append(f'{quelle}: Inhaltsbreite {breite} ist ungerade -> Rand links != rechts')
                continue
            # Alpha des eckigen Satzes HART: 255 im Inhalt, 0 aussen. Damit koennen weder die runden
            # unteren Fensterecken noch der macOS-Schatten aus dem Rohbild durchschlagen (s. Kopf).
            eckmaske = np.zeros((KANTE, KANTE), dtype=np.uint8)
            eckmaske[:, (KANTE - breite) // 2:(KANTE + breite) // 2] = 255
            maske = Image.fromarray(eckmaske)
        fertig = []
        for i, (p, (x0, y0, x1, y1)) in enumerate(felder, 1):
            with Image.open(p) as im:
                # eckig bewusst als RGB: der Alphakanal des Fenster-Mitschnitts (Schatten, runde
                # untere Ecken) wird verworfen und unten neu gesetzt.
                roh = im.convert('RGBA' if form == 'rund' else 'RGB')
                aus = roh.crop((x0, y0, x1, y1)).resize((breite, KANTE), Image.LANCZOS)
            leinwand = Image.new('RGBA', (KANTE, KANTE), (0, 0, 0, 0))
            leinwand.paste(aus, ((KANTE - breite) // 2, 0))
            leinwand.putalpha(maske)   # rund: Kreis randlos · eckig: Rechteck mit gleichem Rand
            fertig.append((i, p, leinwand))

        # 3b) Doppelte Aufnahmen NICHT schreiben -- und die Nummer der uebrigen NICHT verschieben.
        # Anlass: der runde Satz hatte acht Rohbilder, aber zepp-rund-06 war dasselbe Bild wie
        # zepp-rund-01 (mittlere Abweichung 0.03; das naechstaehnlichste echte Paar liegt bei 4.32,
        # also 140x weiter). Am 01.09.2026 wurde es von Hand geloescht und ABSICHTLICH nicht
        # umnummeriert: die Zuordnung rund<->eckig laeuft ueber die Nummer, Umnummerieren wuerde sie
        # verschieben. Ein Lauf dieses Skripts hat das Duplikat vorher wieder angelegt.
        # Zepp verlangt ungeschrieben, dass rund und eckig INHALTLICH DIESELBEN Bildschirme zeigen
        # (kam aus einer frueheren Ablehnung, steht in keiner Doku) -- ein zweites Bild desselben
        # Bildschirms zaehlt dabei nicht mit.
        felder_arr = {i: np.asarray(im.convert('RGBA'), dtype=np.int16) for i, _, im in fertig}
        doppelt = {}
        for (i, _, _), (j, _, _) in itertools.combinations(fertig, 2):
            if i in doppelt or j in doppelt:
                continue
            d = float(np.abs(felder_arr[i] - felder_arr[j]).mean())
            if d < DUPLIKAT_SCHWELLE:
                doppelt[j] = (i, d)
        for i, p, leinwand in fertig:
            if i in doppelt:
                vor, d = doppelt[i]
                print(f'   {p.name} -> zepp-{ziel}-{i:02d}.png UEBERSPRUNGEN, '
                      f'Duplikat von {vor:02d} (Abweichung {d:.2f}) — Nummer bleibt frei')
                continue
            ziel_p = zdir / f'zepp-{ziel}-{i:02d}.png'
            leinwand.save(ziel_p)
            print(f'   {p.name} -> {ziel_p.name}')

        # 4) Ergebnis nachmessen, statt es zu glauben -- eine falsche Datei kostet eine Store-Runde.
        for ziel_p in sorted(zdir.glob(f'zepp-{ziel}-*.png')):
            a = np.asarray(Image.open(ziel_p).convert('RGBA'))
            if a.shape[:2] != (KANTE, KANTE):
                fehler.append(f'{ziel_p.name}: {a.shape[1]}x{a.shape[0]} statt {KANTE}x{KANTE}')
                continue
            al = a[..., 3]
            ys, xs = np.where(al > 0)
            l, r = int(xs.min()), int(KANTE - xs.max() - 1)
            o, u = int(ys.min()), int(KANTE - ys.max() - 1)
            if form == 'eckig':
                teil = int(((al > 0) & (al < 255)).sum())
                if teil:
                    fehler.append(f'{ziel_p.name}: {teil} halbdurchsichtige Pixel (Fensterrundung/Schatten?)')
                if l != r or o or u:
                    fehler.append(f'{ziel_p.name}: Rand l/r/o/u = {l}/{r}/{o}/{u}, erwartet gleich l/r und 0 o/u')
            elif (l, r, o, u) != (0, 0, 0, 0):
                fehler.append(f'{ziel_p.name}: Rand l/r/o/u = {l}/{r}/{o}/{u}, rund erwartet 0 ringsum')
        if form == 'eckig':
            print(f'   Inhalt {breite}x{KANTE}, {(KANTE - breite) // 2} px Rand je Seite, '
                  f'Verhaeltnis {breite / KANTE:.5f} (Geraet {GERAET_B}/{GERAET_H} = {GERAET_B / GERAET_H:.5f})')

    if fehler:
        sys.exit('ABBRUCH:\n  ' + '\n  '.join(fehler))
    print('alle Vorschauen nachgemessen: in Ordnung')


main()
