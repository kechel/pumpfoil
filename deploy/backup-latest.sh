#!/usr/bin/env bash
# Aktualisiert den "latest-backup"-Stand (Pull-Quelle für den externen Backup-Server):
#   - frischer PostgreSQL-Dump (atomar via temp+mv -> neue Inode, friert Snapshots nicht ein)
#   - Roh-Session-Daten + Medien als HARDLINKS (immutable -> ~0 Extra-Platz)
# DATABASE_URL kommt aus dem systemd-EnvironmentFile (.env).
set -euo pipefail

# PROJECT robust aus dem Skript-Ort ableiten (Repo liegt unter /home/jan, nicht /opt).
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$(dirname "$HERE")/server"
BASE="${BACKUP_BASE:-/opt/foil/backups/pumpfoil.org}"
LATEST="$BASE/latest-backup"
mkdir -p "$LATEST"

: "${DATABASE_URL:?DATABASE_URL nicht gesetzt}"
LIBPQ="${DATABASE_URL/postgresql+psycopg:/postgresql:}"

# 1) DB-Dump (custom/komprimiert), atomar ersetzen
pg_dump --format=custom --no-owner --file "$LATEST/db.dump.tmp" "$LIBPQ"
mv -f "$LATEST/db.dump.tmp" "$LATEST/db.dump"

# 2) Roh-Daten + Medien als Hardlinks spiegeln (--link-dest = Quelle -> identische
#    Dateien werden gehardlinkt statt kopiert; --delete hält latest = aktueller Stand)
rsync -a --delete --link-dest="$PROJECT/data/"  "$PROJECT/data/"  "$LATEST/data/"
rsync -a --delete --link-dest="$PROJECT/media/" "$PROJECT/media/" "$LATEST/media/"

echo "latest-backup ok: db.dump $(du -h "$LATEST/db.dump" | cut -f1), gesamt $(du -sh "$LATEST" | cut -f1)"
