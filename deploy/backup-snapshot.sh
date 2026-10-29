#!/usr/bin/env bash
# Friert den aktuellen latest-backup-Stand als permanenten Hardlink-Snapshot ein
# (monatlich). Unveränderte Dateien teilen sich die Inode mit latest-backup ->
# kaum Extra-Platz; Verzeichnisname = Datum (YYYYMMDD-HHMMSS).
set -euo pipefail
# Nur jan darf die Sicherungen lesen (29.10.2026): auf der VM gibt es weitere Nutzer, und hier liegen
# DB-Dumps, Rohdaten und Fotos. Der Pull von host17 laeuft als jan.
umask 077

BASE=/opt/foil/backups/pumpfoil.org
LATEST="$BASE/latest-backup"
SNAPS="$BASE/hardlink-snapshots"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$SNAPS/$STAMP"

[ -d "$LATEST" ] || { echo "latest-backup fehlt"; exit 1; }
mkdir -p "$SNAPS"
case "$BASE" in /opt/foil/*) chmod 700 /opt/foil /opt/foil/backups "$BASE" ;; esac
cp -al "$LATEST" "$DEST"
echo "Snapshot erstellt: $DEST ($(du -sh "$DEST" | cut -f1), teilt Inodes mit latest-backup)"
