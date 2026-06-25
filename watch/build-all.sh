#!/usr/bin/env bash
# Baut die Watch-App für ALLE im Manifest gelisteten Geräte und erzeugt
# bin/catalog.json (id, Anzeigename, Familie, Auflösung, Größe) für die
# Download-Auswahl auf der Website.
#
# Voraussetzungen:
#   - SDK unter $SDK_HOME (z. B. $HOME/connectiq-sdk-9.2.0)
#   - Device-Files unter ~/.Garmin/ConnectIQ/Devices/<id>/  (per SDK-Manager
#     oder aus dem bereitgestellten Tarball; AppleDouble-._*-Dateien vorher
#     entfernen: find ... -name '._*' -delete)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SDK_HOME="${SDK_HOME:?SDK_HOME setzen}"
KEY="${KEY:-$SDK_HOME/developer_key.der}"
DEVDIR="${DEVDIR:-$HOME/.Garmin/ConnectIQ/Devices}"
mkdir -p "$HERE/bin"

# Geräte-IDs aus dem Manifest ziehen.
DEVICES=$(grep -oP '(?<=iq:product id=")[^"]+' "$HERE/manifest.xml")

PASS=0; FAIL=0; FAILED=""
for d in $DEVICES; do
  if "$SDK_HOME/bin/monkeyc" -f "$HERE/monkey.jungle" -d "$d" \
        -o "$HERE/bin/foil-$d.prg" -y "$KEY" -w >/dev/null 2>&1; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1)); FAILED="$FAILED $d"
  fi
done
echo "Builds: $PASS ok, $FAIL fehlgeschlagen.${FAILED:+ Fehlgeschlagen:$FAILED}"

# App-Version aus Config.mc ziehen (eine Version pro build-all-Lauf -> pro Plattform).
VERSION=$(grep -oP 'VERSION = "\K[^"]+' "$HERE/source/Config.mc" | head -1)

# Katalog erzeugen (für /api/app/devices).
python3 - "$HERE" "$DEVDIR" "$VERSION" <<'PY'
import json, os, sys
here, devdir, version = sys.argv[1], sys.argv[2], sys.argv[3]
cat = []
for fn in sorted(os.listdir(os.path.join(here, "bin"))):
    if not (fn.startswith("foil-") and fn.endswith(".prg")):
        continue
    dev = fn[len("foil-"):-len(".prg")]
    cj = os.path.join(devdir, dev, "compiler.json")
    name, fam, w, h = dev, "?", None, None
    if os.path.exists(cj):
        c = json.load(open(cj))
        name = c.get("displayName", dev)
        fam = c.get("deviceFamily", "?")
        res = c.get("resolution", {})
        w, h = res.get("width"), res.get("height")
    cat.append(dict(id=dev, name=name, family=fam, w=w, h=h,
                    bytes=os.path.getsize(os.path.join(here, "bin", fn)),
                    version=version))
cat.sort(key=lambda x: x["name"])
json.dump(cat, open(os.path.join(here, "bin", "catalog.json"), "w"),
          ensure_ascii=False, indent=0)
print(f"catalog.json: {len(cat)} Einträge")
PY
