#!/usr/bin/env python3
"""Sperre gegen Nutzerdaten im oeffentlichen Repo.

WARUM (29.10.2026): Am 31.08. ging ein Sicherungsordner aus `tmp/` mit in einen Commit —
Session-Zeilen von 16 Nutzern samt Rohdaten (GPS, Beschleunigung). Das Repo ist oeffentlich, und
was einmal gepusht ist, laesst sich nicht vollstaendig zurueckholen (Forks, Klone). Seitdem prueft
dieses Skript jede neue oder geaenderte Datei, BEVOR sie das Repo verlaesst:

  * pre-commit-Hook (scripts/git-hooks/pre-commit): `--staged`, haelt den Commit an.
  * CI (.github/workflows/ci.yml): `--range A..B`, faengt Commits ab, die ohne Hook entstanden sind.

Geprueft werden nur NEUE/GEAENDERTE Dateien, nicht der ganze Baum. Gesperrt ist:
  1. alles unter tmp/ und Ordner, die nach Sicherung/Dump/Export heissen,
  2. Archive, Datenbank-Abzuege, Rohdaten (.bin/.t0) und Aufzeichnungen (.fit/.tcx), Schluessel,
  3. Datendateien (.json/.csv/...), die nach Nutzer-Tabellen aussehen (user_id + Ort/Token/E-Mail ...),
  4. grosse Dateien ausser Bildern/Videos/Modellen,
  5. private Schluessel und Verbindungs-URLs mit Passwort — und, wenn server/.env da ist (VM),
     jeder Wert daraus.

Bewusst gewollte Ausnahme: den Pfad in `.datenleck-ausnahmen` eintragen, mit Grund als Kommentar.
"""
from __future__ import annotations

import fnmatch
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                           check=True).stdout.strip())

ORDNER = re.compile(r"(^|/)(tmp|[^/]*(backup|sicherung|dump|export)[^/]*)/", re.I)
ENDUNGEN = (".tar", ".gz", ".tgz", ".zip", ".7z", ".xz", ".bz2", ".zst", ".sql", ".dump", ".pgdump",
            ".db", ".sqlite", ".sqlite3", ".bin", ".t0", ".fit", ".tcx", ".pem", ".der", ".p12", ".key",
            ".env")
DATEN = (".json", ".jsonl", ".ndjson", ".csv", ".tsv")
# Schluessel, die zusammen mit user_id nach einem Tabellenabzug aussehen.
VERRAETERISCH = ("place_lat", "place_lon", "share_token", "email", "password_hash", "session_uuid",
                 "token", "lat", "lon", "hr")
GROSS_OK = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".pkl", ".jar")
GROSS_BYTES = 5_000_000
GEHEIM = [
    (re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "privater Schluessel"),
    # Platzhalter (`<pw>`, `${...}`) und das Wegwerf-Passwort des CI-Containers (`foil`) zaehlen nicht.
    (re.compile(rb"postgres(?:ql)?(?:\+\w+)?://[^:/\s]+:(?!foil@|postgres@|password@)[^@\s<$]{4,}@"),
     "Datenbank-URL mit Passwort"),
]
# Aus server/.env zaehlen nur Eintraege, deren NAME nach Geheimnis klingt — BASE_URL, Client-IDs oder
# der VAPID-Public-Key oder die Absender-Adresse (SMTP_USER), die Bot-Adresse und
# Pfade (*_FILE) stehen absichtlich im Code/in der Doku. Kurze Werte werden ohnehin uebergangen.
ENV_MINDESTLAENGE = 12
ENV_GEHEIM = re.compile(r"SECRET|PASS|PRIVATE|TOKEN|DATABASE_URL|SUBSCRIPTION_KEY|^JWT")


def ausnahmen() -> list[str]:
    f = ROOT / ".datenleck-ausnahmen"
    if not f.exists():
        return []
    return [z.split("#", 1)[0].strip() for z in f.read_text().splitlines() if z.split("#", 1)[0].strip()]


