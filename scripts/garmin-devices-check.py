#!/usr/bin/env python3
"""Vergleicht die INSTALLIERTEN Connect-IQ-Geraetedateien mit unserem Manifest. Rein lesend.

    python3 scripts/garmin-devices-check.py

Warum es das gibt: neue Garmin-Uhren erscheinen im Connect IQ SDK Manager, ohne dass wir es
mitbekommen — die fenix 9 und fenix 9 Pro lagen dort ab dem 25.08.2026, unser Manifest fuehrte sie
Tage spaeter noch nicht (gefunden am 01.09. nur, weil ich fuer eine ganz andere Frage im
Ankuendigungsforum gelesen habe). Dieses Skript macht daraus einen Befehl.

Der Ablauf, wenn etwas fehlt:
  1. Jan: SDK Manager auf dem Mac oeffnen, die neuen Geraete anhaken, herunterladen.
     (Geht nur dort — der Manager ist ein GUI-Programm ohne CLI, und die Geraeteliste kommt aus
     Garmins ANGEMELDETEM Dienst `api.gcs.garmin.com`. Ohne Garmin-Konto kein Download.)
  2. Geraeteordner hierher bringen (nach ~/.Garmin/ConnectIQ/Devices/) oder als Tarball geben.
  3. Dieses Skript nochmal laufen lassen -> es nennt die `iq:product`-Zeilen fuers Manifest.
  4. `iq:product` ergaenzen, dann `SDK_HOME=... ./build-all.sh` (ACHTUNG: `watch/bin` ist LIVE,
     also nur im Rahmen eines Release-Durchlaufs) und ein Store-Release.
"""
import os
import re
import sys
from pathlib import Path

# BEWUSST NICHT unterstuetzt — sonst meldet dieses Skript bei jedem Lauf 44 Fehlalarme und wird
# ignoriert. Grund je Gruppe (die Regel stand vorher NIRGENDS, s. watch/README.md):
#
#   * Radcomputer und Handgeraete (edge*, gpsmap*, montana*, oregon*, rino*, etrextouch):
#     sitzen nicht am Handgelenk. Kein Handgelenk-Accel, kein Puls -> unsere Erkennung hat dort
#     keine Datengrundlage.
#   * Golf/Aviatik-Altgeraete (approachs60, d2bravo*, d2charlie): dieselbe Generation wie die
#     alten fenix, zu wenig Speicher/zu alte API.
#   * Alte Uhren (fenix3*, epix Gen 1, fr230/235/45/630/735xt/920xt, vivoactive Gen 1,
#     vivoactive_hr, garminswim2): unter unserer API-/Speicher-Untergrenze.
#
# Kommt ein Geraet NEU dazu, das hier nicht steht, ist es ein echter Fund.
NICHT_UNTERSTUETZT = {
    "approachs60", "d2bravo", "d2bravo_titanium", "d2charlie",
    "edge1030", "edge1030bontrager", "edge1030plus", "edge1040", "edge1050", "edge130",
    "edge130plus", "edge520plus", "edge530", "edge540", "edge550", "edge820", "edge830",
    "edge840", "edge850", "edge_1000", "edge_520", "edgeexplore", "edgeexplore2", "edgemtb",
    "epix", "etrextouch", "fenix3", "fenix3_hr", "fr230", "fr235", "fr45", "fr630", "fr735xt",
    "fr920xt", "garminswim2", "gpsmap66", "gpsmap67", "gpsmap86", "gpsmaph1", "montana7xx",
    "oregon7xx", "rino7xx", "vivoactive", "vivoactive_hr",
}

REPO = Path(__file__).resolve().parent.parent
MANIFEST = REPO / "watch" / "manifest.xml"
DEVDIR = Path(os.environ.get("DEVDIR", Path.home() / ".Garmin" / "ConnectIQ" / "Devices"))


def main() -> int:
    if not MANIFEST.exists():
        sys.exit(f"Manifest nicht gefunden: {MANIFEST}")
    im_manifest = set(re.findall(r'(?<=iq:product id=")[^"]+', MANIFEST.read_text()))

    if not DEVDIR.exists():
        print(f"Geraete-Verzeichnis fehlt: {DEVDIR}")
        print(f"Im Manifest stehen {len(im_manifest)} Geraete. Ohne die Geraetedateien ist kein "
              f"Abgleich moeglich — s. Kopf dieser Datei.")
        return 1
    # AppleDouble-Reste (._name) ignorieren: die entstehen beim Packen auf dem Mac.
    installiert = {p.name for p in DEVDIR.iterdir() if p.is_dir() and not p.name.startswith("._")}

    alle_fehlend = installiert - im_manifest
    bewusst = sorted(alle_fehlend & NICHT_UNTERSTUETZT)
    fehlt_im_manifest = sorted(alle_fehlend - NICHT_UNTERSTUETZT)
    fehlt_installiert = sorted(im_manifest - installiert)

    print(f"Manifest: {len(im_manifest)} Geraete · installiert: {len(installiert)}\n")
    if bewusst:
        print(f"  {len(bewusst)} Geraet(e) bewusst nicht unterstuetzt (Radcomputer, Handgeraete, "
              f"Altgeraete — Begruendung im Kopf dieser Datei).")
    if fehlt_im_manifest:
        print(f"⚠ {len(fehlt_im_manifest)} NEUE(S) Geraet(e) installiert, aber NICHT im Manifest — "
              f"diese Zeilen fehlen in watch/manifest.xml:")
        for d in fehlt_im_manifest:
            print(f'        <iq:product id="{d}"/>')
        print()
    if fehlt_installiert:
        print(f"⚠ {len(fehlt_installiert)} Geraet(e) im Manifest, aber NICHT installiert — "
              f"dafuer kann `build-all.sh` nicht bauen:")
        print("        " + ", ".join(fehlt_installiert))
        print()
    if not fehlt_im_manifest and not fehlt_installiert:
        print("✓ Nichts zu tun: alle installierten Geraete sind entweder im Manifest oder "
              "bewusst ausgelassen.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
