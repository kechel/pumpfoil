#!/usr/bin/env python3
"""AppGallery-Screenshots fuer die HUAWEI WATCH 5: 840x840 PNG, quadratisch (AppGallery 13.10.2026:
„Count: 4–8. Recommended resolution: 840 x 840 px. Aspect ratio: 1:1"). Quelle sind die 466x466-Bilder
aus dem DevEco-Emulator (Watch 5), unveraendert hochskaliert — kein Rahmen, keine Schrift, damit
der Pruefer genau das sieht, was die Uhr zeigt.

Aufruf:  ../../server/.venv/bin/python huawei_screens.py   (aus brand/master/)
"""
import os

from PIL import Image

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.abspath(os.path.join(HIER, "../.."))
QUELLE = os.path.join(WURZEL, "screenshots/watch/huawei-arkts-emulator/20261013")
AUS = os.path.join(WURZEL, "brand/stores/huawei/screenshots")
# Reihenfolge = Reihenfolge im Store: erst was die App ausmacht, dann der Ablauf.
BILDER = [
    # Jans Layouts waehrend der Fahrt (REC), ohne die alte Pause-Ueberlappung (Jan: „nur die
    # start/stopp/pause screens ist genau das unwichtigste")
    "Screenshot_2026-10-13T071458.png",   # Boegen Puls/Tempo, 112 bpm / 15.1 km/h
    "Screenshot_2026-10-13T071442.png",   # LAST RUN, vier Felder + Uhrzeit
    "Screenshot_2026-10-13T071501.png",   # Dst/Dur/Hr/Avg in Farbe
    "Screenshot_2026-10-13T071449.png",   # on foil 0:31 / HR 112
    "Screenshot_2026-10-13T071445.png",   # drei Spalten letzter Lauf/Puls + Uhrzeit
    "Screenshot_2026-10-13T071556.png",   # Pause-Layout mit Boegen, 18.6 km/h
    "Screenshot_2026-10-13T072200.png",   # Zusammenfassung nach dem Stopp, alles gesendet
    "Screenshot_2026-10-13T071131.png",   # Startbildschirm
]
N = 840


def main():
    os.makedirs(AUS, exist_ok=True)
    for i, name in enumerate(BILDER, 1):
        im = Image.open(os.path.join(QUELLE, name)).convert("RGB")
        im.resize((N, N), Image.LANCZOS).save(os.path.join(AUS, f"{i:02d}.png"), optimize=True)
    print(AUS)


if __name__ == "__main__":
    main()
