"""Muster fuer den Server-Vorschlag (app/tanz_server.py, Version s1) aus Jans beschrifteten Sessions
ableiten -> server/app/data/tanz_muster_server.json. Rein lesend gegenueber der DB.
Dieselben Quellen wie scripts/tanz_muster_ableiten.py (Uhr), dazu Marker-Sessions mit "ganz" in
tanz_wahrheit.json (Jan: „heute war nur Salsa") komplett als dieser Tanz.

Pruefung, damit die Zahlen nicht an sich selbst gemessen werden, je 1-min-Stueck:
  Taenze mit mehreren grossen Quellen (Salsa): die ganze Session raus, aus dem Rest lernen.
  Taenze mit nur einer Quelle: andere Haelfte derselben Session lernen (nur Stabilitaet).
Daneben dieselben Stuecke mit der Uhr-Rechnung (deren Muster sind auf ALLEN Quellen gelernt, also
eher zu gut).

  cd server && DATABASE_URL=... .venv/bin/python ../scripts/tanz_server_ableiten.py [--schreiben]
"""
from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import tanz_muster_ableiten as tm  # noqa: E402
from app import models, storage, tanz_analyse as ta, tanz_server as ts  # noqa: E402
from app.db import SessionLocal  # noqa: E402

DATA = tm.DATA
MERKMALE = ("quer", *ts.BAENDER)
# Nur Taenze mit mind. 30 tanzenden Fenstern (5 min) bekommen ein Muster. Mit den kleinen Strecken aus
# #17689 (3-9 Fenster) und den geschaetzten Taenzen ohne Daten kippte die Pruefung: sie schluckten
# Salsa/Samba (Salsa 14/42 statt 30/42, 22.10.2026). s1 kennt deshalb nur, was es gemessen hat.
MIN_FENSTER = 30


def lade(sid):
    s = SessionLocal().get(models.Session, sid)
    a = storage.load_accel(s.session_uuid).astype(float) / (s.accel_scale or 1000)
    g = storage.load_gyro(s.session_uuid).astype(float)
    g = g[:len(a)] / 1024 * 180 / math.pi if len(g) else None
    return s, ts.fenster(a, g)


def quellen():
    tm.lade = lade
    qs = tm.quellen()
    w = json.loads((DATA / "tanz_wahrheit.json").read_text())
    for e in w["marker_sessions"]:
        if e.get("ganz"):
            qs = [q for q in qs if not q[0].startswith(f"{e['id']}m")]
            qs.append((f"{e['id']}g", e["ganz"], lade(e["id"])[1]))
    return qs


def stuecke(fs):
    st = [fs[i:i + 6] for i in range(0, len(fs), 6)]
    return [x for x in st if sum(ta.tanzt(f) for f in x) >= 3]


def ableiten(qs):
    je = defaultdict(list)
    for _q, key, fs in qs:
        je[key] += [f for f in fs if ta.tanzt(f)]
    taenze = {}
    for key, fs in je.items():
        if len(fs) < MIN_FENSTER:
            continue
        m = {"tempo": round(float(np.exp(np.median(np.log([f["tempo"] for f in fs if f["tempo"] > 0])))), 1),
             "fenster": len(fs)}
        for k in MERKMALE:
            m[k] = round(float(np.median([f[k] for f in fs])), 3)
        taenze[key] = m
    # Gemeinsame Streuung auf 1-min-Stuecken: Abweichung des Stueck-Medians vom Muster seines Tanzes.
    res = defaultdict(list)
    for _q, key, fs in qs:
        if key not in taenze:
            continue
        for x in stuecke(fs):
            mm = ts.merkmale(x)
            if mm["tempo"] > 0:
                res["tempo"].append(math.log(mm["tempo"]) - math.log(taenze[key]["tempo"]))
            for k in MERKMALE:
                res[k].append(mm[k] - taenze[key][k])
    iqr = lambda x: (np.percentile(x, 75) - np.percentile(x, 25)) / 1.35
    streuung = {k: round(max(0.01, float(iqr(v))), 3) for k, v in res.items()}
    streuung["tempo"] = max(streuung.get("tempo", 0.15), 0.12)
    return {"version": ts.VERSION, "streuung": streuung, "taenze": taenze}


def main():
    qs = quellen()
    mu = ableiten(qs)
    print(f"Streuung (1-min-Stuecke): {mu['streuung']}")
    for k, m in sorted(mu["taenze"].items()):
        print(f"  {k:10} {m}")
    n_q = Counter(key for q, key, fs in qs if len(stuecke(fs)) >= 5)
    print("\nPruefung je 1-min-Stueck (neu = Server s1 ohne die gepruefte Quelle bzw. Haelfte, uhr = Tanz.mc):")
    gesamt = defaultdict(lambda: [0, 0, 0])
    for q, key, fs in qs:
        st = stuecke(fs)
        if len(st) < 5:
            continue
        neu = []
        if n_q[key] >= 2:
            mu_o = ableiten([x for x in qs if x[0] != q])
            neu = [ts.vorschlag(x, mu_o) for x in st]
        else:
            h = len(fs) // 2
            for teil, rest in ((fs[:h], fs[h:]), (fs[h:], fs[:h])):
                mu_o = ableiten([x for x in qs if x[0] != q] + [(q, key, rest)])
                neu += [ts.vorschlag(x, mu_o) for x in stuecke(teil)]
        uhr = [ta.vorschlag(x) for x in st]
        print(f"  {q:10} {key:9} n={len(neu):2}  neu {sum(v == key for v in neu):2} {dict(Counter(neu).most_common(3))}"
              f"   uhr {sum(v == key for v in uhr):2} {dict(Counter(uhr).most_common(3))}")
        g = gesamt[key]
        g[0] += len(neu); g[1] += sum(v == key for v in neu); g[2] += sum(v == key for v in uhr)
        for v in neu:
            if v != key:
                gesamt["falsch->" + v][0] += 1
    for k, g in sorted(gesamt.items()):
        if not k.startswith("falsch"):
            print(f"  {k:10} richtig neu {g[1]}/{g[0]}  uhr {g[2]}/{g[0]}")
    print("  falsch vorgeschlagen (neu): " + ", ".join(f"{k[8:]} {g[0]}" for k, g in sorted(gesamt.items()) if k.startswith("falsch")))
    if "--schreiben" in sys.argv:
        (DATA / "tanz_muster_server.json").write_text(json.dumps(mu, ensure_ascii=False, indent=1) + "\n")
        print("\ngeschrieben: server/app/data/tanz_muster_server.json")


if __name__ == "__main__":
    main()
