#!/usr/bin/env python3
"""Findet DEUTSCHE Texte, die fest im Code stehen statt durch die Sprachtabelle zu laufen.

    python3 scripts/unuebersetzt.py              # alle Plattformen
    python3 scripts/unuebersetzt.py --nur android
    python3 scripts/unuebersetzt.py --alles      # auch Log-/Debug-Zeilen zeigen

WARUM ES DAS GIBT: am 14.09.2026 meldete ein Nutzer (u187, Profilsprache Englisch) „there are
some German words in the English interface in a phone app". Er hatte recht — die
Zusammenfassungszeile unter jeder Session sagte in JEDER Sprache „3 Laeufe", weil dort
`if (n == 1) "Lauf" else "Laeufe"` im Code stand statt eines Schluessels. Die PWA macht es an
genau derselben Stelle richtig. So etwas findet kein Mensch durch Draufschauen, und auffallen
tut es erst einem Nutzer — das ist die teuerste Art, es zu erfahren.

WAS GEFUNDEN WIRD: Zeichenketten mit Umlauten oder eindeutig deutschen Funktionswoertern in
Quelldateien, die NICHT die Sprachtabellen selbst sind.

WAS EINGESTUFT WIRD (die Ausgabe sortiert danach, nichts wird stumm verschluckt):
  SICHTBAR      — steht so auf dem Bildschirm. Das ist der Fehler.
  SCREENREADER  — contentDescription/accessibilityLabel. Unsichtbar, aber fuer blinde Nutzer
                  falsch; zweite Prioritaet.
  INTERN        — Zustandswerte, die im Code verglichen werden (z.B. status == "gespeichert").
                  Haesslich, aber niemand sieht sie. Kein Fehler.
  LOG           — console.log/print/Log. Entwickler-Ausgabe, bleibt deutsch.

Der Unterschied zwischen SICHTBAR und INTERN laesst sich nicht immer maschinell entscheiden.
Im Zweifel meldet das Skript SICHTBAR — lieber einmal zu viel hinsehen.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

WURZEL = pathlib.Path(__file__).resolve().parents[1]

# Eindeutig deutsch. Bewusst NICHT drin: "Foil", "Lauf", "Start", "Stop", "Info", "Status" —
# die stehen auch im Englischen und erzeugen nur Rauschen. Ein erster Versuch mit "Foil" in
# der Liste meldete 36 Fehlalarme und keinen einzigen echten Treffer.
WOERTER = re.compile(
    r"\b(?:der|die|das|den|dem|des|eine|einen|einem|nicht|und|oder|mit|für|fuer|auf|aus|von|"
    r"zum|zur|noch|kein|keine|wird|wurde|werden|sind|hast|haben|deine|deinen|dein|meine|beim|"
    r"vom|nach|bitte|schon|mehr|Uhr|Aufnahme|Einstellungen|Sprache|Fehler|Sitzung|angezeigt|"
    r"gespeichert|verbunden|abgebrochen|fehlgeschlagen|Läufe|Läuf|zurücksetzen|ändern|"
    r"hinzufügen|Zurück|Profilbild|Anzeigename)\b")
UMLAUTE = re.compile(r"[äöüÄÖÜß]")

SCREENREADER = re.compile(r"contentDescription|accessibilityLabel|contentDescription\s*=")
LOGZEILE = re.compile(r"console\.log|console\.warn|console\.error|\bprint\(|Log\.[dewiv]\(|"
                      r"System\.(?:out|err)|logger\.|log\.(?:info|debug|warn|error)")

# (Ordner, Dateimuster, Dateien die AUSGELASSEN werden, Anzeigename)
PLATTFORMEN = {
    # `.i18n.ts` sind ebenfalls Sprachtabellen (die Texte der Nerd-Seiten), sie liegen nur nicht
    # im i18n-Ordner. Ohne diese Ausnahme kommen 531 Fehlalarme aus drei Dateien.
    "web":     [("web/src", "**/*.tsx", ("i18n/",), "PWA (tsx)"),
                ("web/src", "**/*.ts", ("i18n/", ".i18n.ts"), "PWA (ts)")],
    "android": [("android/app/src/main/java/org/pumpfoil/app", "*.kt", ("I18n",), "Android-Handy")],
    "wear":    [("android/wear/src/main/java/org/pumpfoil/watch", "*.kt", ("I18n",), "Wear OS")],
    "ios":     [("watch-apple/Sources-iOS", "*.swift", ("Loc",), "iPhone")],
    "apple":   [("watch-apple/Sources", "*.swift", ("Loc",), "Apple Watch")],
    "garmin":  [("watch/source", "*.mc", ("Strings",), "Garmin")],
    "zepp":    [("watch-zepp", "page/*.js", (), "Zepp (Uhr)"),
                ("watch-zepp", "app-side/*.js", (), "Zepp (Bruecke)")],
}

LITERAL = re.compile(r'"((?:[^"\\\n]|\\.){2,})"')
# "key.mit.punkten": …  /  "key" to …  — eine Zeile aus einer Sprachtabelle.
TABELLENZEILE = re.compile(r'"[\w.]+"\s*(?::|to\s)')


def einstufen(zeile: str) -> str:
    if LOGZEILE.search(zeile):
        return "LOG"
    if SCREENREADER.search(zeile):
        return "SCREENREADER"
    # Ein Vergleich gegen eine Zeichenkette ist ein Zustandswert, kein Anzeigetext.
    if re.search(r'[=!]=+\s*"|"\s*[=!]=+|\.equals\(', zeile):
        return "INTERN"
    return "SICHTBAR"


def codeteil(zeile: str) -> str:
    """Zeile ohne Zeilenend-Kommentar. Grob, aber Anfuehrungszeichen werden respektiert."""
    out, instr, esc = [], False, False
    i = 0
    while i < len(zeile):
        ch = zeile[i]
        if instr:
            out.append(ch)
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                instr = False
        else:
            if ch == '"':
                instr = True
                out.append(ch)
            elif zeile.startswith("//", i) or zeile.startswith("#", i):
                break
            else:
                out.append(ch)
        i += 1
    return "".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--nur", help="nur eine Plattform: " + ", ".join(PLATTFORMEN))
    ap.add_argument("--alles", action="store_true", help="auch LOG und INTERN zeigen")
    args = ap.parse_args()

    namen = [args.nur] if args.nur else list(PLATTFORMEN)
    gesamt = {"SICHTBAR": 0, "SCREENREADER": 0, "INTERN": 0, "LOG": 0}

    for name in namen:
        if name not in PLATTFORMEN:
            sys.exit(f"Unbekannte Plattform {name!r} — moeglich: {', '.join(PLATTFORMEN)}")
        funde: list[tuple[str, str, int, str]] = []
        for ordner, muster, aus, anzeige in PLATTFORMEN[name]:
            basis = WURZEL / ordner
            if not basis.exists():
                continue
            for p in sorted(basis.glob(muster)):
                if any(a in str(p.relative_to(basis)) for a in aus):
                    continue
                for nr, zeile in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                    s = zeile.lstrip()
                    if s.startswith(("//", "*", "/*", "#")):
                        continue
                    # Zeilen einer SPRACHTABELLE ueberspringen. Die Zepp-App traegt ihre Tabelle
                    # INLINE in page/index.js, nicht in einer eigenen Datei — ohne diesen Filter
                    # meldet das Skript jede einzelne Uebersetzung als Fehler (erster Lauf am
                    # 14.09.2026: 679 Treffer, davon fast alle aus dieser einen Tabelle).
                    # Erkannt an der Form: der Schluessel steht am Zeilenanfang.
                    if TABELLENZEILE.match(s):
                        continue
                    code = codeteil(zeile)
                    for m in LITERAL.finditer(code):
                        lit = m.group(1)
                        if UMLAUTE.search(lit) or WOERTER.search(lit):
                            funde.append((einstufen(zeile), str(p.relative_to(WURZEL)), nr, lit))
        titel = PLATTFORMEN[name][0][3].split(" (")[0]
        print(f"\n{'=' * 78}\n{titel}\n{'=' * 78}")
        if not funde:
            print("  nichts gefunden")
            continue
        for art in ("SICHTBAR", "SCREENREADER", "INTERN", "LOG"):
            teil = [f for f in funde if f[0] == art]
            gesamt[art] += len(teil)
            if not teil or (art in ("INTERN", "LOG") and not args.alles):
                if teil:
                    print(f"  [{art}] {len(teil)} — mit --alles anzeigen")
                continue
            print(f"  [{art}] {len(teil)}")
            for _, datei, nr, lit in teil:
                print(f"     {datei}:{nr}\n        {lit[:100]}")

    print(f"\n{'=' * 78}")
    print("  ".join(f"{k}: {v}" for k, v in gesamt.items()))
    print("SICHTBAR ist der Fehler. SCREENREADER ist fuer blinde Nutzer derselbe Fehler.")
    print("=" * 78)
    return 1 if gesamt["SICHTBAR"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
