#!/bin/sh
# Baut alle drei Huawei-Linien (unsigniert) mit den HarmonyOS Command Line Tools fuer Linux —
# ohne DevEco. Vorher: Kern-Kopien abgleichen und die Node-Tests (inkl. ArkTS-Kern gegen JS-Kern).
#   CLT_HOME=/pfad/zu/command-line-tools ./build-all.sh      (Standard: ~/harmonyos/command-line-tools)
# Ergebnis: <linie>/entry/build/default/outputs/default/entry-default-unsigned.hap
# Signieren und Einreichen bleiben in DevEco bzw. AppGallery Connect (Zertifikate nicht im Repo).
set -e
cd "$(dirname "$0")"
CLT="${CLT_HOME:-$HOME/harmonyos/command-line-tools}"
[ -x "$CLT/bin/hvigorw" ] || { echo "hvigorw fehlt unter $CLT (CLT_HOME setzen)"; exit 1; }
export PATH="$CLT/bin:$CLT/tool/node/bin:$PATH"
export DEVECO_SDK_HOME="$CLT/sdk"
./sync-common.sh
node --test test/
for p in lite wearable arkts; do
  echo "=== $p"
  # Fehlt das Wear-Engine-SDK (nicht im Repo, README „SDK holen"), scheitert nur die JS-Linie.
  (cd "$p" && hvigorw assembleHap --mode module -p product=default --no-daemon) | grep -E "ERROR|Error Message|At File|BUILD" 
  ls -la "$p/entry/build/default/outputs/default/"*.hap
done
# Lite: eine Seite ueber ~48 KB scheitert beim Installieren (Huawei-Forum, docs/HUAWEI.md). Der
# Debug-Build ist unminifiziert und lag am 07.10. schon bei 47,9 KB — Release (minifiziert) bei 28,7 KB.
# Deshalb Lite zusaetzlich als Release bauen und beide Groessen zeigen; Release ueber 44 KB bricht ab.
(cd lite && hvigorw assembleHap --mode module -p product=default -p buildMode=release --no-daemon) | grep -E "ERROR|BUILD"
SEITE=lite/entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/pages/index/index.js
REL=$(wc -c < "$SEITE")
echo "Lite-Seite (Release): $REL Byte (Grenze ~49152; Debug-Build ist ~1,7x groesser)"
[ "$REL" -le 45056 ] || { echo "FEHLER: Lite-Seite zu gross fuer GT/Fit — Code verkleinern"; exit 1; }
