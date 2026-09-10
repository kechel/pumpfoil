ZEPP — BEFEHLE
==============
cd ~/gits/pumpfoil/watch-zepp


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
zeus dev
# ok, wenn im Bridge-Log steht: [pumpfoil] app-side onInit
# nach jedem Code-Change: Simulator komplett neu

# GPS im Simulator gibt es nicht
grep -n "DEV_FAKE_GPS" page/index.js

# echte Uhr (QR in Zepp-App)
zeus preview


RELEASE
-------
# Version an ZWEI Stellen, muessen gleich sein
grep -n 'APP_VERSION = ' page/index.js
python3 -c "import json;print(json.load(open('app.json'))['app']['version'])"

# DEV_FAKE_GPS muss false sein
grep -n "DEV_FAKE_GPS" page/index.js

node --experimental-vm-modules -e "const fs=require('fs'),vm=require('vm');for(const f of ['page/index.js','app-side/index.js','setting/index.js'])new vm.SourceTextModule(fs.readFileSync(f,'utf8'),{identifier:f});console.log('ok')"
rm -rf dist .zeus build
zeus build

# Store-Bilder zum Hochladen
open ../brand/stores/zepp
