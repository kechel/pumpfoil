#!/usr/bin/env python3
"""Doppelte Uebersetzungs-Schluessel finden — in Swift ein ABSTURZ, in Kotlin ein stiller Fehler.

Ein doppelter Schluessel in einem Swift-Dictionary-Literal bringt die App zur LAUFZEIT zum
Absturz („Fatal error: Dictionary literal contains duplicate keys"), nicht beim Compilieren; in
Kotlin gewinnt still der letzte Eintrag und der falsche Text steht in der Oberflaeche. Beides
faellt in `swiftc -parse` bzw. `compileDebugKotlin` NICHT auf — deshalb dieses Skript.

Geprueft wird je TABELLE: ein zusammenhaengender Block von Zeilen der Form `"key": wert,` (Swift)
bzw. `"key" to wert,` (Kotlin). Das genuegt, weil die Sprachtabellen genau so geschrieben sind.

Aufruf (rein lesend):  python3 scripts/i18n-doppelte-schluessel.py
Rueckgabe: 0 = sauber, 1 = Dopplungen gefunden (fuer eine CI-Verkettung).
"""
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

DATEIEN = [
    "watch-apple/Sources-iOS/Loc.swift",
    "watch-apple/Sources-iOS/LocExtra.swift",
    "watch-apple/Sources-iOS/LocOnboarding.swift",
    "watch-apple/Sources/WLoc.swift",
    "watch-apple/Sources/WLocExtra.swift",
    "android/app/src/main/java/org/pumpfoil/app/I18n.kt",
    "android/app/src/main/java/org/pumpfoil/app/I18nExtra.kt",
    "android/wear/src/main/java/org/pumpfoil/watch/I18n.kt",
]
MUSTER = re.compile(r'^\s*"([^"]+)"\s*(?::|to)\s')


def pruefe(pfad: Path) -> int:
    zeilen = pfad.read_text(encoding="utf-8").split("\n")
    block: list[str] = []
    start = 0
    tabellen = 0
    fehler = 0

    def ende() -> int:
        nonlocal tabellen
        if not block:
            return 0
        tabellen += 1
        raus = 0
        for k, n in Counter(block).items():
            if n > 1:
                print(f"  DOPPELT {pfad} (Tabelle ab Zeile {start}): {k!r} {n}x")
                raus += 1
        return raus

    for i, z in enumerate(zeilen, 1):
        m = MUSTER.match(z)
        if m:
            if not block:
                start = i
            block.append(m.group(1))
        elif block and z.strip() and not z.strip().startswith("//"):
            fehler += ende()
            block = []
    fehler += ende()
    print(f"{pfad}: {tabellen} Tabellen geprueft")
    return fehler


def main() -> int:
    wurzel = Path(__file__).resolve().parent.parent
    fehler = 0
    for d in DATEIEN:
        p = wurzel / d
        if p.exists():
            fehler += pruefe(p)
        else:
            print(f"{d}: nicht vorhanden, uebersprungen")
    print()
    print("KEINE DOPPELTEN SCHLUESSEL" if fehler == 0 else f"{fehler} Dopplungen!")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
