#!/bin/sh
# common/ ist die Quelle (in Node getestet); DevEco baut nur, was im Projekt liegt.
# Die Watch-3/4-Fassung (wearable/) bekommt dazu Seite, Texte und app.js aus lite/ — beide
# Linien sind JS-FA mit derselben Oberflaeche, nur config.json und das SDK unterscheiden sich.
# Nach jeder Aenderung an common/ oder lite/.../pages|i18n: ./sync-common.sh
# test/kern.test.mjs prueft, dass die Kopien stimmen.
cd "$(dirname "$0")"
for p in lite wearable; do
  z="$p/entry/src/main/js/MainAbility"
  [ -d "$p/entry" ] || continue
  mkdir -p "$z/common"
  cp common/kern.js common/recorder.js common/konfig.js common/seiten.js "$z/common/"
done
q=lite/entry/src/main/js/MainAbility; z=wearable/entry/src/main/js/MainAbility
mkdir -p "$z/pages/index" "$z/i18n"
cp $q/app.js "$z/"; cp $q/pages/index/* "$z/pages/index/"; cp $q/i18n/*.json "$z/i18n/"
