#!/usr/bin/env bash
# Auf Jans MAC ausfuehren, nachdem im Connect-IQ-SDK-Manager Geraete (und Schriften) aktualisiert wurden:
# kopiert Devices/ auf die Build-VM (jan-personal-agent, ueber host25 als Sprungrechner).
#
# Die Geraeteprofile gibt es nur mit Garmin-Login im SDK-Manager, das SDK selbst holt die VM ohne Login
# (watch/setup-sdk.sh). Deshalb muss nur das hier vom Mac kommen.
# Fonts/ (1,2 GB) braucht nur der Simulator, und der laeuft nicht auf der VM -> bleibt weg; der Compiler baut ohne.
#
# Loescht auf der VM nichts (kein --delete): alte Profile bleiben, neue kommen dazu, geaenderte werden ersetzt.
# Zeigt jede uebertragene Datei (-v); der erste Lauf vergleicht alle Dateien einzeln, das dauert etwas.
# AppleDouble-Dateien (._*) bleiben weg, sie brechen sonst den Compiler (.mss-Parser).
#
#   ./scripts/garmin-geraete-hochladen.sh            # hochladen
#   ./scripts/garmin-geraete-hochladen.sh --probe    # nur zeigen, was sich aendern wuerde
set -euo pipefail

QUELLE="$HOME/Library/Application Support/Garmin/ConnectIQ"
SPRUNG="jan@host25.smartkomm.de:43425"
ZIEL="jan@10.0.8.18"                 # jan-personal-agent, nur von host25 aus erreichbar
ZIELORDNER=".Garmin/ConnectIQ/"

PROBE=()
[ "${1:-}" = "--probe" ] && PROBE=(--dry-run --itemize-changes)

for d in Devices; do
  [ -d "$QUELLE/$d" ] || { echo "fehlt: $QUELLE/$d (SDK-Manager schon gestartet?)" >&2; exit 1; }
done
echo "Geraete auf dem Mac: $(ls "$QUELLE/Devices" | wc -l | tr -d ' ')"

ssh -J "$SPRUNG" "$ZIEL" "mkdir -p $ZIELORDNER"
rsync -av ${PROBE[@]+"${PROBE[@]}"} --exclude '._*' --exclude '.DS_Store' -e "ssh -J $SPRUNG" \
  "$QUELLE/Devices" "$ZIEL:$ZIELORDNER"

echo "Geraete auf der VM: $(ssh -J "$SPRUNG" "$ZIEL" "ls $ZIELORDNER/Devices | wc -l")"
