#!/usr/bin/env bash
# Erzeugt aus der Basis (base/) den kompletten Logo-/Icon-Satz an seine Zielorte:
#  - web/public/      = LIVE-Web-Runtime (Favicons, PWA-Icons, OAuth/OG-Logo, Header-Wortmarken)
#  - brand/logo/      = kanonischer Referenz-Satz (die 6 Logos)
#  - brand/app-icons/ = App-Icon-Master 1024 (light+dark) -> Quelle fuer Apple/Android/Garmin/Watch
# Nach Aenderungen an base/ einfach neu laufen lassen.  Aufruf: ./build.sh
set -euo pipefail
cd "$(dirname "$0")"                        # brand/master/
PY="${PY:-../../server/.venv/bin/python}"
G() { "$PY" gen.py "$@"; }

REPO=../..
WEB=$REPO/web/public
REF=$REPO/brand/logo
ICO=$REPO/brand/app-icons

echo "== Web/PWA-Icons (icon light = cyan Kachel + weisse Wellen, flach) =="
G --type icon --theme light --size 512 --pad 0 --out "$WEB/icon-512.png"
G --type icon --theme light --size 192 --pad 0 --out "$WEB/icon-192.png"
G --type icon --theme light --size 180 --pad 0 --out "$WEB/apple-touch-icon.png"
G --type icon --theme light --size 32  --pad 0 --out "$WEB/favicon-32.png"
G --type icon --theme light --size 16  --pad 0 --out "$WEB/favicon-16.png"
# OAuth-/OG-Logo (gleiche Marke)
G --type icon --theme light --size 512 --pad 0 --out "$WEB/oauth-logo-512.png"
G --type icon --theme light --size 120 --pad 0 --out "$WEB/oauth-logo-120.png"

echo "== Web-Header: horizontales Lockup (transparent, tight), dark + light =="
G --type horizontal --theme dark  --size fit --out "$WEB/wordmark-h-dark.png"
G --type horizontal --theme light --size fit --out "$WEB/wordmark-h-light.png"

echo "== Login/Landing-Hero: gestapeltes Lockup + Tagline (transparent, tight), dark + light =="
G --type stacked --theme dark  --size fit --out "$WEB/wordmark-stacked-dark.png"
G --type stacked --theme light --size fit --out "$WEB/wordmark-stacked-light.png"

echo "== Referenz-Satz: die 6 Logos (brand/logo) =="
G --type icon       --theme light --size 1024 --pad 0        --out "$REF/logo-icon-light.png"
G --type icon       --theme dark  --size 1024 --pad 0        --out "$REF/logo-icon-dark.png"
G --type stacked    --theme dark  --size 1400x1100 --pad 0.14 --out "$REF/logo-stacked-dark.png"
G --type stacked    --theme light --size 1400x1100 --pad 0.14 --out "$REF/logo-stacked-light.png"
G --type horizontal --theme dark  --size 1800x520 --pad 0.12  --out "$REF/logo-horizontal-dark.png"
G --type horizontal --theme light --size 1800x520 --pad 0.12  --out "$REF/logo-horizontal-light.png"

echo "== App-Icon-Master 1024 (brand/app-icons) — Quelle fuer Apple/Android/Garmin/Watch-Embeds =="
G --type icon --theme light --size 1024 --pad 0 --out "$ICO/icon-1024-light.png"
G --type icon --theme dark  --size 1024 --pad 0 --out "$ICO/icon-1024-dark.png"

echo "fertig."
