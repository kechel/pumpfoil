#!/usr/bin/env python3
"""Erkennung v3: Vergleichsbilder heute (v2) gegen eine Werkbank-Variante. REIN LESEND.

Waehlt die Sessions mit den groessten Aenderungen (am meisten dazu, am meisten weg) und dazu feste
(Guillaume, Pruefliste), zerlegt die Laeufe je Sekunde in gemeinsam / nur heute / nur neu und legt
je Session server/data/ml/bilder/vergleich/s<id>.npz ab. Zeichnen danach im ml-venv:
  BILD_DIR=vergleich ~/ml-venv/bin/python scripts/v3/bild_session.py <id> <titel>

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/vergleich_bilder.py r3 "tief+empf" [--n 8]
Schreibt die Auswahl mit Zahlen nach bilder/vergleich/auswahl.json.
"""
import argparse
import gzip
import json
import pathlib
import sys

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
ML = WURZEL / "server" / "data" / "ml"
FEST = [10339, 9525, 3506, 9455, 7160, 10478, 3045]


def bereiche(m, t):
    """bool-Maske je Sekunde -> Liste (a_ms, b_ms)."""
    out, i = [], 0
    while i < m.size:
        if m[i]:
            j = i
            while j + 1 < m.size and m[j + 1]:
                j += 1
            out.append((t[i], t[j])); i = j + 1
        else:
            i += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("modell"); ap.add_argument("variante")
    ap.add_argument("--n", type=int, default=8)
    a = ap.parse_args()
    from app import storage
    alt = {r["id"]: r for r in json.load(gzip.open(ML / "werkbank" / a.modell / "v2.json.gz"))}
    neu = {r["id"]: r for r in json.load(gzip.open(ML / "werkbank" / a.modell / f"{a.variante}.json.gz"))}
    diff = []
    for sid in alt:
        if sid not in neu:
            continue
        d0 = sum(x["dur_s"] for x in alt[sid]["runs"]); d1 = sum(x["dur_s"] for x in neu[sid]["runs"])
        diff.append((d1 - d0, sid, d0, d1, alt[sid]["num_runs"], neu[sid]["num_runs"]))
    diff.sort()
    wahl = [x for x in diff[:a.n]] + [x for x in diff[-a.n:]]
    fest = [x for x in diff if x[1] in FEST and x not in wahl]
    aus = ML / "bilder" / "vergleich"
    aus.mkdir(parents=True, exist_ok=True)
    liste = []
    for dd, sid, d0, d1, n0, n1 in wahl + fest:
        s = alt[sid]
        g = np.asarray(storage.load_gps(s["uuid"]), float)[:, :6]
        t = g[:, 0]
        def maske(runs):
            m = np.zeros(t.size, bool)
            for r in runs:
                m |= (t >= r["t0"]) & (t <= r["t1"])
            return m
        ma, mn = maske(alt[sid]["runs"]), maske(neu[sid]["runs"])
        np.savez_compressed(aus / f"s{sid}.npz", gps=g, runs=np.array(bereiche(ma & mn, t)).reshape(-1, 2),
                            land=np.array(bereiche(ma & ~mn, t)).reshape(-1, 2),
                            neu=np.array(bereiche(mn & ~ma, t)).reshape(-1, 2))
        grund = "fest" if sid in FEST else ("mehr" if dd > 0 else "weniger")
        liste.append({"id": sid, "grund": grund, "user": s.get("user_id"), "heute_s": round(d0), "neu_s": round(d1),
                      "laeufe_heute": n0, "laeufe_neu": n1, "sport": s.get("sport_class"),
                      "empf": s.get("sensitivity"), "ort": s.get("place")})
        print(f"#{sid} ({grund}, u{s.get('user_id')}, {s.get('sensitivity')}): {d0:.0f} s -> {d1:.0f} s, "
              f"Laeufe {n0} -> {n1} · {s.get('place')}")
    (aus / "auswahl.json").write_text(json.dumps({"modell": a.modell, "variante": a.variante, "sessions": liste}, indent=1))


if __name__ == "__main__":
    main()
