#!/bin/sh
# Simulator-Schalter fuer die JS-FA-Linien (lite/ und wearable/):
#   ./sim.sh an [konfig.json]   Wear-Engine-Attrappe (common/wearengine-sim.js) in der Seite, GPS-Fahrt
#                 (common/sim-gps.js) im Recorder; mit Datei kommt diese Seiten-Konfiguration „vom Handy"
#                 (z. B. watch-huawei/sim-konfig.json — steht in .gitignore, enthaelt persoenliche Layouts)
#   ./sim.sh aus  zurueck auf die echte Wear Engine (= ./sync-common.sh)
# Im Simulator fehlt `@system.wearengine`; mit der echten Datei bleibt die Seite schwarz.
# NIE im Zustand „an" committen oder fuer eine Uhr bauen: der Test „Projekt-Kopien" schlaegt dann
# fehl, und build-all.sh synct ohnehin vorher.
cd "$(dirname "$0")"
case "$1" in
  an)
    for p in lite wearable; do
      z="$p/entry/src/main/js/MainAbility"
      [ -d "$z" ] || continue
      cp common/wearengine-sim.js "$z/wearengine/sim.js"
      [ -n "$2" ] && { printf '\nSIM_KONFIG = ' >> "$z/wearengine/sim.js"; cat "$2" >> "$z/wearengine/sim.js"; printf ';\n' >> "$z/wearengine/sim.js"; }
      cp common/sim-gps.js "$z/wearengine/sim-gps.js"
      sed -i.bak 's|import geolocation from "@system.geolocation";|import geolocation from "../wearengine/sim-gps.js";|' "$z/common/recorder.js" && rm -f "$z/common/recorder.js.bak"
      sed -i.bak 's|"../../wearengine/wearengine.js"|"../../wearengine/sim.js"|' "$z/pages/index/index.js" && rm -f "$z/pages/index/index.js.bak"
    done
    echo "Simulator AN — vor dem Commit/Uhren-Build: ./sim.sh aus" ;;
  aus)
    for p in lite wearable; do
      z="$p/entry/src/main/js/MainAbility"
      [ -d "$z" ] || continue
      sed -i.bak 's|"../../wearengine/sim.js"|"../../wearengine/wearengine.js"|' "$z/pages/index/index.js" && rm -f "$z/pages/index/index.js.bak"
    done
    ./sync-common.sh
    for p in lite wearable; do rm -f "$p/entry/src/main/js/MainAbility/wearengine/sim.js" "$p/entry/src/main/js/MainAbility/wearengine/sim-gps.js"; done
    echo "Simulator AUS — echte Wear Engine" ;;
  *) echo "Aufruf: ./sim.sh an|aus"; exit 1 ;;
esac
