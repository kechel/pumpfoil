#!/bin/sh
# common/ ist die Quelle (in Node getestet); DevEco baut nur, was im Projekt liegt.
# Nach jeder Aenderung an common/: ./sync-common.sh — test/kern.test.mjs prueft, dass die Kopien stimmen.
cd "$(dirname "$0")"
for p in lite wearable; do
  z="$p/entry/src/main/js/MainAbility/common"
  [ -d "$p/entry" ] || continue
  mkdir -p "$z"
  cp common/kern.js common/recorder.js common/konfig.js "$z/"
done
