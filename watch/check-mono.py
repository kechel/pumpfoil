#!/usr/bin/env python3
"""Stimmt die Farb-Einteilung der monkey.jungle mit dem SDK ueberein?

Die Uhren mit 1-Bit-Display (SDK `compiler.json`: `bitsPerPixel: 1`) muessen `farbig`
ausschliessen, alle anderen `mono` — sonst zeichnet eine Schwarz-Weiss-Uhr Gruen/Rot als Schwarz
auf Schwarz (s. source/Farbe.mc). Die Liste pflegt NIEMAND von Hand: dieses Skript liest sie aus
dem SDK und bricht ab, wenn die Jungle nicht passt. `build-all.sh` ruft es vor dem Bauen auf.

Aufruf:  watch/check-mono.py [DEVDIR]      (Standard ~/.Garmin/ConnectIQ/Devices)
"""
import json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
devdir = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.Garmin/ConnectIQ/Devices")
geraete = re.findall(r'<iq:product id="([^"]+)"', open(os.path.join(here, "manifest.xml")).read())

base = None
eigen = {}
for zeile in open(os.path.join(here, "monkey.jungle")):
    m = re.match(r"\s*([A-Za-z0-9_]+)\.excludeAnnotations\s*=\s*(\S+)", zeile)
    if m:
        werte = set(m.group(2).split(";"))
        if m.group(1) == "base":
            base = werte
        else:
            eigen[m.group(1)] = werte

fehler = []
fehlt_sdk = []
for g in geraete:
    cj = os.path.join(devdir, g, "compiler.json")
    if not os.path.exists(cj):
        fehlt_sdk.append(g)
        continue
    mono = (json.load(open(cj)).get("bitsPerPixel") or 8) <= 1
    aus = eigen.get(g, base or set())
    if mono and "farbig" not in aus:
        fehler.append(f"{g}: 1-Bit-Display, schliesst aber `farbig` nicht aus (braucht eine eigene Zeile mit ;farbig)")
    if not mono and "mono" not in aus:
        fehler.append(f"{g}: farbig, schliesst aber `mono` nicht aus")
    if mono and "mono" in aus:
        fehler.append(f"{g}: 1-Bit-Display, schliesst aber `mono` aus")

if fehlt_sdk:
    print(f"check-mono: WARNUNG, keine compiler.json fuer: {', '.join(fehlt_sdk)}")
if fehler:
    print("check-mono: monkey.jungle passt nicht zum SDK:")
    for f in fehler:
        print("  " + f)
    sys.exit(1)
print(f"check-mono: {len(geraete)} Geraete geprueft, Farb-Einteilung stimmt mit dem SDK ueberein.")
