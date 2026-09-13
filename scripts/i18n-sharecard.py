#!/usr/bin/env python3
"""Beschriftung der Teilen-Karte fuer den Server erzeugen — aus den Web-Sprachdateien.

    python3 scripts/i18n-sharecard.py            # Trockenlauf: zeigt Abweichungen
    python3 scripts/i18n-sharecard.py --echt     # schreibt server/app/sharecard_labels.py

WARUM ES DAS GIBT: die Teilen-Karte ist ein PNG, das der SERVER rendert — dort gibt es kein
i18n. Bis zum 13.09.2026 standen die Beschriftungen deshalb fest auf Deutsch in `sharecard.py`,
und jeder Nutzer bekam eine deutsche Karte, egal in welcher Sprache er unterwegs war (Jans
Befund: „obwohl ich mein profil gerade auf englisch gestellt habe sind im share-preview deutsche
labels zu sehen"). Bei ueber 50 % nicht deutschsprachigen Neukonten ist das die Mehrheit — und
die Karte ist das, was oeffentlich geteilt wird.

Die Texte doppelt zu pflegen waere der naechste Fehler gewesen (am 12.09. lagen dieselben
Sprachnamen an fuenf Stellen und eine Kopie war stehengeblieben). Deshalb: EINE Quelle in
`web/src/i18n/locales/*.ts` unter `share.*`, der Rest wird erzeugt — der Teilen-Dialog liest
dieselben Schluessel, Vorschau und Bild koennen also nicht auseinanderlaufen.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

WURZEL = pathlib.Path(__file__).resolve().parents[1]
LOCALES = WURZEL / "web/src/i18n/locales"
ZIEL = WURZEL / "server/app/sharecard_labels.py"

# Reihenfolge wie auf der Karte; `share.run` ist der Untertitel beim Einzel-Lauf.
KEYS = ["share.stat.foiling", "share.stat.runs", "share.stat.pumps", "share.stat.avgspeed",
        "share.stat.speed", "share.stat.time", "share.stat.longest", "share.stat.distance",
        "share.stat.pumprate", "share.run"]


def lies(lang: str) -> dict[str, str]:
    s = (LOCALES / f"{lang}.ts").read_text(encoding="utf-8")
    out = {}
    for k in KEYS:
        m = re.search(rf'^\s*"{re.escape(k)}":\s*"((?:[^"\\]|\\.)*)",', s, re.M)
        if m:
            out[k] = m.group(1).replace('\\"', '"')
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--echt", action="store_true", help="wirklich schreiben")
    args = ap.parse_args()

    sprachen = sorted(p.stem for p in LOCALES.glob("*.ts"))
    tabelle: dict[str, dict[str, str]] = {}
    fehlend = []
    for lang in sprachen:
        werte = lies(lang)
        fehlt = [k for k in KEYS if k not in werte]
        if fehlt:
            fehlend.append(f"{lang}: {', '.join(fehlt)}")
        tabelle[lang] = werte
    if fehlend:
        for f in fehlend:
            print("  FEHLT " + f)
        return 1

    zeilen = [
        '"""Beschriftung der Teilen-Karte je Sprache — ERZEUGT von scripts/i18n-sharecard.py.',
        "",
        "NICHT von Hand aendern: Quelle sind die Web-Sprachdateien (`share.*` in",
        "web/src/i18n/locales/*.ts), damit der Teilen-Dialog und das gerenderte PNG nie",
        "verschiedene Woerter zeigen. Nach einer Textaenderung dort das Skript neu laufen lassen.",
        "",
        "Japanisch und Chinesisch tragen hier ENGLISCHE Texte, und das ist Absicht: die",
        "Kartenschrift (DejaVuSans) hat keine CJK-Zeichen, und die einzige CJK-Schrift auf dem",
        "Server (DroidSansFallbackFull) hat kein Latein, keine Ziffern und keinen Schraegstrich.",
        "Ein gemischtes Label kaeme in jedem Fall teils als leere Kaestchen heraus.",
        '"""',
        "from __future__ import annotations",
        "",
        "LABELS: dict[str, dict[str, str]] = {",
    ]
    for lang in sprachen:
        zeilen.append(f'    "{lang}": {{')
        for k in KEYS:
            zeilen.append(f'        "{k}": {tabelle[lang][k]!r},')
        zeilen.append("    },")
    zeilen += [
        "}",
        "",
        "",
        'def t(key: str, lang: str | None) -> str:',
        '    """Ein Kartentext. Unbekannte Sprache -> Englisch (nicht Deutsch), fehlender',
        '    Schluessel -> Englisch, sonst der Schluessel selbst."""',
        '    tab = LABELS.get(lang or "") or LABELS["en"]',
        '    return tab.get(key) or LABELS["en"].get(key) or key',
        "",
    ]
    neu = "\n".join(zeilen)
    alt = ZIEL.read_text(encoding="utf-8") if ZIEL.exists() else ""
    print(f"{len(sprachen)} Sprachen x {len(KEYS)} Texte aus {LOCALES.relative_to(WURZEL)}")
    if neu == alt:
        print(f"  {ZIEL.relative_to(WURZEL)}: unveraendert")
        return 0
    if args.echt:
        ZIEL.write_text(neu, encoding="utf-8")
        print(f"  {ZIEL.relative_to(WURZEL)}: geschrieben")
    else:
        print(f"  {ZIEL.relative_to(WURZEL)}: WUERDE sich aendern")
        print("\nTROCKENLAUF — nichts geschrieben. Mit --echt ausfuehren.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
