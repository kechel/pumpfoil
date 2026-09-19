TESTING

node --experimental-vm-modules -e "const fs=require('fs'),vm=require('vm');for(const f of ['page/index.js','app-side/index.js','setting/index.js'])new vm.SourceTextModule(fs.readFileSync(f,'utf8'),{identifier:f});console.log('ok')"

rm -rf dist .zeus build

pkill -9 -f "zeus|qemu|simulator|side-service|mps2-an521"

lsof -i :7650

npm run dev

zeus preview


RELEASE BUILD

grep -n 'APP_VERSION = ' page/index.js

python3 -c "import json;print(json.load(open('app.json'))['app']['version'])"

node --experimental-vm-modules -e "const fs=require('fs'),vm=require('vm');for(const f of ['page/index.js','app-side/index.js','setting/index.js'])new vm.SourceTextModule(fs.readFileSync(f,'utf8'),{identifier:f});console.log('ok')"

rm -rf dist .zeus build

npm run build

node zepp.mjs pruefe

open ../brand/stores/zepp
