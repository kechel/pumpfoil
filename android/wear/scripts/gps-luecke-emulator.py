#!/usr/bin/env python3
"""GPS-Luecke am Lauf-Ende im Wear-Emulator (13.11.2026, Gegenstueck zu watch-apple/scripts/gps-luecke-simulator.sh).

    python3 android/wear/scripts/gps-luecke-emulator.py ende10   # Fall 3: 51 s fahren, 10 s Luecke, treiben
    python3 android/wear/scripts/gps-luecke-emulator.py sturz    # Fall 4: 69 s fahren, 36 s Luecke, treiben

Vorher in der Uhr die Aufnahme starten. Jede Sekunde `adb emu geo fix lon lat alt sat knoten`.
FALLEN (13.11.): (1) Mit Berechtigung „Koerperliche Aktivitaet" holt die App GPS aus Health Services — das hoert NICHT
auf geo fix (0 Punkte); fuer den Test `adb shell pm revoke org.pumpfoil.app android.permission.ACTIVITY_RECOGNITION`.
(2) Der Emulator wiederholt den letzten geo fix jede Sekunde als frischen Fix MIT Tempo — eine Luecke entsteht nur,
wenn die Ortung abgeschaltet wird (macht luecke() hier)."""
import subprocess, sys, time
ADB = "/home/jan/android-sdk/platform-tools/adb"
LON, GRAD_PRO_M, V = 9.18, 0.000008993, 3.4
lat = 47.65
def fix(v):
    subprocess.run([ADB, "emu", "geo", "fix", f"{LON:.6f}", f"{lat:.6f}", "400", "10", f"{v / 0.514444:.2f}"],
                   capture_output=True)
def fahren(s, v):
    global lat
    t0 = time.time()
    for i in range(int(s)):
        lat += v * GRAD_PRO_M
        fix(v)
        time.sleep(max(0, t0 + i + 1 - time.time()))
def luecke(s, weiter_m):
    # Der Emulator wiederholt den letzten geo fix jede Sekunde als FRISCHEN Fix (mit Tempo) — eine echte Luecke
    # gibt es nur mit abgeschalteter Ortung (die App behandelt das nicht anders als ausbleibende Fixe).
    global lat
    subprocess.run([ADB, "shell", "cmd", "location", "set-location-enabled", "false"], capture_output=True)
    time.sleep(s); lat += weiter_m * GRAD_PRO_M
    subprocess.run([ADB, "shell", "cmd", "location", "set-location-enabled", "true"], capture_output=True)
fall = sys.argv[1]
print(time.strftime("%T"), "treiben 30 s", flush=True); fahren(30, 0.3)
if fall == "ende10":
    print(time.strftime("%T"), "fahren 51 s", flush=True); fahren(51, V)
    print(time.strftime("%T"), "10 s ohne GPS", flush=True); luecke(10, 8)
elif fall == "sturz":
    print(time.strftime("%T"), "fahren 69 s", flush=True); fahren(69, V)
    print(time.strftime("%T"), "36 s ohne GPS", flush=True); luecke(36, 5)
print(time.strftime("%T"), "treiben 40 s", flush=True); fahren(40, 0.3)
print(time.strftime("%T"), "fertig", flush=True)
