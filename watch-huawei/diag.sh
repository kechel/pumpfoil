#!/bin/sh
# Fehlersuche im DevEco-Simulator (Jan, 08.10.2026: Lite-Seite bleibt schwarz, die Vorlage
# „[Lite]Empty Ability" laeuft). Halbiert die Seite, um die Ursache einzugrenzen:
#   ./diag.sh js     unsere Oberflaeche (hml/css), aber index.js OHNE jeden Import/Recorder
#                    -> sichtbar: Fehler liegt im JS (Imports, R.init); schwarz: in hml/css
#   ./diag.sh seite  einfache Textseite (wie die Vorlage), aber UNSER index.js mit allen Imports
#                    -> zeigt „PUMPFOIL" + Infozeile: Imports/Start ok; schwarz: Imports/Start
#   ./diag.sh aus    alles zurueck (git checkout der Seite + sync)
# Nur lokal zum Testen — NIE committen.
cd "$(dirname "$0")"
z=lite/entry/src/main/js/MainAbility/pages/index
case "$1" in
  js)
    cat > $z/index.js <<'JS'
export default {
  data: {
    modus: "bereit", zeit: "0:00", tempo: "0.0", strecke: "0.00", puls: "--", info: "DIAG: JS ohne Imports",
    balken: 0, balkenZeigen: false, datenseite: false,
    knopfStart: "Start", knopfPause: "Pause", knopfWeiter: "Weiter", knopfStopp: "Stopp", textPause: "Pause"
  },
  onInit() { console.info("Pumpfoil DIAG js onInit"); },
  wischen() {}, startHalten() {}, pauseHalten() {}, weiterHalten() {}, stoppHalten() {}, loslassen() {}
};
JS
    echo "DIAG js: unsere hml/css, index.js ohne Imports" ;;
  seite)
    cat > $z/index.hml <<'HML'
<div class="seite">
    <text class="marke">PUMPFOIL</text>
    <text class="klein">{{ info }}</text>
</div>
HML
    echo "DIAG seite: einfache Seite, unser index.js mit Imports" ;;
  aus)
    git checkout -- $z && ./sync-common.sh && echo "DIAG aus" ;;
  *) echo "Aufruf: ./diag.sh js|seite|aus"; exit 1 ;;
esac
