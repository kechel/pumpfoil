#!/usr/bin/env bash
# Friert den aktuellen latest-backup-Stand als permanenten Hardlink-Snapshot ein
# (monatlich). Unveränderte Dateien teilen sich die Inode mit latest-backup ->
# kaum Extra-Platz; Verzeichnisname = Datum (YYYYMMDD-HHMMSS).
set -euo pipefail

BASE=/opt/foil/backups/pumpfoil.org
LATEST="$BASE/latest-backup"
SNAPS="$BASE/hardlink-snapshots"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$SNAPS/$STAMP"

[ -d "$LATEST" ] || { echo "latest-backup fehlt"; exit 1; }
mkdir -p "$SNAPS"
cp -al "$LATEST" "$DEST"
echo "Snapshot erstellt: $DEST ($(du -sh "$DEST" | cut -f1), teilt Inodes mit latest-backup)"
