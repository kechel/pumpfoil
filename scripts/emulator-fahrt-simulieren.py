#!/usr/bin/env python3
"""Speist eine Fahrt mit TEMPO in den Emulator — `geo fix` kann das nicht (nur Position).

    python3 nmea.py [--serial emulator-5554] [--knoten 8] [--sekunden 60]

GPRMC braucht Grad+Dezimalminuten und eine XOR-Pruefsumme; ohne die verwirft der
GPS-Treiber den Satz stillschweigend (die Konsole sagt trotzdem OK).
"""
import argparse, subprocess, time

def grad_min(wert, stellen):
    grad = int(abs(wert))
    minuten = (abs(wert) - grad) * 60
    return f"{grad:0{stellen}d}{minuten:07.4f}"

def satz(lat, lon, knoten, kurs, t):
    kern = (f"GPRMC,{time.strftime('%H%M%S.00', time.gmtime(t))},A,"
            f"{grad_min(lat,2)},{'N' if lat>=0 else 'S'},"
            f"{grad_min(lon,3)},{'E' if lon>=0 else 'W'},"
            f"{knoten:.1f},{kurs:.1f},{time.strftime('%d%m%y', time.gmtime(t))},,,A")
    p = 0
    for c in kern:
        p ^= ord(c)
    return f"${kern}*{p:02X}"

ap = argparse.ArgumentParser()
ap.add_argument("--serial", default="emulator-5554")
ap.add_argument("--knoten", type=float, default=8.0)     # 8 kn = 14,8 km/h
ap.add_argument("--sekunden", type=int, default=60)
ap.add_argument("--adb", default="adb")
a = ap.parse_args()

lat, lon = 47.5102, 9.7547
# 8 kn nach Osten = 4,11 m/s; ein Grad Laenge sind hier ~75,2 km
schritt = a.knoten * 1852 / 3600 / 75200
t0 = time.time()
for i in range(a.sekunden):
    s = satz(lat, lon + i * schritt, a.knoten, 90.0, t0 + i)
    subprocess.run([a.adb, "-s", a.serial, "emu", "geo", "nmea", s],
                   capture_output=True, text=True)
    time.sleep(1)
print(f"{a.sekunden} Saetze gesendet, {a.knoten} kn = {a.knoten*1.852:.1f} km/h")
