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

# Parallel bauen — monkeyc ist single-threaded, aber jede JVM braucht viel RAM (~1,5 GB).
# Der Flaschenhals ist der SPEICHER, nicht die Kerne: JOBS aus dem freien RAM ableiten
# (~2 GB je Job), gedeckelt auf Kerne-4. Überschreibbar via JOBS.
if [ -z "${JOBS:-}" ]; then
  AVAIL_MB=$(free -m | awk '/Mem:/{print $7}')
  JOBS=$(( AVAIL_MB / 2000 )); CAP=$(( $(nproc) - 4 ))
  [ "$JOBS" -gt "$CAP" ] && JOBS=$CAP; [ "$JOBS" -lt 2 ] && JOBS=2
fi
FAILFILE="$(mktemp)"
export SDK_HOME HERE KEY FAILFILE
build_one() {
  if "$SDK_HOME/bin/monkeyc" -f "$HERE/monkey.jungle" -d "$1" \
        -o "$HERE/bin/foil-$1.prg" -y "$KEY" -w >/dev/null 2>&1; then :; else echo "$1" >> "$FAILFILE"; fi
}
export -f build_one
printf '%s\n' $DEVICES | xargs -P "$JOBS" -I{} bash -c 'build_one "$1"' _ {}
# Retry der Fehlschläge SEQUENZIELL (fängt transiente OOM/Contention ab) -> Vollständigkeit.
RETRY=$(sort -u "$FAILFILE"); : > "$FAILFILE"
if [ -n "$RETRY" ]; then
  echo "Retry (seriell): $(printf '%s\n' $RETRY | grep -c .) Geräte…"
  for d in $RETRY; do build_one "$d"; done
fi
TOTAL=$(printf '%s\n' $DEVICES | grep -c .)
FAIL=$(grep -c . "$FAILFILE" || true); PASS=$((TOTAL - FAIL))
FAILED=$(tr '\n' ' ' < "$FAILFILE"); rm -f "$FAILFILE"
echo "Builds: $PASS ok, $FAIL fehlgeschlagen (parallel: $JOBS).${FAILED:+ Fehlgeschlagen: $FAILED}"

# App-Version aus Config.mc ziehen (eine Version pro build-all-Lauf -> pro Plattform).
VERSION=$(grep -oP 'VERSION = "\K[^"]+' "$HERE/source/Config.mc" | head -1)

# Katalog erzeugen (für /api/app/devices).
python3 - "$HERE" "$DEVDIR" "$VERSION" <<'PY'
import json, os, sys
here, devdir, version = sys.argv[1], sys.argv[2], sys.argv[3]
cat = []
partmap = {}   # Geräte-Part-Number (von der Uhr gemeldet) -> {id, name}
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
        # Alle Part-Numbers des Geräts auf (id,name) abbilden — die Uhr meldet eine
        # davon via getDeviceSettings().partNumber.
        pns = set()
        if c.get("worldWidePartNumber"):
            pns.add(c["worldWidePartNumber"])
        for pn in c.get("partNumbers", []) or []:
            if isinstance(pn, dict) and pn.get("number"):
                pns.add(pn["number"])
        for pn in pns:
            partmap[pn] = {"id": dev, "name": name}
    cat.append(dict(id=dev, name=name, family=fam, w=w, h=h,
                    bytes=os.path.getsize(os.path.join(here, "bin", fn)),
                    version=version))
cat.sort(key=lambda x: x["name"])
json.dump(cat, open(os.path.join(here, "bin", "catalog.json"), "w"),
          ensure_ascii=False, indent=0)
json.dump(partmap, open(os.path.join(here, "bin", "partmap.json"), "w"),
          ensure_ascii=False, indent=0)
print(f"catalog.json: {len(cat)} Einträge")
print(f"partmap.json: {len(partmap)} Part-Numbers")
PY
