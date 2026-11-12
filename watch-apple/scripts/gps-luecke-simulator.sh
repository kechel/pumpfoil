#!/usr/bin/env bash
# GPS-Luecke am Lauf-Ende im Apple-Watch-Simulator nachstellen (12.11.2026, Fix LaufLuecke in Recorder.swift).
#
# Xcodes „Simulate Location“ (GPX) erreicht die Watch-App im Watch-Simulator nicht zuverlaessig; simctl schon.
# Der Standort wird direkt am Watch-Simulator gesetzt — Xcode dabei NICHT mit ▶ debuggen (sonst gehoert der
# Standort Xcode), die Watch-App im Simulator von Hand starten.
#
#   watch-apple/scripts/gps-luecke-simulator.sh sturz      # 69 s fahren, 36 s ohne GPS, danach treiben
#   watch-apple/scripts/gps-luecke-simulator.sh ende10     # 51 s fahren, 10 s ohne GPS, danach treiben
#   watch-apple/scripts/gps-luecke-simulator.sh arm8       # 8 s ohne GPS MITTEN im Lauf (muss EIN Lauf bleiben)
#
# Erwartung (letzter Lauf): sturz ~1:09 statt ~1:15+, ende10 ~0:51, arm8 ein Lauf ~1:40 (vorher zwei Laeufe).
# Bewegung: geradeaus nach Norden mit 3,4 m/s; Ort ist beliebig (Bodensee), es zaehlt nur das Tempo.
set -euo pipefail
export LC_ALL=C   # awk sonst mit deutschem Dezimalkomma (47,65) -> simctl: „Invalid latitude,longitude pair"

FALL="${1:-sturz}"
DEV="${WATCH_UDID:-$(xcrun simctl list devices booted | grep -i 'watch' | grep -oE '[0-9A-F-]{36}' | head -1)}"
[ -n "$DEV" ] || { echo "Kein gestarteter Watch-Simulator gefunden (oder WATCH_UDID setzen)." >&2; exit 1; }

LAT0=47.6500; LON=9.1800
V=3.4                                  # m/s im Lauf (~12 km/h)
GRAD_PRO_M=0.000008993                 # Breitengrad je Meter
lat_nach() { awk -v a="$1" -v m="$2" -v g="$GRAD_PRO_M" 'BEGIN{printf "%.6f", a + m*g}'; }

fahren() {     # $1 = Startbreite, $2 = Sekunden, $3 = Tempo  -> gibt Endbreite aus
  local ende; ende=$(lat_nach "$1" "$(awk -v s="$2" -v v="$3" 'BEGIN{print s*v}')")
  xcrun simctl location "$DEV" start --speed="$3" --interval=1 "$1,$LON" "$ende,$LON" >/dev/null
  sleep "$2"
  echo "$ende"
}
luecke() {     # $1 = Sekunden ohne jede Position
  xcrun simctl location "$DEV" clear
  sleep "$1"
}

echo "Watch-Simulator: $DEV — Fall: $FALL"
# Kein `set`: das liefert EINE Position, danach nichts mehr -> die App meldet nach 5 s zu Recht „GPS suchen".
# Stattdessen langsam treiben (0,3 m/s), dann kommt jede Sekunde ein Fix.
echo "Treibe am Start (40 s). JETZT in der Watch-App die Aufnahme starten, sobald GPS bereit ist ..."
LAT0=$(fahren "$LAT0" 40 0.3)

case "$FALL" in
  sturz)
    echo "Fahre 69 s ..."; B=$(fahren "$LAT0" 69 "$V")
    echo "Sturz: 36 s ohne GPS (Timer muss weiterlaufen) ..."; luecke 36
    echo "Treibe 40 s langsam ..."; fahren "$(lat_nach "$B" 5)" 40 0.3 >/dev/null ;;
  ende10)
    echo "Fahre 51 s ..."; B=$(fahren "$LAT0" 51 "$V")
    echo "10 s ohne GPS ..."; luecke 10
    echo "Treibe 40 s langsam ..."; fahren "$(lat_nach "$B" 8)" 40 0.3 >/dev/null ;;
  arm8)
    echo "Fahre 50 s ..."; B=$(fahren "$LAT0" 50 "$V")
    echo "Arm unter Wasser: 8 s ohne GPS, weitergefahren ..."; luecke 8
    echo "Fahre 50 s weiter ..."; C=$(fahren "$(lat_nach "$B" "$(awk -v v="$V" 'BEGIN{print 8*v}')")" 50 "$V")
    echo "Treibe 40 s langsam ..."; fahren "$C" 40 0.3 >/dev/null ;;
  *) echo "Unbekannter Fall: $FALL (sturz | ende10 | arm8)" >&2; exit 1 ;;
esac
xcrun simctl location "$DEV" clear
echo "Fertig. Jetzt die Seite LAST RUN ansehen, dann die Aufnahme beenden (laedt hoch)."
