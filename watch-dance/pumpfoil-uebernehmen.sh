#!/usr/bin/env bash
# Pumpfoil-Aenderungen (watch/) in die Tanz-App (watch-dance/) uebernehmen — NUR in diese Richtung.
#
# HARTE REGEL (Jan, 21.10.2026): Code fliesst nur Pumpfoil -> Tanz, NIE umgekehrt. Dieses Skript
# schreibt ausschliesslich unter watch-dance/ und bricht ab, wenn danach irgendetwas unter watch/
# veraendert ist.
#
# Ablauf: PUMPFOIL_STAND = letzter uebernommener Commit von watch/. Alle Aenderungen an watch/ seit
# dort werden per 3-Wege-Merge auf watch-dance/ gespielt. Konflikte entstehen nur an den DANCE-Stellen
# (App-ID, Name, kein GPS, Kreisel, Puls ...) — dort gilt immer die Tanz-Seite. Danach von Hand
# pruefen, bauen (-r), committen; der neue Stand steht dann in PUMPFOIL_STAND.
#
#   watch-dance/pumpfoil-uebernehmen.sh          # zeigt, was kaeme (Trockenlauf)
#   watch-dance/pumpfoil-uebernehmen.sh --los    # spielt es ein
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
STAND_DATEI=watch-dance/PUMPFOIL_STAND
STAND=$(tr -d '[:space:]' < "$STAND_DATEI")
ZIEL=$(git rev-parse --short HEAD)

if ! git diff --quiet -- watch/ || ! git diff --cached --quiet -- watch/; then
  echo "ABBRUCH: watch/ hat lokale Aenderungen — die gehoeren nicht zu einer Tanz-Uebernahme." >&2; exit 1
fi
echo "Pumpfoil-Commits seit $STAND:"
git log --oneline "$STAND..HEAD" -- watch/ | sed 's/^/  /'
if [ -z "$(git log --oneline "$STAND..HEAD" -- watch/)" ]; then echo "  (keine) — nichts zu tun."; exit 0; fi
[ "${1:-}" = "--los" ] || { echo; echo "Trockenlauf. Mit --los einspielen."; exit 0; }

# Ausgeschlossen: Dateien, die die Tanz-App bewusst NICHT hat bzw. eigene Fassung fuehrt.
git diff --binary "$STAND" HEAD --relative=watch -- watch/ \
  ':(exclude)watch/bin' ':(exclude)watch/manifest.xml' ':(exclude)watch/README.md' ':(exclude)watch/build-all.sh' \
  | git apply -3 --directory=watch-dance --whitespace=nowarn || true

if ! git diff --quiet -- watch/ || ! git diff --cached --quiet -- watch/; then
  echo "ABBRUCH: watch/ wurde veraendert — das darf nie passieren. Bitte 'git checkout -- watch/'." >&2; exit 1
fi
echo "$ZIEL" > "$STAND_DATEI"
echo
echo "Eingespielt bis $ZIEL. Konflikte (<<<<<<<) jetzt aufloesen — an DANCE-Stellen gilt die Tanz-Seite:"
git diff --name-only --diff-filter=U -- watch-dance/ | sed 's/^/  KONFLIKT /' || true
grep -rln '^<<<<<<< ' watch-dance/ 2>/dev/null | sed 's/^/  KONFLIKT /' || true
