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
QUELLE = os.path.join(WURZEL, "screenshots/watch/huawei-arkts-emulator/20261013-chat")
AUS = os.path.join(WURZEL, "brand/stores/huawei/screenshots")
# Reihenfolge = Reihenfolge im Store: erst was die App ausmacht, dann der Ablauf.
BILDER = [
    "09-pause-uhr-letzter-lauf.png",
    "16-fertig-zusammenfassung.png",
    "11-stopp-18-32.png",
    "19-pausiert-neu.png",
    "03-start-ungekoppelt.png",
    "05-einstellungen-2.png",
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
