#!/usr/bin/env python3
"""Recherchierte Frontfluegel in den Katalog eintragen — Trockenlauf per Vorgabe.

    cd server && .venv/bin/python ../scripts/foil-katalog-eintragen.py            # zeigt nur an
    cd server && .venv/bin/python ../scripts/foil-katalog-eintragen.py --schreiben

Quelle sind die drei Dateien aus `analyse/foil-recherche/` (s. dortige Kopfzeilen):
`specs-geprueft.txt` kommt normal hinein, `specs-schwache-quelle.txt` mit
`specs_estimated = True`, weil dort nur ein Haendler-Abdruck oder ein Archivstand
dahintersteht.

DREI DINGE, DIE HIER BEWUSST SO SIND
1. **Markenschreibweise wird NICHT neu erfunden.** Der Katalog fuehrt `TAKOON` und
   `AXIS` in Grossbuchstaben; ein Eintrag als `Takoon` wuerde eine zweite Marke
   erzeugen, die in der Oberflaeche getrennt erscheint. Deshalb wird die vorhandene
   Schreibweise ueber einen normalisierten Schluessel gesucht und uebernommen.
2. **Nichts wird ueberschrieben.** Gibt es (Marke, Modell, Groesse) schon, wird die
   Zeile uebersprungen und gezaehlt — auch dann, wenn unsere Zahlen abweichen.
3. **Geloescht wird nur, was NIEMAND faehrt.** Die drei Korrekturen unten pruefen
   vorher `sessions.foil_id`; haengt auch nur eine Session dran, bleibt der Eintrag
   stehen und es gibt eine Warnung statt einer Loeschung.

DIE DREI KORREKTUREN (Befunde der Recherche vom 05.09.2026)
- `Moses`: 14 Eintraege tragen Sabfoil-Modellnamen mit identischen Zahlen wie unsere
  Sabfoil-Zeilen. Die echten Moses-Modelle heissen numerisch (550, 633, 679 ...).
- `Aeromod NJ`: kein Modell, sondern das Groessenkuerzel "No Jump" der Wingfoil V3.
- `MFC FW`: nicht aufloesbar — FW1250 gibt es in BEIDEN MFC-Reihen mit verschiedenen
  Werten, die Nummer allein sagt nicht, welcher Fluegel gemeint ist.
"""
from __future__ import annotations

import os
import pathlib
import re
import sys

BASIS = pathlib.Path(__file__).resolve().parent.parent
QUELLEN = [(BASIS / "analyse/foil-recherche/specs-geprueft.txt", False),
           (BASIS / "analyse/foil-recherche/specs-schwache-quelle.txt", True)]

# Eintraege, die nach der Recherche nicht mehr haltbar sind. Werden NUR geloescht,
# wenn keine Session daran haengt (s. Kopfzeile).
AUFRAEUMEN = [
    ("Moses", None, "Sabfoil-Modellnamen unter falscher Marke; echte Moses-Modelle sind numerisch"),
    ("Aeromod", "NJ", "Groessenkuerzel der Wingfoil V3, kein eigenes Modell"),
    ("MFC", "FW", "nicht aufloesbar: FW1250 existiert in beiden MFC-Reihen"),
]
# Bei „Moses" nur die Zeilen mit Sabfoil-Namen — falls dort je etwas Echtes dazukommt.
MOSES_FREMD = {"blade", "leviathan", "medusa", "onda", "onda1000ha", "razor", "razorpro"}


