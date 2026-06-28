#!/usr/bin/env bash
# Setzt feste Demo-Werte (Speed in km/h, Puls in bpm) in der Wear-App — für Screenshots ohne
# echte Sensoren/GPS. Wirkt nur in Debug-Builds. Die App vorher starten; nach dem Senden zeigt
# sie den Aufnahme-Screen mit den Werten (zwischen den Datenseiten horizontal wischen).
#
# Nutzung: scripts/wear-demo.sh [serial] [speed_kmh] [hr]
#   scripts/wear-demo.sh                 -> emulator-5556, 15.6 km/h, 148 bpm
#   scripts/wear-demo.sh emulator-5556 22.3 132
set -euo pipefail
SERIAL="${1:-emulator-5556}"
SPEED="${2:-15.6}"
HR="${3:-148}"
adb -s "$SERIAL" shell am broadcast \
  -n org.pumpfoil.app/org.pumpfoil.watch.DemoReceiver \
  --ef speed "$SPEED" --ei hr "$HR"
echo "Demo gesetzt: ${SPEED} km/h, ${HR} bpm auf ${SERIAL}"
