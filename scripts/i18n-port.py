#!/usr/bin/env python3
"""Sprachschluessel aus der Web-PWA in die nativen Apps uebertragen.

Die Uebersetzungen stehen fuer alle 17 Sprachen bereits in web/src/i18n/locales/*.ts.
Android und iOS halten dieselben Texte in vier grossen Tabellen:

  android/.../I18n.kt       Basiszeile row(de, gsw, de-AT, en, fr, it, es) + Overlays fi, nl, cs
  android/.../I18nExtra.kt  Overlays pt, ja, zh, ru, id, nb, pl
  watch-apple/.../Loc.swift      Basiszeile r(...) + Overlays cs, nl, fi
  watch-apple/.../LocExtra.swift Overlays pt, ja, zh, ru, id, nb, pl

Von Hand ist das 14 Einfuegungen je Schluessel — hier eine. Eingefuegt wird jeweils am
ANFANG des Blocks (dort stehen auch die zuletzt ergaenzten Schluessel), erkannt am
Ankerschluessel ANKER. Fehlt eine Uebersetzung im Web, faellt der Eintrag weg und die
App greift auf Englisch zurueck (so ist Loc.t/I18n.t gebaut) — lieber Luecke als geraten.

Aufruf:  scripts/i18n-port.py spotcmp.title spotcmp.pick ...
         scripts/i18n-port.py --pruefen <keys>   (nur zeigen, nichts schreiben)
"""
import re, sys, pathlib

WURZEL = pathlib.Path(__file__).resolve().parent.parent
ANKER = "cr.foilAll"          # steht in JEDEM Block als erster Eintrag
BASIS = ["de", "gsw", "de-AT", "en", "fr", "it", "es"]

DATEIEN = {
    "kt_basis":  ("android/app/src/main/java/org/pumpfoil/app/I18n.kt",      ["fi", "nl", "cs"]),
    "kt_extra":  ("android/app/src/main/java/org/pumpfoil/app/I18nExtra.kt", ["pt", "ja", "zh", "ru", "id", "nb", "pl"]),
    "sw_basis":  ("watch-apple/Sources-iOS/Loc.swift",                        ["cs", "nl", "fi"]),
    "sw_extra":  ("watch-apple/Sources-iOS/LocExtra.swift",                   ["pt", "ja", "zh", "ru", "id", "nb", "pl"]),
}

def web_texte() -> dict:
    """{sprache: {key: text}} aus den Web-Locales. Nur einzeilige Eintraege — so sind sie dort."""
    aus = {}
    for f in sorted((WURZEL / "web/src/i18n/locales").glob("*.ts")):
        sprache = f.stem
        tab = {}
        for zeile in f.read_text(encoding="utf-8").splitlines():
            m = re.match(r'\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?\s*$', zeile)
            if m:
                tab[m.group(1)] = m.group(2)
        aus[sprache] = tab
    return aus

def kt(text: str) -> str:
    """Kotlin: $ startet eine Template-Ersetzung und muss weg."""
    return text.replace("$", "\\$")

def block_sprache(zeilen, i, sprachen):
    """Zu welcher Sprache gehoert der Anker in Zeile i? Rueckwaerts die naechste Deklaration."""
    for j in range(i, -1, -1):
        m = re.search(r"(?:val|let)\s+_?(\w+?)(?:Overlay|Tabelle|tabelle)", zeilen[j])
        if m:
            name = m.group(1).lower()
            for s in sprachen:
                if name.startswith(s.lower()):
                    return s
            return None
        if re.search(r"private (?:static )?(?:let|fun)\s+_?(\w+)", zeilen[j]):
            name = re.sub(r"^_", "", re.search(r"private (?:static )?(?:let|fun)\s+_?(\w+)", zeilen[j]).group(1)).lower()
            for s in sprachen:
                if name.startswith(s.lower()):
                    return s
    return None

def main():
    argv = sys.argv[1:]
    nur_zeigen = "--pruefen" in argv
    keys = [a for a in argv if not a.startswith("--")]
    if not keys:
        print(__doc__); return 1
    web = web_texte()
    fehlend = [k for k in keys if k not in web["de"]]
    if fehlend:
        print("Nicht in web/de.ts (Tippfehler?):", ", ".join(fehlend)); return 1

    bilanz = {}
    for art, (rel, overlays) in DATEIEN.items():
        pfad = WURZEL / rel
        zeilen = pfad.read_text(encoding="utf-8").splitlines(keepends=True)
        swift = art.startswith("sw")
        einfuegungen = []          # (index, text)
        for i, z in enumerate(zeilen):
            if f'"{ANKER}"' not in z:
                continue
            einzug = re.match(r"\s*", z).group(0)
            ist_basis = ("row(" in z) or ("r(" in z and swift)
            neu = []
            if ist_basis and art.endswith("basis"):
                for k in keys:
                    werte = [web.get(s, {}).get(k, web["en"].get(k, web["de"][k])) for s in BASIS]
                    if swift:
                        neu.append(f'{einzug}"{k}": r(' + ", ".join(f'"{w}"' for w in werte) + "),\n")
                    else:
                        neu.append(f'{einzug}"{k}" to row(' + ", ".join(f'"{kt(w)}"' for w in werte) + "),\n")
            else:
                s = block_sprache(zeilen, i, overlays)
                if s is None:
                    continue
                for k in keys:
                    wert = web.get(s, {}).get(k)
                    if wert is None:      # keine Uebersetzung -> Luecke lassen, App faellt auf Englisch
                        continue
                    if swift:
                        neu.append(f'{einzug}"{k}": "{wert}",\n')
                    else:
                        neu.append(f'{einzug}"{k}" to "{kt(wert)}",\n')
            if neu:
                einfuegungen.append((i, neu))
        if not nur_zeigen:
            for i, neu in reversed(einfuegungen):
                zeilen[i:i] = neu
            pfad.write_text("".join(zeilen), encoding="utf-8")
        bilanz[rel] = sum(len(n) for _, n in einfuegungen)

    for rel, n in bilanz.items():
        print(f"{'(nur geprueft) ' if nur_zeigen else ''}{n:4d} Zeilen  {rel}")
    fehlt = [(s, k) for s in ("fi","nl","cs","pt","ja","zh","ru","id","nb","pl") for k in keys if k not in web.get(s, {})]
    if fehlt:
        print("\nOhne Uebersetzung im Web (App faellt auf Englisch zurueck):")
        for s, k in fehlt: print(f"   {s}: {k}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
