#!/usr/bin/env python3
"""Illustration fuer das Suunto-Partner-Listing (1125 px breit, Hoehe frei).

Suunto verlangt: Breite 1125 px, Seitenverhaeltnis hoechstens 1:3, und ueber dem Bild schwebt
IHR „Connect"-Knopf — deshalb bleibt unten ein ruhiger Streifen frei.

Marken-Regeln (docs/BRAND.md): FLACHE Farben, keine Verlaeufe. Navy #020617, Cyan #22d3ee,
Text weiss, Tagline/Labels slate. Das Lockup kommt aus gen.py (nie von Hand nachbauen).

Aufruf aus brand/master/:  ../../server/.venv/bin/python suunto-hero.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont
import gen

W, H = 1125, 1400
OUT = os.path.join(os.path.dirname(__file__), "../stores/suunto/illustration-1125.png")
NAVY, CYAN, WHITE = "#020617", "#22d3ee", "#ffffff"
CARD, LINE, SLATE, SLATE_DIM = "#0b1220", "#1e293b", "#94a3b8", "#64748b"
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf"

def font(size, bold=False):
    return ImageFont.truetype(F % ("-Bold" if bold else ""), size)

def mitte(d, text, y, f, fill):
    b = d.textbbox((0, 0), text, font=f)
    d.text(((W - (b[2] - b[0])) / 2 - b[0], y), text, font=f, fill=fill)
    return b[3] - b[1]

# Was die Integration dem Suunto-Nutzer liefert — die Kennzahlen, die eine allgemeine
# Sportplattform NICHT hat. Werte illustrativ, in derselben Groessenordnung wie die
# Store-Screenshots.
KACHELN = [
    ("5", "runs detected"), ("1:04", "longest run"), ("24.2 km/h", "top speed"),
    ("249 m", "farthest run"), ("1.24 Hz", "pump cadence"), ("3.1 m", "per pump"),
]

def main():
    img = Image.new("RGBA", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    # Kanonische Wellen als sehr dezentes Wasserzeichen (kein Verlauf, nur Deckkraft).
    wm = gen.render_waves(CYAN, 620)
    # Deckkraft niedrig halten und das untere Wasserzeichen ueber den Fusstext heben — der
    # ruhige Streifen unten gehoert Suuntos schwebendem „Connect"-Knopf.
    for (x, y) in ((-170, -110), (W - wm.width + 200, H - wm.height - 230)):
        f = wm.copy(); f.putalpha(f.split()[3].point(lambda v: int(v * 0.05)))
        img.alpha_composite(f, (x, y))

    # Lockup (Wellen + pumpfoil.org + TRACK EVERY PUMP) aus der Marken-Basis.
    lock = gen.build_fit("stacked", "dark", tagline=True)
    bw = 560
    lock = lock.resize((bw, round(lock.height * bw / lock.width)), Image.LANCZOS)
    img.alpha_composite(lock, ((W - bw) // 2, 90))

    # Kopfzeile, zweizeilig. Die Bezugshoehen bewusst aus EINER Variablen ableiten — der
    # Cyan-Strich lag beim ersten Versuch quer in der zweiten Zeile, weil er auf die ERSTE
    # bezogen war.
    kopf = 90 + lock.height + 90
    zeile = 76                     # Zeilenabstand der Kopfzeile
    mitte(d, "Your Suunto workouts,", kopf, font(58, True), WHITE)
    mitte(d, "analysed for pump foiling.", kopf + zeile, font(58, True), WHITE)
    # Kurzer Cyan-Strich UNTER der zweiten Zeile — dasselbe Motiv wie auf den Store-Screenshots.
    strich = kopf + 2 * zeile + 34
    d.rounded_rectangle([W // 2 - 46, strich, W // 2 + 46, strich + 6], radius=3, fill=CYAN)

    y = strich + 58
    mitte(d, "Connect once — every new workout is imported", y, font(31), SLATE)
    mitte(d, "automatically and broken down run by run.", y + 44, font(31), SLATE)
    y += 44 + 96

    # Kennzahlen-Kacheln, flach, 3 Spalten x 2 Zeilen.
    pad, gap = 70, 22
    cw = (W - 2 * pad - 2 * gap) // 3
    ch = 150
    for i, (wert, label) in enumerate(KACHELN):
        cx = pad + (i % 3) * (cw + gap)
        cy = y + (i // 3) * (ch + gap)
        d.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=22, fill=CARD, outline=LINE, width=2)
        fw = font(46, True)
        b = d.textbbox((0, 0), wert, font=fw)
        d.text((cx + (cw - (b[2] - b[0])) / 2 - b[0], cy + 34), wert, font=fw, fill=CYAN)
        fl = font(26)
        b2 = d.textbbox((0, 0), label, font=fl)
        d.text((cx + (cw - (b2[2] - b2[0])) / 2 - b2[0], cy + 100), label, font=fl, fill=SLATE)
    y += 2 * ch + gap + 92

    d.line([(pad + 180, y), (W - pad - 180, y)], fill=LINE, width=2)
    y += 46
    mitte(d, "Web · iPhone · Android · Garmin · Wear OS · Apple Watch · Amazfit",
          y, font(26), SLATE_DIM)
    mitte(d, "Free. No ads, no tracking, no cookies.", y + 44, font(26), SLATE_DIM)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.convert("RGB").save(OUT)
    print("%s  %dx%d  %.0f KB" % (OUT, W, H, os.path.getsize(OUT) / 1024))

if __name__ == "__main__":
    main()
