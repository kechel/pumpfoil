#!/usr/bin/env bash
# Lädt das aktuelle Connect IQ Linux-SDK direkt von Garmin (ohne SDK-Manager-GUI)
# und erzeugt einen Developer-Key. Das umgeht den GUI-Login für den SDK-Teil.
#
# NICHT automatisierbar: die geräte­spezifischen Compiler-Files (z. B. fenix7xpro)
# liegen hinter Garmin-Auth (api.gcs.garmin.com -> 401, monkeynet.garmin.com nicht
# öffentlich). Die müssen EINMALIG über den SDK-Manager (GUI + Garmin-Login)
# heruntergeladen werden -> landen in ~/.Garmin/ConnectIQ/Devices/. Danach baut build.sh.
set -euo pipefail

SDK_ROOT="${SDK_ROOT:-$HOME/connectiq-sdk}"
MANIFEST="https://developer.garmin.com/downloads/connect-iq/sdks/sdks.json"
BASE="https://developer.garmin.com/downloads/connect-iq/sdks"

echo "==> neueste SDK-Version aus Manifest lesen"
TMP="$(mktemp -d)"
curl -fsSL "$MANIFEST" -o "$TMP/sdks.json"
read -r VER LIN < <(python3 -c "import json;d=json.load(open('$TMP/sdks.json'))[-1];print(d['version'],d['linux'])")
echo "    -> $VER ($LIN)"

DEST="$SDK_ROOT-$VER"
if [ ! -d "$DEST/bin" ]; then
  echo "==> SDK herunterladen (~200 MB)"
  curl -fSL "$BASE/$LIN" -o "$TMP/sdk.zip"
  mkdir -p "$DEST"
  unzip -q -o "$TMP/sdk.zip" -d "$DEST"
  chmod +x "$DEST"/bin/* 2>/dev/null || true
fi
echo "    SDK: $DEST"

if [ ! -f "$DEST/developer_key.der" ]; then
  echo "==> Developer-Key erzeugen"
  openssl genrsa -out "$TMP/key.pem" 4096
  openssl pkcs8 -topk8 -inform PEM -outform DER -in "$TMP/key.pem" \
    -out "$DEST/developer_key.der" -nocrypt
fi
echo "    Key: $DEST/developer_key.der"

rm -rf "$TMP"
echo
echo "Fertig. Nächster Schritt (einmalig, mit Garmin-Login am GUI-Rechner):"
echo "  SDK-Manager starten -> einloggen -> Gerät 'fenix 7X Pro' herunterladen."
echo "  (Device-Files landen in ~/.Garmin/ConnectIQ/Devices/)"
echo "Dann:  SDK_HOME=$DEST ./build.sh"
