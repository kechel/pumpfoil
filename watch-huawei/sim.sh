#!/bin/sh
# Simulator-Schalter fuer die JS-FA-Linien (lite/ und wearable/):
#   ./sim.sh an   recorder.js importiert die Attrappe (common/wearengine-sim.js) statt wearengine.js
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
      sed -i.bak 's|"../wearengine/wearengine.js"|"../wearengine/sim.js"|' "$z/common/recorder.js" && rm -f "$z/common/recorder.js.bak"
    done
    echo "Simulator AN — vor dem Commit/Uhren-Build: ./sim.sh aus" ;;
  aus)
    ./sync-common.sh
    for p in lite wearable; do rm -f "$p/entry/src/main/js/MainAbility/wearengine/sim.js"; done
    echo "Simulator AUS — echte Wear Engine" ;;
  *) echo "Aufruf: ./sim.sh an|aus"; exit 1 ;;
esac
