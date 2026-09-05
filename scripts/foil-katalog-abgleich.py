#!/usr/bin/env python3
"""Gesammelte Hersteller-Modellnamen gegen unseren Foil-Katalog halten.

    cd server && .venv/bin/python ../scripts/foil-katalog-abgleich.py gefunden.txt

Eingabe: eine Zeile je Modell im Format der Recherche-Agenten
    MARKE | Modellname | Groessen | Quelle
(Trennzeichen `|`; Zeilen ohne mindestens zwei Felder werden uebersprungen.)

Ausgabe: was uns fehlt, was wir schon haben, und was wir fuehren ohne dass es
die Recherche gefunden hat. REIN LESEND — schreibt nichts in die DB.

Warum ein eigenes Skript: die Namen der Hersteller und unsere Katalogeintraege
weichen in Schreibweise, Bindestrichen und Zusaetzen wie "V2" oder "Pro" staendig
voneinander ab. Ein stumpfer Textvergleich meldet deshalb Dutzende Scheintreffer.
Hier wird auf einen Kern normalisiert (klein, nur Buchstaben+Ziffern) und
zusaetzlich gegen die `aliases`-Spalte geprueft.

WICHTIG (Memory `catalog-research-checks`): ein Treffer hier ist ein HINWEIS,
keine Entscheidung. Nie per Namensaehnlichkeit zusammenfuehren — vor dem
Eintragen jeder Fall einzeln mit Quelle pruefen.
"""
from __future__ import annotations

import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server"))


def kern(s: str) -> str:
    """Vergleichsform: klein, nur Buchstaben und Ziffern."""
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def marke_kern(s: str) -> str:
    """Markenname zusaetzlich ohne die ueblichen Anhaengsel."""
    k = kern(s)
    for weg in ("foils", "foil", "hydrofoil", "surfboards", "kiteboarding", "boarding"):
        if k.endswith(weg) and len(k) > len(weg) + 2:
            k = k[: -len(weg)]
    return k


def katalog_lesen():
    """(marke -> Menge Namenskerne, marke -> Anzeigename) aus der DB."""
    import pathlib

    from sqlalchemy import create_engine, text

    env = pathlib.Path(os.path.join(os.path.dirname(__file__), "..", "server", ".env"))
    for zeile in env.read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", zeile.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))
    eng = create_engine(os.environ["DATABASE_URL"])
    bekannt: dict[str, set[str]] = defaultdict(set)
    anzeige: dict[str, str] = {}
    with eng.connect() as c:
        for marke, modell, alias in c.execute(text("SELECT brand, model, aliases FROM foils")):
            mk = marke_kern(marke)
            anzeige.setdefault(mk, marke)
            bekannt[mk].add(kern(modell))
            for a in (alias or "").split("|"):
                if a.strip():
                    bekannt[mk].add(kern(a))
    return bekannt, anzeige


def zeilen_lesen(pfad: str):
    for roh in open(pfad, encoding="utf-8"):
        teile = [t.strip() for t in roh.split("|")]
        if len(teile) < 2 or not teile[0] or not teile[1]:
            continue
        if teile[1].upper().startswith("NICHTS GEFUNDEN"):
            continue
        yield teile[0], teile[1], (teile[2] if len(teile) > 2 else "-"), (teile[3] if len(teile) > 3 else "-")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    bekannt, anzeige = katalog_lesen()
    neu: dict[str, list] = defaultdict(list)
    da: dict[str, list] = defaultdict(list)
    gefunden: dict[str, set[str]] = defaultdict(set)
    unbekannte_marke: list = []

    for marke, modell, groessen, quelle in zeilen_lesen(sys.argv[1]):
        mk = marke_kern(marke)
        if mk not in bekannt:
            unbekannte_marke.append((marke, modell, quelle))
            continue
        gefunden[mk].add(kern(modell))
        # Treffer, wenn ein Katalogname den gefundenen enthaelt oder umgekehrt —
        # "Hyper2" vs. "Hyper 2" vs. "Hyper2 170" sollen zusammenfallen.
        k = kern(modell)
        if any(k == b or (len(k) > 3 and (k in b or b in k)) for b in bekannt[mk]):
            da[mk].append(modell)
        else:
            neu[mk].append((modell, groessen, quelle))

    print("=" * 78)
    print("NEU — bei uns nicht gefunden, also genauer anschauen")
    print("=" * 78)
    for mk in sorted(neu, key=lambda x: anzeige[x].lower()):
        print(f"\n{anzeige[mk]}  ({len(neu[mk])})")
        for modell, groessen, quelle in neu[mk]:
            print(f"   {modell:38s} {groessen[:38]:38s} {quelle}")
    if unbekannte_marke:
        print("\n" + "=" * 78)
        print("MARKE NICHT IM KATALOG")
        print("=" * 78)
        for marke, modell, quelle in unbekannte_marke:
            print(f"   {marke:20s} {modell:34s} {quelle}")

    print("\n" + "=" * 78)
    print("ZAHLEN JE MARKE  (gefunden / davon schon da / davon neu / bei uns ohne Fund)")
    print("=" * 78)
    for mk in sorted(bekannt, key=lambda x: anzeige[x].lower()):
        g = gefunden.get(mk)
        if not g:
            print(f"   {anzeige[mk]:22s}  Recherche lieferte nichts — {len(bekannt[mk])} Eintraege bei uns")
            continue
        ohne = [b for b in bekannt[mk]
                if not any(b == k or (len(b) > 3 and (b in k or k in b)) for k in g)]
        print(f"   {anzeige[mk]:22s}  {len(g):3d} / {len(da.get(mk, [])):3d} / {len(neu.get(mk, [])):3d} / {len(ohne):3d}")


if __name__ == "__main__":
    main()
