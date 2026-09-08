#!/usr/bin/env python3
"""Speist eine Fahrt MIT TEMPO in den Android-/Wear-Emulator.

    python3 scripts/emulator-fahrt-simulieren.py [--serial emulator-5554] [--knoten 8] [--sekunden 60]

Warum das noetig ist: ein nacktes `adb emu geo fix <lon> <lat>` schickt nur Koordinaten. Die Uhr
zeigt dann 0,0 km/h, und die Lauf-Erkennung findet nichts, weil sie auf dem Geschwindigkeitsband
arbeitet. Belegt an Jans Testsession 5238 (08.09.2026): 35 Punkte kamen an, alle mit `speed = 0`.

Der Emulator kann Geschwindigkeit, aber nur als FUENFTEN Parameter von `geo fix`:

    geo fix <longitude> <latitude> [<altitude> [<satellites> [<velocity>]]]
                                                              ^ in KNOTEN

Alle vorderen Parameter muessen also mitgeschickt werden. Laengengrad steht VORNE — die
umgekehrte Reihenfolge ist die haeufigste Verwechslung.

Ein erster Versuch lief ueber `geo nmea` mit selbstgebauten GPRMC-Saetzen (samt Grad-Dezimalminuten
und XOR-Pruefsumme). Die Emulator-Konsole quittiert das mit OK, die Uhr zeigte aber weiter 0,0 km/h
— auf dem Wear-Image (android-wear, API 34) kommt darueber offenbar keine Geschwindigkeit an.
Deshalb `geo fix`. Wer NMEA wieder probiert: das OK der Konsole heisst nur „Befehl angekommen".
"""
import argparse
import subprocess
import time

ap = argparse.ArgumentParser()
ap.add_argument("--serial", default="emulator-5554")
ap.add_argument("--adb", default="adb")
ap.add_argument("--knoten", type=float, default=8.0, help="8 kn = 14,8 km/h")
ap.add_argument("--sekunden", type=int, default=60)
ap.add_argument("--lat", type=float, default=47.5102)
ap.add_argument("--lon", type=float, default=9.7547)
a = ap.parse_args()

# Ostwaerts. Ein Grad Laenge ist auf 47,5 Grad Nord etwa 75,2 km lang.
schritt = a.knoten * 1852 / 3600 / 75200
for i in range(a.sekunden):
    lon = a.lon + i * schritt
    r = subprocess.run([a.adb, "-s", a.serial, "emu", "geo", "fix",
                        f"{lon:.6f}", f"{a.lat:.6f}", "400", "12", f"{a.knoten:.1f}"],
                       capture_output=True, text=True)
    if i == 0 and "OK" not in r.stdout:
        raise SystemExit(f"Emulator antwortet nicht mit OK: {r.stdout.strip()} {r.stderr.strip()}")
    time.sleep(1)
print(f"{a.sekunden} Fixes gesendet, {a.knoten} kn = {a.knoten * 1.852:.1f} km/h, "
      f"Strecke {a.sekunden * a.knoten * 1852 / 3600:.0f} m")
