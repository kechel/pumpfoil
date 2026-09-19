ZEPP — BEFEHLE
==============
Alle Zeilen laufen aus DIESEM Verzeichnis (watch-zepp/), kein cd noetig.

WICHTIG seit 19.09.2026: NICHT mehr `zeus dev` / `zeus build` direkt aufrufen.
Nimm `npm run dev` und `npm run build`. Grund: am 18.09. ging 1.0.11 mit
DEV_FAKE_GPS=true in den Store (synthetische Spur am Bodensee statt echter
Ortung) und musste zurueckgezogen werden. Der Schalter steht deshalb nicht mehr
im Quellcode, sondern in der erzeugten, gitignorierten page/devflags.js —
`zeus build` direkt bricht jetzt ab, weil die Datei fehlt. Das ist Absicht.


TESTING
-------
# Syntax (node --check reicht NICHT, laesst doppelte const durch)
node --experimental-vm-modules -e "const fs=require('fs'),vm=require('vm');for(const f of ['page/index.js','app-side/index.js','setting/index.js'])new vm.SourceTextModule(fs.readFileSync(f,'utf8'),{identifier:f});console.log('ok')"

# Cache weg (Simulator vorher AUS)
rm -rf dist .zeus build

# nur bei Zombie / "connect failed"
pkill -9 -f "zeus|qemu|simulator|side-service|mps2-an521"
lsof -i :7650

# ERST Simulator-Fenster starten, DANN:
npm run dev
# setzt DEV_FAKE_GPS=true (GPS gibt es im Simulator nicht) und startet zeus dev
# ok, wenn im Bridge-Log steht: [pumpfoil] app-side onInit
# nach jedem Code-Change: Simulator komplett neu

# echte Uhr (QR in Zepp-App)
zeus preview


RELEASE
-------
# Version an ZWEI Stellen, muessen gleich sein — npm run build prueft es auch selbst
grep -n 'APP_VERSION = ' page/index.js
python3 -c "import json;print(json.load(open('app.json'))['app']['version'])"

node --experimental-vm-modules -e "const fs=require('fs'),vm=require('vm');for(const f of ['page/index.js','app-side/index.js','setting/index.js'])new vm.SourceTextModule(fs.readFileSync(f,'utf8'),{identifier:f});console.log('ok')"
rm -rf dist .zeus build
npm run build
# setzt DEV_FAKE_GPS=false, gleicht die Version ab, baut,
# und durchsucht das fertige .zab: fehlt der echte GPS-Pfad, bricht es ab
# UND loescht dist/ — dann kann nichts Kaputtes hochgeladen werden.

# ein schon gebautes Paket nachtraeglich pruefen
node zepp.mjs pruefe

# Store-Bilder zum Hochladen (nur Standardsprache, Haken
# "Use the app introduction screenshot in default language" bei allen Sprachen)
open ../brand/stores/zepp