def env_werte() -> list[bytes]:
    f = ROOT / "server" / ".env"
    if not f.exists():
        return []
    werte = []
    for z in f.read_text().splitlines():
        if "=" in z and not z.lstrip().startswith("#"):
            k, v = z.split("=", 1)
            v = v.strip().strip('"').strip("'")
            if ENV_GEHEIM.search(k.strip()) and not k.strip().endswith("_FILE") and len(v) >= ENV_MINDESTLAENGE:
                werte.append(v.encode())
    return werte


def dateien(staged: bool, bereich: str | None) -> list[tuple[str, bytes]]:
    if staged:
        namen = subprocess.run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
                               capture_output=True, check=True, cwd=ROOT).stdout
        lesen = lambda p: subprocess.run(["git", "show", f":{p}"], capture_output=True, check=True,
                                         cwd=ROOT).stdout
    else:
        namen = subprocess.run(["git", "diff", "--name-only", "--diff-filter=ACMR", "-z", bereich],
                               capture_output=True, check=True, cwd=ROOT).stdout
        ende = bereich.split("..")[-1]
        lesen = lambda p: subprocess.run(["git", "show", f"{ende}:{p}"], capture_output=True, check=True,
                                         cwd=ROOT).stdout
    return [(p, lesen(p)) for p in namen.decode().split("\0") if p]


def sieht_nach_tabelle_aus(pfad: str, inhalt: bytes) -> bool:
    kopf = inhalt[:200_000].decode("utf-8", "replace").lower()
    if pfad.lower().endswith((".csv", ".tsv")):
        spalten = set(re.split(r"[,;\t]", kopf.splitlines()[0])) if kopf else set()
        spalten = {s.strip().strip('"') for s in spalten}
    else:
        spalten = set(re.findall(r'"([a-z_]+)"\s*:', kopf))
    return "user_id" in spalten and bool(spalten & set(VERRAETERISCH))


def pruefen(pfad: str, inhalt: bytes, env: list[bytes]) -> list[str]:
    gruende = []
    klein = pfad.lower()
    if ORDNER.search("/" + pfad):
        gruende.append("liegt in einem Sicherungs-/tmp-Ordner")
    if klein.endswith(ENDUNGEN) or (Path(klein).name.startswith(".env") and not klein.endswith(".example")):
        gruende.append(f"Dateityp {Path(pfad).suffix or Path(pfad).name} (Archiv/Abzug/Rohdaten/Schluessel)")
    if klein.endswith(DATEN) and sieht_nach_tabelle_aus(pfad, inhalt):
        gruende.append("sieht nach einem Tabellenabzug mit Nutzerdaten aus (user_id + Ort/Token/E-Mail)")
    if len(inhalt) > GROSS_BYTES and not klein.endswith(GROSS_OK):
        gruende.append(f"{len(inhalt) / 1e6:.1f} MB gross")
    for muster, was in GEHEIM:
        if muster.search(inhalt):
            gruende.append(f"enthaelt {was}")
    if any(v in inhalt for v in env):
        gruende.append("enthaelt einen Wert aus server/.env")
    return gruende


def main() -> int:
    args = sys.argv[1:]
    staged = args == ["--staged"]
    bereich = args[1] if len(args) == 2 and args[0] == "--range" else None
    if not staged and not bereich:
        print("Aufruf: datenleck-pruefen.py --staged | --range A..B", file=sys.stderr)
        return 2
    erlaubt = ausnahmen()
    env = env_werte()
    funde = []
    for pfad, inhalt in dateien(staged, bereich):
        if any(fnmatch.fnmatch(pfad, a) for a in erlaubt):
            continue
        for g in pruefen(pfad, inhalt, env):
            funde.append(f"{pfad}: {g}")
    if funde:
        print("DATENLECK-SPERRE: diese Dateien gehoeren nicht ins oeffentliche Repo:")
        print("\n".join(f"  {f}" for f in funde))
        print("Wenn eine davon wirklich hinein soll: Pfad mit Grund in .datenleck-ausnahmen eintragen.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
