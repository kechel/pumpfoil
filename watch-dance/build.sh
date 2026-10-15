#!/usr/bin/env bash
# Baut die Watch-App. Voraussetzungen:
#   - SDK via setup-sdk.sh installiert  -> SDK_HOME zeigt darauf
#   - Device-Files via SDK-Manager geladen (~/.Garmin/ConnectIQ/Devices/<device>)
#
# Beispiel:
#   SDK_HOME=$HOME/connectiq-sdk-9.2.0 ./build.sh fenix7xpro
set -euo pipefail

DEVICE="${1:-fenix7xpro}"
SDK_HOME="${SDK_HOME:?SDK_HOME setzen (z. B. \$HOME/connectiq-sdk-9.2.0)}"
KEY="${KEY:-$SDK_HOME/developer_key.der}"
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$HERE/bin"
OUT="$HERE/bin/foil-$DEVICE.prg"

"$SDK_HOME/bin/monkeyc" \
  -f "$HERE/monkey.jungle" \
  -d "$DEVICE" \
  -o "$OUT" \
  -y "$KEY" \
  -w

echo "OK -> $OUT"
echo "Im Simulator testen:  $SDK_HOME/bin/monkeydo $OUT $DEVICE"
echo "Auf die Uhr (USB):    cp $OUT /run/media/\$USER/GARMIN/GARMIN/APPS/"
