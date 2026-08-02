#!/usr/bin/env bash
# Verschlüsseltes Backup der GEHEIMNISSE, die auf der VM liegen und in keinem normalen Backup
# stecken (db.dump/data/media enthalten sie bewusst nicht):
#   - server/.env                 (DB-Zugang, OAuth-Secrets, VAPID-Public, DETECTOR-Schalter)
#   - server/vapid_private.pem    (Web-Push-Signatur)
#   - connectiq developer_key.der (Garmin-Signing-Key — UNERSETZLICH: ohne ihn kann nie wieder
#                                  ein Store-Update der bestehenden CIQ-App signiert werden)
#   - optional: Shorts-Tool-Tokens (.tiktok-*.json), falls auf der Maschine vorhanden
#
# Verschlüsselt asymmetrisch an Jans GPG-Key (nur der PUBLIC-Key liegt auf der VM; entschlüsseln
# kann ausschließlich Jan mit seinem privaten Schlüssel). Ergebnis landet als secrets.tar.gz.gpg
# im latest-backup-Ordner und wandert damit automatisch durch die bestehende Pull-Kette
# (VM -> jan-personal-agent -> host17). Aufgerufen am Ende von backup-latest.sh (täglich 03:30).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$HERE")"
BASE="${BACKUP_BASE:-/opt/foil/backups/pumpfoil.org}"
LATEST="$BASE/latest-backup"
mkdir -p "$LATEST"

# Voller Fingerprint statt Key-ID oder Mail-Adresse: pinnt EXAKT den beabsichtigten Schlüssel
# (Jans aktueller, gültig bis 2031); eine Mail-Adresse würde beim nächsten Import eines weiteren
# Keys mehrdeutig. --trust-model always, weil der Key hier bewusst unsigniert importiert ist.
RECIPIENT="65DCECE032416CB89041EAEF37715E8551259100"

FILES=(
    "$REPO/server/.env"
    "$REPO/server/vapid_private.pem"
    "/home/jan/connectiq-sdk-9.2.0/developer_key.der"
)
# Optionale Kandidaten: nur mitnehmen, was existiert (Shorts-Tool-Tokens liegen je nach
# Maschine auch woanders).
for f in "$REPO"/social-media/scripts/.tiktok-*.json; do
    [ -e "$f" ] && FILES+=("$f")
done

VORHANDEN=()
for f in "${FILES[@]}"; do
    if [ -e "$f" ]; then VORHANDEN+=("$f"); else echo "WARNUNG: fehlt: $f" >&2; fi
done
[ "${#VORHANDEN[@]}" -gt 0 ] || { echo "keine Secrets gefunden — nichts zu tun" >&2; exit 1; }

# tar mit absoluten Pfaden (-P): beim Wiederherstellen bewusst mit --strip oder -C auspacken.
# Atomar via tmp+mv, wie der db.dump.
tar -czPf - "${VORHANDEN[@]}" \
    | gpg --batch --yes --encrypt --recipient "$RECIPIENT" --trust-model always \
          --output "$LATEST/secrets.tar.gz.gpg.tmp"
mv -f "$LATEST/secrets.tar.gz.gpg.tmp" "$LATEST/secrets.tar.gz.gpg"

echo "secrets-backup ok: ${#VORHANDEN[@]} Dateien, $(du -h "$LATEST/secrets.tar.gz.gpg" | cut -f1)"
