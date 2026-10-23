#!/usr/bin/env python3
"""Stufe-A-Kandidaten gegen r4 messen, FAHRER HERAUSGEHALTEN, beide auf demselben Weg. REIN LESEND.

Teil A — je Sekunde (Datensatz wie training_a.laden, alter ds + data/ml/v3/r7/ds):
  jede Zeile bekommt von JEDEM Modell das Teilmodell, das ihren Fahrer nie gesehen hat (r4: die Falten
  vom 30.09., Fahrer, die r4 nie sah, das Gesamtmodell; Kandidat: seine Falten). Bewertet je Label-Quelle,
  die Brett-Wahrheit ALLER Paare (alle Qualitaeten, brett_r7.pkl) je Fahrer und Qualitaet, u350 (langsames Weiterpumpen).
Teil B — Laeufe auf dem Live-Weg (r7_gemeinsam: v2 ∪ tief, teil/veto/kurz, Empfindlichkeit, Ausschluss),
  p aus den Teilmodellen ohne den Fahrer (Referenz r3 ebenso):
  Brett-Paare (je Fahrer): Sekunden auf dem Foil gegen das Brett, Brett-Laeufe gefunden, Uhr-Laeufe bestaetigt;
  Fortsetzungen von u350 (Sekunden abgedeckt, Foil-Zeit u350); Laeufe an Land (Sichtpruefung) noch da;
  Negativbeispiele #12568/#12574/#12575 (Laeufe, soll 0).

Aufruf (aus server/): DATABASE_URL=... DETECTOR_V2=1 nice -n 15 .venv/bin/python ../scripts/v3/messen_r7.py \
    --kandidat r7s,r7a [--nur-a | --nur-b] [--jobs 8]
Ausgabe: stdout + data/ml/v3/r7/messung-<kandidaten>.json
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import gzip
import json
import pathlib
import pickle
import sys
from multiprocessing import Pool

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
ML = WURZEL / "server" / "data" / "ml"
R7 = ML / "v3" / "r7"


def falten_mit_gesamt(name: str) -> dict:
    f = pickle.load(open(ML / "v3" / f"stufe_a_{name}_falten.pkl", "rb"))
    g = ML / "v3" / f"stufe_a_{name}.pkl"
    if g.exists():
        f["gesamt"] = pickle.load(open(g, "rb"))
    return f


def pr(z_auf, m):
    tp = int((m & z_auf).sum()); fp = int((m & ~z_auf).sum()); fn = int((~m & z_auf).sum())
    return tp / max(tp + fp, 1), tp / max(tp + fn, 1), tp, fp, fn


# ------------------------------------------------------------------------------------------------- Teil A
def teil_a(modelle: list[str], erg: dict):
    import training_a as T
    brett_roh = pickle.load(open(R7 / "brett_r7.pkl", "rb"))
    brett = {d["paar"][1]: (np.asarray(d["t"], float), np.asarray(d["z"])) for d in brett_roh}
    info = {d["paar"][1]: d for d in brett_roh}
    namen = T.spalten("alle", True, True)          # r4-Merkmale (36) — alle Kandidaten nutzen dieselben
    X, y, q, g, heute, sid = T.laden(namen, (), 3, brett, False, [(str(R7 / "ds"), str(R7 / "ds_h"))],
                                     str(R7 / "baseline-2026-10-23.json.gz"))
    P = {}
    for name in modelle:
        f = falten_mit_gesamt(name)
        p = np.zeros(y.size, np.float32)
        for u in np.unique(g):
            m = g == u
            k = f["fahrer_falte"].get(int(u))
            clf = f["falten"][k] if k is not None else f["gesamt"]["clf"]
            sp_n = f["namen"]
            assert sp_n == namen, f"{name}: andere Merkmale als r4 — Teil A braucht dieselben Spalten"
            p[m] = clf.predict_proba(X[m])[:, 1]
        P[name] = p
        print(f"  [{name}] vorhergesagt", flush=True)
    del X
    erg["a"] = {}
    zeilen = []
    for name in modelle:
        p = P[name] >= 0.5
        e = {}
        for k, qn in enumerate(T.Q):
            for v in (1, 0):
                mm = (q == k) & (y == v)
                if mm.sum() >= 50:
                    e[f"{qn}_y{v}"] = (int(mm.sum()), round(float((p[mm] == v).mean()), 4))
        mb = q == T.Q.index("brett")
        for u in sorted(np.unique(g[mb])):
            m = mb & (g == u)
            pp, tt, *_ = pr(y[m] == 1, p[m])
            e[f"brett_u{u}"] = (int(m.sum()), round(pp, 3), round(tt, 3))
        for qual in ("gut", "mittel", "schwach"):
            ss = [s_ for s_, d in info.items() if d["qualitaet"] == qual]
            m = mb & np.isin(sid, ss)
            if m.any():
                pp, tt, *_ = pr(y[m] == 1, p[m])
                e[f"brett_{qual}"] = (int(m.sum()), round(pp, 3), round(tt, 3))
        m = (g == 350) & (y == 1)
        e["u350_y1"] = (int(m.sum()), round(float(p[m].mean()), 4))
        pp, tt, *_ = pr(y == 1, p)
        e["gesamt"] = (int(y.size), round(pp, 4), round(tt, 4))
        erg["a"][name] = e
    print("\n## Teil A — je Sekunde, Fahrer herausgehalten (Anteil richtig bzw. Praezision/Treffer)")
    schl = list(erg["a"][modelle[0]].keys())
    print(f"  {'':22s}" + "".join(f"{n:>22s}" for n in modelle))
    for s_ in schl:
        print(f"  {s_:22s}" + "".join(f"{str(erg['a'][n].get(s_)):>22s}" for n in modelle))


# ------------------------------------------------------------------------------------------------- Teil B
MOD = {}


def _init_b(namen):
    MOD["r3"] = falten_mit_gesamt("r3")
    for n in namen:
        MOD[n] = falten_mit_gesamt(n)
    MOD["_namen"] = namen


def eine_b(sid):
    import logging
    logging.disable(logging.WARNING)
    import r7_gemeinsam as G
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        ctx = G.kontext(db, sid)
        if ctx is None or ctx.get("X") is None:
            return {"id": sid, "fehler": "keine Daten"}
        s = ctx["s"]
        out = {"id": sid, "user": s.user_id, "t0": s.started_at.timestamp() * 1000.0}
        for n in MOD["_namen"]:
            p, info = G.p_fuer(ctx, MOD[n], MOD["r3"], fahrer=s.user_id)
            segs, verw = G.v3_segmente(ctx, p)
            out[n] = {"laeufe": [(float(x["t_start_session_ms"]), float(x["t_end_session_ms"])) for x in segs],
                      "herausgehalten": info}
        return out
    except Exception as e:
        import traceback
        return {"id": sid, "fehler": f"{type(e).__name__}: {e}", "tb": traceback.format_exc()[-500:]}
    finally:
        db.rollback(); db.close()


def maske(L, t):
    m = np.zeros(t.size, bool)
    for a, b in L:
        m |= (t >= a) & (t <= b)
    return m


def ueberlapp(a, b, L):
    return any(a < y and b > x for x, y in L)


def teil_b(modelle, erg, jobs):
    from app.db import SessionLocal, engine
    from app import models
    brett_roh = [d for d in pickle.load(open(R7 / "brett_r7.pkl", "rb")) if d["live_nutzbar"]]
    fort = {int(k): v["bereiche_ms"] for k, v in json.loads((ML / "v3" / "labels_fortsetzung.json").read_text())["sessions"].items()}
    sicht = json.loads((ML / "land_urteil_sicht.json").read_text())
    an_land = {}
    for x in json.loads((ML / "laeufe_an_land.json").read_text()):
        if x[0] in sicht["land"]:
            an_land.setdefault(x[0], []).append((x[3], x[4]))
    neg = [12568, 12574, 12575]
    ids = sorted({d["paar"][1] for d in brett_roh} | set(fort) | set(an_land) | set(neg))
    db = SessionLocal()
    brett_laeufe = {}
    for d in brett_roh:
        b = db.get(models.Session, d["paar"][0])
        brett_laeufe[d["paar"][1]] = [(x["t_start_session_ms"], x["t_end_session_ms"])
                                      for x in json.loads(b.result.segments_json or "[]")]
    u350 = [r[0] for r in db.execute(__import__("sqlalchemy").text(
        "select s.id from sessions s join analysis_results a on a.session_id=s.id where s.user_id=350 "
        "and not coalesce(s.deleted,false) and s.merged_into is null and a.detection='model'"))]
    db.rollback(); db.close()
    ids = sorted(set(ids) | set(u350))
    engine.dispose()
    print(f"Teil B: {len(ids)} Sessions", flush=True)
    with Pool(min(jobs, 8), initializer=_init_b, initargs=(modelle,), maxtasksperchild=20) as pool:
        R = {r["id"]: r for r in pool.imap_unordered(eine_b, ids, chunksize=1)}
    fehl = [r for r in R.values() if "fehler" in r]
    if fehl:
        print("  Fehler:", [(r["id"], r["fehler"][:80]) for r in fehl])
    erg["b"] = {}
    for n in modelle:
        e = {"brett_je_fahrer": {}, "brett_je_paar": {}}
        sumz = {}
        for d in brett_roh:
            uid = d["paar"][1]
            r = R.get(uid)
            if not r or "fehler" in r:
                continue
            t, z = np.asarray(d["t"]), np.asarray(d["z"])
            m = maske(r[n]["laeufe"], t)
            auf = z > 0
            v = d["versatz_ms"]
            bl = [(a - v, b - v) for a, b in brett_laeufe[uid]]             # Brett-Laeufe in Uhr-ms
            lo, hi = t[0], t[-1]
            ul = [(a, b) for a, b in r[n]["laeufe"] if lo <= a <= hi]
            gef = sum(1 for a, b in bl if ueberlapp(a, b, ul)); best = sum(1 for a, b in ul if ueberlapp(a, b, bl))
            gl = z == 1
            zeile = [int((m & auf).sum()), int((m & ~auf).sum()), int((~m & auf).sum()),
                     gef, len(bl), best, len(ul), int((m & gl).sum()), int(gl.sum())]
            e["brett_je_paar"][f"{d['paar'][0]}/{uid} u{d['fahrer']} {d['qualitaet']}"] = zeile
            for key in (f"u{d['fahrer']}", "alle", f"q_{d['qualitaet']}"):
                acc = sumz.setdefault(key, [0] * 9)
                for i, x in enumerate(zeile):
                    acc[i] += x
        for key, (tp, fp, fn, gef, nbl, best, nul, glt, gln) in sumz.items():
            e["brett_je_fahrer"][key] = {"praez": round(tp / max(tp + fp, 1), 3), "treffer": round(tp / max(tp + fn, 1), 3),
                                         "brett_laeufe_gefunden": f"{gef}/{nbl}", "uhr_laeufe_bestaetigt": f"{best}/{nul}",
                                         "gleit_s": f"{glt}/{gln}"}
        fo = [0, 0]; land = [0, 0]
        for sid, ber in fort.items():
            r = R.get(sid)
            if not r or "fehler" in r:
                continue
            for a, b, _ in ber:
                tt = np.arange(a, b + 1, 1000.0)
                fo[0] += int(maske(r[n]["laeufe"], tt).sum()); fo[1] += tt.size
        for sid, ls in an_land.items():
            r = R.get(sid)
            if not r or "fehler" in r:
                continue
            for a, b in ls:
                land[1] += 1
                land[0] += ueberlapp(a, b, r[n]["laeufe"])
        e["u350_fortsetzung_s"] = f"{fo[0]}/{fo[1]}"
        e["u350_foilzeit_min"] = round(sum(sum(b - a for a, b in R[s][n]["laeufe"]) for s in u350
                                           if s in R and "fehler" not in R[s]) / 60000, 1)
        e["land_laeufe_noch_da"] = f"{land[0]}/{land[1]}"
        e["negativ_laeufe"] = {s: len(R[s][n]["laeufe"]) for s in neg if s in R and "fehler" not in R[s]}
        erg["b"][n] = e
    print("\n## Teil B — Live-Weg, Fahrer herausgehalten")
    for n in modelle:
        e = erg["b"][n]
        print(f"\n[{n}] u350 Fortsetzung {e['u350_fortsetzung_s']} s · u350 gesamt {e['u350_foilzeit_min']} min · "
              f"Land-Laeufe noch da {e['land_laeufe_noch_da']} · Negativ {e['negativ_laeufe']}")
        for key, v in sorted(e["brett_je_fahrer"].items()):
            print(f"   Brett {key:10s} Praez {v['praez']:.3f} Treffer {v['treffer']:.3f} · Brett-Laeufe gefunden "
                  f"{v['brett_laeufe_gefunden']} · Uhr-Laeufe bestaetigt {v['uhr_laeufe_bestaetigt']} · Gleit-s {v['gleit_s']}")
    print("\n  je Paar [tp fp fn | Brett-Laeufe gef/n | Uhr-Laeufe best/n | gleit erk/n]:")
    for k in erg["b"][modelle[0]]["brett_je_paar"]:
        print(f"   {k:28s} " + "   ".join(f"{n}: {erg['b'][n]['brett_je_paar'].get(k)}" for n in modelle))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kandidat", default="r7s")
    ap.add_argument("--nur-a", dest="nur_a", action="store_true")
    ap.add_argument("--nur-b", dest="nur_b", action="store_true")
    ap.add_argument("--jobs", type=int, default=8)
    a = ap.parse_args()
    modelle = ["r4"] + [x for x in a.kandidat.split(",") if x]
    erg = {"modelle": modelle}
    if not a.nur_b:
        teil_a(modelle, erg)
    if not a.nur_a:
        teil_b(modelle, erg, a.jobs)
    p = R7 / f"messung-{'-'.join(modelle)}{'-a' if a.nur_a else ''}{'-b' if a.nur_b else ''}.json"
    p.write_text(json.dumps(erg, indent=1, default=str))
    print("geschrieben:", p)


if __name__ == "__main__":
    main()
