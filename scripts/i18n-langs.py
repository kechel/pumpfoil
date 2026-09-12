#!/usr/bin/env python3
"""Sprachliste und Eigenbezeichnungen in die nativen Apps erzeugen — aus EINER Quelle.

    python3 scripts/i18n-langs.py            # Trockenlauf: zeigt Abweichungen
    python3 scripts/i18n-langs.py --echt     # schreibt die erzeugten Bloecke

Quelle ist `web/src/i18n/index.tsx` (`LANGS`): dort stehen Code, Flagge und Eigenbezeichnung
ohnehin zusammen, und dort wird eine neue Sprache zuerst eingetragen.

WARUM ES DAS GIBT: dieselbe Liste stand bis 12.09.2026 an ACHT Stellen im Baum, jede von Hand
gepflegt. Zweimal ist dabei eine Kopie stehengeblieben — in der Android-Anmeldemaske und in der
iOS-Anmeldemaske fehlten Polnisch, Norwegisch und Portugiesisch (Portugal), dort stand dann das
blosse Kuerzel. Ausserdem lief die Reihenfolge auseinander: im Web kam Polnisch nach Tschechisch,
in beiden Apps ganz am Ende. Eine neue Sprache kostete acht Aenderungen; jetzt eine plus einen
Skriptlauf.

WAS ERZEUGT WIRD (zwischen den Markern, alles dazwischen wird ersetzt):
  · android/app/src/main/java/org/pumpfoil/app/I18n.kt   -> LANGS + LANG_NAMES + langName()
  · watch-apple/Sources-iOS/Loc.swift                    -> langs + langNames + langName()

WAS NUR GEPRUEFT WIRD (nicht erzeugbar, weil dort Struktur und nicht nur Daten steht):
  · web `type Lang`  · web `DICTS`  · server `auth.SUPPORTED_LANGS`
Weicht eine davon ab, endet das Skript mit Code 1 und nennt die Differenz.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

WURZEL = pathlib.Path(__file__).resolve().parents[1]
QUELLE = WURZEL / "web/src/i18n/index.tsx"
ANFANG = "// <i18n-langs> ERZEUGT von scripts/i18n-langs.py — NICHT von Hand aendern"
ENDE = "// </i18n-langs>"


def lies_quelle() -> list[tuple[str, str, str]]:
    """(code, flag, native) in der Reihenfolge der Web-Liste."""
    s = QUELLE.read_text(encoding="utf-8")
    block = s[s.index("export const LANGS"):]
    block = block[:block.index("\n];")]
    treffer = re.findall(r'code: "([^"]+)", flag: "([^"]+)", native: "([^"]+)"', block)
    if len(treffer) < 2:
        sys.exit(f"Keine Sprachen in {QUELLE} gefunden — hat sich das Format geaendert?")
    return treffer


def kotlin(sprachen) -> str:
    codes = ", ".join(f'"{c}"' for c, _, _ in sprachen)
    zeilen = "\n".join(f'        "{c}" to "{n}",' for c, _, n in sprachen)
    return f"""{ANFANG}
    // Quelle: web/src/i18n/index.tsx. Reihenfolge wie dort — die Sprachauswahl sieht damit auf
    // allen Plattformen gleich aus.
    val LANGS = listOf({codes})

    /** Eigenbezeichnung je Sprache. */
    val LANG_NAMES = mapOf(
{zeilen}
    )

    /** Anzeigename einer Sprache; unbekannt -> das Kuerzel, damit nie eine leere Zeile steht. */
    fun langName(l: String): String = LANG_NAMES[l] ?: l
    {ENDE}"""


def swift(sprachen) -> str:
    codes = ", ".join(f'"{c}"' for c, _, _ in sprachen)
    zeilen = "\n".join(f'        "{c}": "{n}",' for c, _, n in sprachen)
    return f"""{ANFANG}
    // Quelle: web/src/i18n/index.tsx. Reihenfolge wie dort — die Sprachauswahl sieht damit auf
    // allen Plattformen gleich aus.
    static let langs = [{codes}]

    /// Eigenbezeichnung je Sprache.
    static let langNames: [String: String] = [
{zeilen}
    ]

    /// Anzeigename einer Sprache; unbekannt -> das Kuerzel, damit nie eine leere Zeile steht.
    static func langName(_ l: String) -> String {{ langNames[l] ?? l }}
    {ENDE}"""


def ersetze(pfad: pathlib.Path, neu: str, echt: bool) -> bool:
    s = pfad.read_text(encoding="utf-8")
    if ANFANG not in s or ENDE not in s:
        sys.exit(f"Marker fehlen in {pfad} — einmalig {ANFANG!r} … {ENDE!r} um den Block legen.")
    a = s.index(ANFANG)
    e = s.index(ENDE, a) + len(ENDE)
    if s[a:e] == neu:
        print(f"  {pfad.relative_to(WURZEL)}: unveraendert")
        return False
    if echt:
        pfad.write_text(s[:a] + neu + s[e:], encoding="utf-8")
    print(f"  {pfad.relative_to(WURZEL)}: {'geschrieben' if echt else 'WUERDE sich aendern'}")
    return True


def pruefe(sprachen) -> list[str]:
    """Stellen, die das Skript NICHT erzeugen kann — nur vergleichen."""
    soll = {c for c, _, _ in sprachen}
    fehler = []

    s = QUELLE.read_text(encoding="utf-8")
    typ = re.search(r'export type Lang =(.*?);', s, re.S)
    ist = set(re.findall(r'"([^"]+)"', typ.group(1))) if typ else set()
    if ist != soll:
        fehler.append(f"web `type Lang`: fehlt {sorted(soll-ist)}, zuviel {sorted(ist-soll)}")

    d = re.search(r'const DICTS: Record<Lang, Dict> = \{(.*?)\};', s, re.S)
    if d:
        # Eintraege sind entweder `"pt-PT": ptPT` oder die Kurzform `de` (Name = Schluessel).
        ist = set()
        for teil in d.group(1).split(","):
            teil = teil.strip()
            if not teil:
                continue
            if ":" in teil:
                ist.add(teil.split(":")[0].strip().strip('"'))
            else:
                ist.add(teil)
        fehlend = soll - ist
        if fehlend:
            fehler.append(f"web `DICTS`: fehlt {sorted(fehlend)}")

    srv = (WURZEL / "server/app/api/auth.py").read_text(encoding="utf-8")
    m = re.search(r'SUPPORTED_LANGS = \{(.*?)\}', srv, re.S)
    ist = set(re.findall(r'"([^"]+)"', m.group(1))) if m else set()
    if ist != soll:
        fehler.append(f"server `SUPPORTED_LANGS`: fehlt {sorted(soll-ist)}, zuviel {sorted(ist-soll)}")
    return fehler


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--echt", action="store_true", help="wirklich schreiben")
    args = ap.parse_args()

    sprachen = lies_quelle()
    print(f"{len(sprachen)} Sprachen aus {QUELLE.relative_to(WURZEL)}:")
    print("  " + " · ".join(f"{f} {c}" for c, f, _ in sprachen) + "\n")

    ersetze(WURZEL / "android/app/src/main/java/org/pumpfoil/app/I18n.kt", kotlin(sprachen), args.echt)
    ersetze(WURZEL / "watch-apple/Sources-iOS/Loc.swift", swift(sprachen), args.echt)

    fehler = pruefe(sprachen)
    print("\nNur geprueft (nicht erzeugbar):")
    if fehler:
        for f in fehler:
            print("  ABWEICHUNG " + f)
        return 1
    print("  web `type Lang`, web `DICTS`, server `SUPPORTED_LANGS` — alle deckungsgleich")
    if not args.echt:
        print("\nTROCKENLAUF — nichts geschrieben. Mit --echt ausfuehren.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
