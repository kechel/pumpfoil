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
# Lite: die JerryScript-Engine uebersetzt JEDES Buendel (app.js, pages/index) in 48 KB Heap (gemessen
# am 08.10.2026: jerry --mem-stats meldet „Heap size = 49144"). Nicht die Dateigroesse zaehlt, sondern
# der Heap beim Uebersetzen — darueber scheitert der Snapshot und die Seite bleibt schwarz. Deshalb
# Recorder im app.js-Buendel, Zeichnen im Seiten-Buendel, und hier je Buendel die Heap-Spitze pruefen.
# Die Uhr laedt die Seite als JerryScript-Snapshot (.bc). Scheitert der Snapshot, warnt hvigor nur
# („Failed to convert … to a snapshot") und baut trotzdem — die Seite bleibt dann SCHWARZ (08.10.2026:
# ein Regex-Literal; JerryScript der Lite-Uhren kennt keine). Deshalb hier hart pruefen, Release und
# Debug. Nur lite/: die Watch-3/4-Linie (wearable/) laeuft auf einer vollen JS-Engine ohne Snapshot.
JB="$CLT/sdk/default/openharmony/js/build-tools/ace-loader/bin"
BC=$(mktemp)
for m in release debug; do
  (cd lite && hvigorw assembleHap --mode module -p product=default -p buildMode=$m --no-daemon) | grep -E "ERROR" || true
  for f in lite/entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/app.js \
           lite/entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/pages/index/index.js; do
    "$JB/jerry-snapshot" generate -o "$BC" "$f" >/dev/null 2>&1 \
      || { echo "FEHLER: lite ($m) $f laesst sich nicht als Snapshot bauen (Syntax wie Regex-Literal, oder Heap)"; rm -f "$BC"; exit 1; }
    H=$("$JB/jerry" --mem-stats --parse-only "$f" 2>&1 | sed -n 's/^  Peak allocated = \([0-9]*\) bytes/\1/p' | head -1)
    G=$(wc -c < "$f")
    echo "  lite $m $(basename "$f"): $G Byte (Grenze 49152), Heap-Spitze $H von 49144"
    # Zweite Grenze, vom Simulator gemeldet („app.js is bigger than 48 KB"): die Datei selbst.
    [ "$G" -le 46000 ] || { echo "FEHLER: $f ist $G Byte — ueber 48 KB laedt die Uhr die Datei nicht (Grenze hier 46000)"; rm -f "$BC"; exit 1; }
    [ "${H:-99999}" -le 44000 ] || { echo "FEHLER: $f braucht beim Uebersetzen zu viel Heap (Grenze 44000 = 90 %) — verkleinern oder aufteilen"; rm -f "$BC"; exit 1; }
  done
done
rm -f "$BC"
echo "Snapshot-Pruefung ok (lite, release + debug)"
