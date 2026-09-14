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

# ABSICHTLICH DEUTSCH — mit Grund. Ohne diese Liste ist die Ausgabe nie null, und eine Pruefung,
# die immer Treffer meldet, liest irgendwann niemand mehr. Wer hier etwas eintraegt, schreibt den
# Grund dazu; wer eine Zeile streicht, hat den Fall behoben.
ERLAUBT = {
    "web/src/pages/Systemarchitektur.tsx":
        "Die Seite ist laut eigener Kopfzeile nur auf Deutsch — bewusste Entscheidung.",
    "web/src/pages/Admin.tsx":
        "Admin-Bereich, den nur Jan sieht.",
    "web/src/lib/fields.ts":
        "`label` ist ein INTERNER Name. Angezeigt wird `t(`field.<id>`)` — nachgeprueft 14.09.2026.",
    "web/src/components/LanguageSelect.tsx":
        "„Sprache / Language“ ist absichtlich zweisprachig: wer die Oberflaeche nicht "
        "lesen kann, soll genau diesen Eintrag finden.",
    "web/src/pages/NerdAnalysen.tsx":  "Titel/Beschreibung einer nur deutschen Seite.",
    "web/src/pages/NerdAnalysen2.tsx": "Titel/Beschreibung einer nur deutschen Seite.",
    "web/src/pages/NerdAnalysen3.tsx": "Titel/Beschreibung einer nur deutschen Seite.",
    "web/src/App.tsx":
        "Tooltip am Navigationseintrag zu einer nur deutschen Seite — ein uebersetzter Tooltip "
        "wuerde Inhalte versprechen, die es in der Sprache nicht gibt.",
}

# Einzelne Texte, die ueberall erlaubt sind — mit Grund.
ERLAUBT_TEXTE = {
    "↻ Rating-Test zurücksetzen":
        "Steht in beiden Handy-Apps hinter #if DEBUG bzw. BuildConfig.DEBUG und wird nie "
        "ausgeliefert. Entwickler-Werkzeug, darf deutsch sein.",
}

# In eingesetzten Ausdruecken stehen VARIABLENNAMEN, kein Anzeigetext: \(b.von) in Swift,
# ${b.von} in Kotlin/JS. Ohne diese Bereinigung meldet das Skript „von"/„bis" aus Bezeichnern
# als deutsche Woerter (14.09.2026: vier Fehlalarme allein aus zwei Zeilen).
EINSETZUNG = re.compile(r"\\\((?:[^()]|\([^()]*\))*\)|\$\{(?:[^{}]|\{[^{}]*\})*\}")

LITERAL = re.compile(r'"((?:[^"\\\n]|\\.){2,})"')
# "key.mit.punkten": …  /  "key" to …  — eine Zeile aus einer Sprachtabelle.
TABELLENZEILE = re.compile(r'"[\w.]+"\s*(?::|to\s)')


def einstufen(zeile: str) -> str:
    if LOGZEILE.search(zeile):
        return "LOG"
    if SCREENREADER.search(zeile):
        return "SCREENREADER"
    # Ein Vergleich gegen eine Zeichenkette ist ein Zustandswert, kein Anzeigetext. `.includes`
    # gehoert dazu: Login.tsx erkennt daran die deutschen Fehlertexte des Servers und setzt
    # eine UEBERSETZTE Meldung dafuer ein — vorbildlich, aber es sah nach einem Fehler aus.
    if re.search(r'[=!]=+\s*"|"\s*[=!]=+|\.equals\(|\.includes\(\s*"|\.contains\(\s*"|'
                 r'\.hasPrefix\(\s*"|\.startsWith\(\s*"', zeile):
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
    gesamt = {"SICHTBAR": 0, "SCREENREADER": 0, "INTERN": 0, "LOG": 0, "ERLAUBT": 0}

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
                imblock = False
                for nr, zeile in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                    # Mehrzeilige Kommentare: /* … */ und JSX {/* … */}. Deutscher Fliesstext
                    # darin ist Doku, kein Anzeigetext.
                    if imblock:
                        if "*/" in zeile:
                            imblock = False
                            zeile = zeile.split("*/", 1)[1]
                        else:
                            continue
                    while "/*" in zeile:
                        vor, rest = zeile.split("/*", 1)
                        if "*/" in rest:
                            zeile = vor + rest.split("*/", 1)[1]
                        else:
                            zeile = vor
                            imblock = True
                            break
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
                        if lit in ERLAUBT_TEXTE:
                            continue
                        pruef = EINSETZUNG.sub(" ", lit)
                        if UMLAUTE.search(pruef) or WOERTER.search(pruef):
                            rel = str(p.relative_to(WURZEL))
                            art = "ERLAUBT" if rel in ERLAUBT else einstufen(zeile)
                            funde.append((art, rel, nr, lit))
        titel = PLATTFORMEN[name][0][3].split(" (")[0]
        print(f"\n{'=' * 78}\n{titel}\n{'=' * 78}")
        if not funde:
            print("  nichts gefunden")
            continue
        for art in ("SICHTBAR", "SCREENREADER", "INTERN", "LOG", "ERLAUBT"):
            teil = [f for f in funde if f[0] == art]
            gesamt[art] += len(teil)
            if not teil or (art in ("INTERN", "LOG", "ERLAUBT") and not args.alles):
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
