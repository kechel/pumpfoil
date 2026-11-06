#!/usr/bin/env python3
"""UserPromptSubmit-Hook: zu jeder Nachricht von Jan die passendsten Stellen aus dem Projekt-Atlas (06.11.2026).

Jan: „pruefst du das jetzt automatisch wenn ich irgendwas will was wir schon laenger nicht mehr im context hatten?" —
die Regel in CLAUDE.md („erst scripts/kontext.py") war nur eine Anweisung. Dieser Hook macht sie zur Gewohnheit, die
nicht vergessen werden kann: er sucht mit dem Text der Nachricht und legt eine kurze Uebersicht (Titel + Fundstelle,
kein Volltext) in den Kontext. Was davon zaehlt, entscheidet Claude; Volltext ueber `scripts/kontext.py --voll <nr>`.

Kurze Nachrichten („ok", „ja passt") und reine Bilder ueberspringt er. Faellt irgendetwas aus, schweigt er (exit 0):
ein Hook darf die Unterhaltung nie blockieren.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

KONTEXT = Path(__file__).resolve().parents[1] / "kontext.py"
MIN_WOERTER = 4
TREFFER = 10
# Fuellwoerter raus, damit die Volltextsuche an den Sachwoertern haengt (die Vektorsuche bekommt den ganzen Satz).
STOPP = set("""der die das und oder aber auch noch schon mal bitte ich du wir ihr sie er es ein eine einen einem einer
ist sind war hat haben wird werden kann koennen soll sollen mit von fuer für auf aus bei nach vor zu zum zur im in an am
dass wenn wie was wo warum nicht nur ja nein ok gut so dann denn doch hier da the and or but is are to of for on in it
this that with mal gerade jetzt eigentlich irgendwie vielleicht machen mach bau gib zeig sag schau wieder geht ging
nochmal einmal einmalig danke klar super prima perfekt okay alles immer etwas sehr viel mehr weiter gleich""".split())


def main() -> None:
    try:
        daten = json.load(sys.stdin)
    except ValueError:
        return
    text = str(daten.get("prompt") or "")
    # eingefuegte Bloecke und Pfade zu Bildern nicht mitsuchen, Laenge deckeln
    text = re.sub(r"\[Image[^\]]*\]|/tmp/\S+|https?://\S+", " ", text)[:600]
    woerter = [w for w in re.findall(r"[\wäöüÄÖÜß.-]{3,}", text.lower()) if w not in STOPP]
    # Plaudersaetze („ok geht wieder, war nur einmalig") loesten sonst zehn beliebige Treffer aus (06.11.2026):
    # mindestens zwei Sachwoerter ab 5 Zeichen.
    if len(re.findall(r"\w+", text)) < MIN_WOERTER or len([w for w in woerter if len(w) >= 5]) < 2:
        return
    # die laengsten Sachwoerter als einzelne Stichpunkte (ODER), dazu der ganze Satz fuer die Vektorsuche
    stich = sorted(set(woerter), key=len, reverse=True)[:8]
    try:
        r = subprocess.run([sys.executable, str(KONTEXT), "--kurz", str(TREFFER), ", ".join(stich + [text.strip()])],
                           capture_output=True, text=True, timeout=12)
    except (subprocess.TimeoutExpired, OSError):
        return
    liste = r.stdout.strip()
    if r.returncode != 0 or not liste:
        return
    print("Projekt-Atlas (automatisch zu dieser Nachricht, scripts/kontext.py) — passende Stellen, nur pruefen was zum "
          "Thema gehoert; Volltext: scripts/kontext.py --voll <nr>:\n" + liste)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
