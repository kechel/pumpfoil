#!/bin/sh
# Fehlersuche im DevEco-Simulator (Jan, 08.10.2026: Lite-Seite bleibt schwarz, die Vorlage
# „[Lite]Empty Ability" laeuft). Halbiert die Seite, um die Ursache einzugrenzen:
#   ./diag.sh js     unsere Oberflaeche (hml/css), aber index.js OHNE jeden Import/Recorder
#                    -> sichtbar: Fehler liegt im JS (Imports, R.init); schwarz: in hml/css
#   ./diag.sh seite  einfache Textseite (wie die Vorlage), aber UNSER index.js mit allen Imports
#                    -> zeigt „PUMPFOIL" + Infozeile: Imports/Start ok; schwarz: Imports/Start
#   ./diag.sh wisch  nur das onswipe am aeussersten div entfernt -> wackelt die Seite dann noch?
#   ./diag.sh aus    Sicherung der Seite zurueckspielen (+ sync) — verwirft nie etwas Ungesichertes
# Nur lokal zum Testen — NIE committen.
cd "$(dirname "$0")"
z=lite/entry/src/main/js/MainAbility/pages/index
B=.diag-sicherung
# SICHERUNG statt git checkout (08.10.2026: „aus" setzte per git checkout zurueck und warf damit
# ungesicherte Arbeit an der Seite weg). Vor dem ersten Eingriff wird die Seite kopiert, „aus" spielt
# genau diese Kopie zurueck. Steht schon eine Sicherung, bleibt sie (mehrere Modi hintereinander).
sichern() { [ -d "$B" ] || { mkdir -p "$B" && cp $z/index.hml $z/index.js $z/index.css "$B/"; }; }
case "$1" in
  js)
    sichern
    cat > $z/index.js <<'JS'
export default {
  data: {
    ansicht: "bereit", zeit: "0:00", strecke: "0.00 km", info: "DIAG: JS ohne Imports", balken: 0,
    balkenZeigen: false, halten: true, tStart: "START", tPause: "Pause", tWeg: "Discard", tStopp: "STOP"
  },
  onInit() { console.info("Pumpfoil DIAG js onInit"); },
  starten() {}, pauseHalten() {}, pauseLang() {}, pauseTipp() {}, stoppHalten() {}, stoppLang() {},
  stoppTipp() {}, verwerfenTipp() {}, loslassen() {}, wischen() {}
};
JS
    echo "DIAG js: unsere hml/css, index.js ohne Imports" ;;
  seite)
    sichern
    cat > $z/index.hml <<'HML'
<div class="seite">
    <text class="marke">PUMPFOIL</text>
    <text class="klein">{{ info }}</text>
</div>
HML
    echo "DIAG seite: einfache Seite, unser index.js mit Imports" ;;
  wisch)
    sichern
    # Wackelt die Seite beim Wischen nur wegen des onswipe am aeussersten div? (08.10.2026)
    sed -i.bak 's| onswipe="wischen"||' $z/index.hml && rm -f $z/index.hml.bak
    echo "DIAG wisch: onswipe entfernt — wackelt es noch?" ;;
  aus)
    if [ -d "$B" ]; then cp "$B"/index.hml "$B"/index.js "$B"/index.css $z/ && rm -rf "$B"; ./sync-common.sh; echo "DIAG aus (Sicherung zurueckgespielt)"
    else echo "DIAG aus: keine Sicherung da, nichts geaendert"; fi ;;
  *) echo "Aufruf: ./diag.sh js|seite|wisch|aus"; exit 1 ;;
esac
