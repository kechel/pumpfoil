#!/usr/bin/env bash
# Baut die Watch-App. Voraussetzungen:
#   - SDK via setup-sdk.sh installiert  -> SDK_HOME zeigt darauf
#   - Device-Files via SDK-Manager geladen (~/.Garmin/ConnectIQ/Devices/<device>)
#
# Beispiel:
#   ./build.sh fenix7xpro            (SDK aus ~/connectiq-sdk, Key aus ~/.connectiq, s. setup-sdk.sh)
set -euo pipefail

DEVICE="${1:-fenix7xpro}"
SDK_HOME="${SDK_HOME:-$HOME/connectiq-sdk}"
KEY="${KEY:-$HOME/.connectiq/developer_key.der}"
[ -f "$KEY" ] || { echo "Signierschluessel fehlt: $KEY (s. setup-sdk.sh)" >&2; exit 1; }
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
