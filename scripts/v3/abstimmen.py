#!/usr/bin/env python3
"""Erkennung v3: Glaettung und Hysterese der Stufe-A-Maske abstimmen. REIN LESEND.

Ein eigener Abstimm-Satz (250 zufaellige Sessions, fester Zufallskeim, plus die Sessions mit
Sichtpruefung), damit die volle Messung nicht an sich selbst abgestimmt wird. Die Wahrscheinlichkeit
wird je Session EINMAL berechnet, dann laufen alle Varianten durch dieselbe v2-Segmentierung.

Gemessen je Variante gegen v2 (heute) auf denselben Sessions: Laeufe, Stunden, Laeufe je Stunde,
Anteil < 8 s, und wie viele Laeufe an Land (Sichtpruefung) noch da sind.

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/abstimmen.py
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import gzip
import itertools
import json
import pathlib
import sys
from multiprocessing import Pool

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
ML = WURZEL / "server" / "data" / "ml"
TAUS = (0.2, 0.3, 0.4, 0.5)
VARIANTEN = [(k, e, a) for k in (1, 5, 9, 15) for e, a in ((0.5, 0.5), (0.6, 0.4), (0.7, 0.3), (0.6, 0.25))]


def eine(s):
    from app.analysis import detect_v2
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M, stufe_a
    ns = M.ganze_aufnahme(s)
    sens = s.get("sensitivity") or "normal"
    kw = dict(SENSITIVITY_PRESETS.get(sens) or {}) if sens != "normal" else {}
    judge = (s.get("sport_class") or "pumpfoil") == "pumpfoil"
    tb = build_timebase_for_session(ns)
    p = stufe_a.wahrscheinlichkeit(tb)
    if p is None:
        return None
    out = {"id": s["id"]}
    orig = detect_v2.model_mask_on_timebase
    out["v2"] = [(x["t_start_ms"], x["t_end_ms"], x["duration_s"]) for x in
                 detect_v2.analyze_session_v2(ns, rebase=False, judge_fremdkraft=judge, **kw)["segments"]]
    for k, e, a in VARIANTEN:
        m = stufe_a.hysterese(stufe_a.glaetten(p, k), e, a)
        detect_v2.model_mask_on_timebase = lambda tb, m=m: m
        seg = detect_v2.analyze_session_v2(ns, rebase=False, judge_fremdkraft=judge, **kw)["segments"]
        out[f"{k}/{e}/{a}"] = [(x["t_start_ms"], x["t_end_ms"], x["duration_s"]) for x in seg]
    detect_v2.model_mask_on_timebase = orig
    # VETO-Variante: v2-Laeufe behalten, nur die verwerfen, in denen Stufe A im Mittel unter tau liegt
    t = tb.t_gps_ms.astype(float)
    pg = stufe_a.glaetten(p, 5)
    mittel = []
    for a0, b0, d in out["v2"]:
        m = (t >= a0) & (t <= b0)
        mittel.append(float(pg[m].mean()) if m.any() else 1.0)
    out["_veto_p"] = mittel
    for tau in TAUS:
        out[f"veto{tau}"] = [x for x, pm in zip(out["v2"], mittel) if pm >= tau]
    return out


def main():
    b = json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))
    kand = [s for s in b if (s["accel_hz"] or 0) >= 15 and s["detection"] == "model"
            and s.get("placement") != "board" and s.get("uuid")]
    sicht = json.loads((ML / "land_urteil_sicht.json").read_text())
    rot = {}
    for x in json.loads((ML / "laeufe_an_land.json").read_text()):
        rot.setdefault(x[0], []).append((x[3], x[4]))
    rng = np.random.default_rng(42)
    ids = set(int(i) for i in rng.choice([s["id"] for s in kand], 250, replace=False))
    ids |= set(sicht["land"]) | set(sicht["wasser"])
    ids |= {s["id"] for s in kand if (WURZEL / "server" / "data" / s["uuid"] / "foil_status.json").exists()}
    auswahl = [s for s in kand if s["id"] in ids]
    cache = ML / "v3" / "abstimm_cache.json"
    if cache.exists() and "--neu" not in sys.argv:
        res = json.loads(cache.read_text())
        res = [{k: ([tuple(x) for x in v] if isinstance(v, list) and v and isinstance(v[0], list) else v)
                for k, v in r.items()} for r in res]
    else:
        with Pool(10) as pool:
            res = [r for r in pool.imap_unordered(eine, auswahl, chunksize=2) if r]
        cache.write_text(json.dumps(res))
    print("Abstimm-Satz:", len(res), "Sessions")

    def bew(key):
        n = sum(len(r[key]) for r in res)
        h = sum(d for r in res for _, _, d in r[key]) / 3600
        kurz = sum(1 for r in res for _, _, d in r[key] if d < 8)
        land = wasser = 0
        for r in res:
            for b0, b1 in rot.get(r["id"], []):
                da = any(min(b1, e) - max(b0, a) > 0.5 * (b1 - b0) for a, e, _ in r[key])
                if r["id"] in sicht["land"]:
                    land += da
                elif r["id"] in sicht["wasser"]:
                    wasser += da
        return n, h, kurz, land, wasser
    # Welche v2-Laeufe verwirft das Veto, und was sagt die andere App dazu?
    from app import storage
    for tau in TAUS:
        weg_ja = weg_nein = 0
        for r in res:
            f = WURZEL / "server" / "data" / next(s["uuid"] for s in auswahl if s["id"] == r["id"]) / "foil_status.json"
            if not f.exists():
                continue
            uuid = f.parent.name
            g = storage.load_gps(uuid); fs = json.loads(f.read_text())
            if len(g) != len(fs):
                continue
            t = np.array([x[0] for x in g], float); w = np.array([x is not None and x >= 0.5 for x in fs])
            behalten = set(r[f"veto{tau}"])
            for x in r["v2"]:
                if x in behalten:
                    continue
                m = (t >= x[0]) & (t <= x[1])
                if m.any():
                    if w[m].mean() >= 0.5: weg_ja += 1
                    else: weg_nein += 1
        print(f"veto{tau}: verworfene v2-Laeufe mit foil_status — laut anderer App echt {weg_ja}, nicht echt {weg_nein}")
    nl = sum(1 for r in res for b0, b1 in rot.get(r["id"], []) if r["id"] in sicht["land"])
    nw = sum(1 for r in res for b0, b1 in rot.get(r["id"], []) if r["id"] in sicht["wasser"])
    print(f"{'Variante':14s} {'Laeufe':>6s} {'Std':>6s} {'L/h':>5s} {'<8s':>5s} {'Land da':>8s} {'Wasser da':>9s}")
    for key in ["v2"] + [f"veto{t}" for t in TAUS] + [f"{k}/{e}/{a}" for k, e, a in VARIANTEN]:
        n, h, kurz, land, wasser = bew(key)
        print(f"{key:14s} {n:6d} {h:6.1f} {n / max(h, 1e-9):5.0f} {kurz / max(n, 1):5.0%} {land:4d}/{nl:<3d} {wasser:5d}/{nw}")


if __name__ == "__main__":
    main()