def kern(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def marke_kern(s: str) -> str:
    k = kern(s)
    for weg in ("foils", "foil", "boarding", "hydrofoil"):
        if k.endswith(weg) and len(k) > len(weg) + 2:
            k = k[: -len(weg)]
    return k


def zahl(s: str):
    s = (s or "").strip()
    if not s or s == "-":
        return None
    m = re.match(r"^-?\d+(?:[.,]\d+)?", s.replace(",", "."))
    return float(m.group(0)) if m else None


def zeilen(pfad: pathlib.Path):
    for roh in pfad.read_text(encoding="utf-8").splitlines():
        if roh.startswith("#") or not roh.strip():
            continue
        t = [x.strip() for x in roh.split("|")]
        if len(t) < 5 or not t[0] or not t[1]:
            continue
        yield t[0], t[1], t[2], zahl(t[3]), zahl(t[4]), (zahl(t[5]) if len(t) > 5 else None)


def main() -> None:
    schreiben = "--schreiben" in sys.argv
    sys.path.insert(0, str(BASIS / "server"))
    for z in (BASIS / "server/.env").read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", z.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session as OrmSession
    from app import models

    eng = create_engine(os.environ["DATABASE_URL"])
    with OrmSession(eng) as db:
        vorhanden = {}
        marken_schreibweise = {}
        for f in db.query(models.Foil).all():
            vorhanden[(marke_kern(f.brand), kern(f.model), kern(f.size))] = f
            marken_schreibweise.setdefault(marke_kern(f.brand), f.brand)

        # --- 1. Aufraeumen -------------------------------------------------------
        weg, behalten = [], []
        for marke, modell, grund in AUFRAEUMEN:
            q = db.query(models.Foil).filter(models.Foil.brand == marke)
            if modell:
                q = q.filter(models.Foil.model == modell)
            for f in q.all():
                if marke == "Moses" and kern(f.model) not in MOSES_FREMD:
                    continue
                n = db.query(models.Session).filter(models.Session.foil_id == f.id).count()
                (behalten if n else weg).append((f, grund, n))

        print("=" * 78)
        print("ZU LOESCHEN (niemand faehrt sie)")
        print("=" * 78)
        for f, grund, _ in weg:
            print(f"   #{f.id:<5d} {f.brand:10s} {f.model:14s} {f.size:8s} "
                  f"{f.span_cm or '-':>7} cm {f.area_cm2 or '-':>7} cm2   — {grund}")
        if behalten:
            print("\nBLEIBT STEHEN (Sessions haengen dran):")
            for f, grund, n in behalten:
                print(f"   #{f.id:<5d} {f.brand} {f.model} {f.size} — {n} Session(s), NICHT angefasst")

        # --- 2. Eintragen --------------------------------------------------------
        neu, uebersprungen, je_marke, ohne_zahl = [], 0, {}, {}
        for pfad, unsicher in QUELLEN:
            for marke, modell, groesse, span, flaeche, dicke in zeilen(pfad):
                # `foils.span_cm` UND `foils.area_cm2` sind NOT NULL — zu Recht: Streckung und
                # der Vergleich „aehnliche Foils" rechnen mit beiden. Fehlt eine der Zahlen beim
                # Hersteller (Konrad nennt z. B. nur Flaechen), bleibt die Zeile draussen. Eine
                # erfundene Spannweite waere schlimmer als ein fehlender Katalogeintrag.
                if span is None or flaeche is None:
                    ohne_zahl.setdefault(marke, []).append(f"{modell} {groesse}")
                    uebersprungen += 1
                    continue
                mk = marke_kern(marke)
                marke_db = marken_schreibweise.get(mk, marke)
                schluessel = (mk, kern(modell), kern(groesse))
                if schluessel in vorhanden:
                    uebersprungen += 1
                    continue
                neu.append((schluessel, marke_db, modell, groesse, span, flaeche, dicke, unsicher))
                je_marke[marke_db] = je_marke.get(marke_db, 0) + 1
                # Gleich vormerken: die zweite Quelldatei darf dieselbe Groesse nicht doppelt anlegen.
                vorhanden[schluessel] = True

        print("\n" + "=" * 78)
        print(f"EINZUTRAGEN: {len(neu)} Groessen  (uebersprungen: {uebersprungen})")
        print("=" * 78)
        for marke in sorted(je_marke, key=str.lower):
            print(f"   {marke:20s} {je_marke[marke]:3d}")

        if ohne_zahl:
            print("\n" + "=" * 78)
            print("BLEIBT DRAUSSEN — Hersteller nennt Spannweite oder Flaeche nicht")
            print("=" * 78)
            for marke in sorted(ohne_zahl, key=str.lower):
                print(f"   {marke:20s} {len(ohne_zahl[marke]):2d}: {', '.join(ohne_zahl[marke])}")

        if not schreiben:
            print("\nTrockenlauf — nichts geschrieben. Mit --schreiben ausfuehren.")
            return

        for f, _, _ in weg:
            db.delete(f)
        for _, marke, modell, groesse, span, flaeche, dicke, unsicher in neu:
            db.add(models.Foil(brand=marke, model=modell, size=groesse,
                               span_cm=span, area_cm2=flaeche, thickness_mm=dicke,
                               specs_estimated=bool(unsicher),
                               thickness_estimated=False, is_baseline=False))
        db.commit()
        print(f"\nGESCHRIEBEN: {len(weg)} geloescht, {len(neu)} angelegt.")
        print("Gesamtzahl Foils jetzt:", db.query(models.Foil).count())


if __name__ == "__main__":
    main()
