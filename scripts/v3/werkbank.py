#!/usr/bin/env python3
"""Erkennung v3: Werkbank fuer die Nachbearbeitung der Laeufe. REIN LESEND, schreibt nur data/ml/.

Stufe A liefert je Sekunde eine Wahrscheinlichkeit „auf dem Foil". WIE man sie auf die Laeufe
anwendet, ist die eigentliche Frage: ganze Laeufe verwerfen (Veto), Raender abschneiden, Laeufe
verlaengern, wenn der Fahrer langsam weiterpumpt (Guillaume), Luecken schliessen (Gleiten, kurzer
Tempo-Einbruch). Die Werkbank rechnet die Wahrscheinlichkeit je Session EINMAL (Teilmodell, das den
Fahrer nie gesehen hat; zwischengespeichert je Modellfassung) und probiert dann alle Varianten auf
denselben Ausgangs-Laeufen aus:

  Ausgang  v2   = heutige Laeufe (schatten-v2.json.gz, eigene Empfindlichkeit, ganze Aufnahme)
           tief = fast ohne Tempo-Grenzen (schatten-tief.json.gz)
  Schritte veto<τ>      Lauf weg, wenn mittleres p < τ
           schnitt<θ>   Raender abschneiden, solange p < θ
           dehn<θ>      Enden vor/zurueck verlaengern, solange p >= θ, Tempo (3-s-Mittel) >= 4 km/h
                        und nie > 2 s unter 3 km/h
           naht<g>      zwei Laeufe verbinden, wenn die Luecke <= g s ist und p darin nie < 0,5

Jede Variante wird im Baseline-Format geschrieben (data/ml/werkbank/<modell>/<variante>.json.gz),
damit detektor-v3-messen.py sie vermessen kann. Direkt hier gemessen: je Sekunde gegen die
Brett-Wahrheit (6 Paare) und gegen Guillaumes Fortsetzungs-Label.

Aufruf (aus server/): DATABASE_URL=... V3_MODELL=r2 nice -n 15 .venv/bin/python ../scripts/v3/werkbank.py [--jobs 12]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
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
ML = WURZEL / "server" / "data" / "ml"
MODELL = os.environ.get("V3_MODELL", "") or "r1"
PCACHE = ML / "v3" / f"p_{MODELL}"


def p_je_session(s):
    """-> (id, t_ms, v_mps, p) — aus dem Zwischenspeicher oder frisch (Teilmodell ohne diesen Fahrer)."""
    f = PCACHE / f"{s['id']}.npz"
    if f.exists():
        d = np.load(f)
        return s["id"], d["t"], d["v"], d["p"]
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M, stufe_a
    try:
        tb = build_timebase_for_session(M.ganze_aufnahme(s))
        p = stufe_a.wahrscheinlichkeit(tb, fahrer=s["user_id"])
    except Exception:
        return s["id"], None, None, None
    if p is None:
        return s["id"], None, None, None
    t = tb.t_gps_ms.astype(float)
    v = np.nan_to_num(np.array([g[3] if len(g) > 3 and g[3] is not None else np.nan for g in tb.gps], float))
    PCACHE.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(f, t=t, v=v.astype(np.float32), p=p.astype(np.float32))
    return s["id"], t, v, p


def glaetten(p, k=5):
    if p.size < k:
        return p
    return np.convolve(np.pad(p, (k // 2, k - 1 - k // 2), mode="edge"), np.ones(k) / k, mode="valid")


# --- Schritte: Laeufe als Liste (a_ms, b_ms) -------------------------------------------------
def veto(L, t, pg, tau):
    out = []
    for a, b in L:
        m = (t >= a) & (t <= b)
        if not m.any() or pg[m].mean() >= tau:
            out.append((a, b))
    return out


def schnitt(L, t, pg, theta, min_s=3):
    out = []
    for a, b in L:
        idx = np.flatnonzero((t >= a) & (t <= b))
        if idx.size == 0:
            out.append((a, b)); continue
        gut = idx[pg[idx] >= theta]
        if gut.size == 0:
            continue                       # nichts bleibt -> das erledigt sonst das Veto
        a2, b2 = t[gut[0]], t[gut[-1]]
        if b2 - a2 >= min_s * 1000:
            out.append((max(a, a2), min(b, b2)))
    return out


def dehn(L, t, v, pg, theta, vmin=4 / 3.6, stopp_v=3 / 3.6, stopp_s=2):
    v3 = np.convolve(v, np.ones(3) / 3, mode="same")
    out = []
    for k, (a, b) in enumerate(L):
        grenzen = (L[k - 1][1] if k > 0 else -1e18, L[k + 1][0] if k + 1 < len(L) else 1e18)
        neu = [a, b]
        for seite, schritt in ((1, 1), (0, -1)):
            i = int(np.searchsorted(t, b, side="right")) if schritt > 0 else int(np.searchsorted(t, a)) - 1
            unten, letzter = 0, None
            while 0 <= i < t.size and grenzen[0] < t[i] < grenzen[1]:
                unten = unten + 1 if v[i] < stopp_v else 0
                if unten > stopp_s or v3[i] < vmin or pg[i] < theta:
                    break
                letzter = i
                i += schritt
            if letzter is not None:
                neu[seite] = t[letzter]
        out.append((neu[0], neu[1]))
    return out


def naht(L, t, pg, g_s, pmin=0.5):
    if not L:
        return L
    out = [list(L[0])]
    for a, b in L[1:]:
        la = out[-1]
        m = (t > la[1]) & (t < a)
        if a - la[1] <= g_s * 1000 and (not m.any() or pg[m].min() >= pmin):
            la[1] = b
        else:
            out.append([a, b])
    return [tuple(x) for x in out]


VARIANTEN = {
    "v2": ("v2", []),
    "v2+veto0.4": ("v2", [("veto", 0.4)]),
    "v2+veto0.5": ("v2", [("veto", 0.5)]),
    "v2+schnitt0.3+veto0.4": ("v2", [("schnitt", 0.3), ("veto", 0.4)]),
    "v2+dehn0.5+veto0.4": ("v2", [("dehn", 0.5), ("veto", 0.4)]),
    "v2+dehn0.7+veto0.4": ("v2", [("dehn", 0.7), ("veto", 0.4)]),
    "v2+naht4+veto0.4": ("v2", [("naht", 4), ("veto", 0.4)]),
    "v2+dehn0.5+naht4+veto0.4": ("v2", [("dehn", 0.5), ("naht", 4), ("veto", 0.4)]),
    "tief": ("tief", []),
    "tief+veto0.4": ("tief", [("veto", 0.4)]),
    "tief+schnitt0.3+veto0.4": ("tief", [("schnitt", 0.3), ("veto", 0.4)]),
    "tief+schnitt0.5+veto0.5": ("tief", [("schnitt", 0.5), ("veto", 0.5)]),
    "tief+schnitt0.4+veto0.5": ("tief", [("schnitt", 0.4), ("veto", 0.5)]),
    "tief+schnitt0.5+veto0.6": ("tief", [("schnitt", 0.5), ("veto", 0.6)]),
    "tief+schnitt0.6+veto0.6": ("tief", [("schnitt", 0.6), ("veto", 0.6)]),
    "tief+schnitt0.5+naht4+veto0.5": ("tief", [("schnitt", 0.5), ("naht", 4), ("veto", 0.5)]),
    "tief+schnitt0.5+naht8+veto0.5": ("tief", [("schnitt", 0.5), ("naht", 8), ("veto", 0.5)]),
    "tief+naht4+schnitt0.5+veto0.5": ("tief", [("naht", 4), ("schnitt", 0.5), ("veto", 0.5)]),
}


def anwenden(L, schritte, t, v, pg):
    L = sorted(L)
    for art, x in schritte:
        if art == "veto":
            L = veto(L, t, pg, x)
        elif art == "schnitt":
            L = schnitt(L, t, pg, x)
        elif art == "dehn":
            L = dehn(L, t, v, pg, x)
        elif art == "naht":
            L = naht(L, t, pg, x)
    return L


def lauf_dict(a, b, t, v):
    m = (t >= a) & (t <= b)
    return {"t0": a, "t1": b, "dur_s": (b - a) / 1000, "dist_m": float(v[m].sum()) if m.any() else 0.0,
            "pumps": None, "avg_mps": float(v[m].mean()) if m.any() else None,
            "max_mps": float(v[m].max()) if m.any() else None}


def maske(L, t):
    m = np.zeros(t.size, bool)
    for a, b in L:
        m |= (t >= a) & (t <= b)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=12)
    ap.add_argument("--brett", default="", help="Brett-Wahrheit (brett_training.daten(), gepickelt)")
    a = ap.parse_args()
    basis = {r["id"]: r for r in json.load(gzip.open(ML / "schatten-v2.json.gz"))}
    tief = {r["id"]: r for r in json.load(gzip.open(ML / "schatten-tief.json.gz"))}
    ids = [i for i in basis if i in tief]
    with Pool(a.jobs) as pool:
        P = {sid: (t, v, p) for sid, t, v, p in pool.imap_unordered(p_je_session, [basis[i] for i in ids], chunksize=4)
             if t is not None}
    print(f"[{MODELL}] Sessions mit p: {len(P)} von {len(ids)}", flush=True)
    # Wahrheiten fuer die direkte Messung
    brett = pickle.load(open(a.brett, "rb")) if a.brett else None
    fort = json.loads((ML / "v3" / "labels_fortsetzung.json").read_text())["sessions"]
    aus = ML / "werkbank" / MODELL
    aus.mkdir(parents=True, exist_ok=True)
    zeilen = []
    fehlt = set()
    for name, (quelle, schritte) in VARIANTEN.items():
        Q = basis if quelle == "v2" else tief
        res, gesamt_s = [], 0.0
        br = np.zeros(4, int)            # tp fp fn, gleit erkannt
        gl = [0, 0]
        fo = [0, 0]; g_s = 0.0
        for sid in ids:
            r = dict(Q[sid])
            L0 = [(x["t0"], x["t1"]) for x in r["runs"]]
            if sid in P and schritte:
                t, v, p = P[sid]
                L = anwenden(L0, schritte, t, v, glaetten(p))
            else:
                L = L0
            if sid in P:
                t, v, _ = P[sid]
                r["runs"] = [lauf_dict(x, y, t, v) for x, y in L]
            r["num_runs"] = len(r["runs"])
            r["foiling_time_s"] = sum(x["dur_s"] for x in r["runs"])
            r["foiling_distance_m"] = sum(x["dist_m"] or 0 for x in r["runs"])
            gesamt_s += r["foiling_time_s"]
            res.append(r)
            if str(sid) in fort and sid in P:
                t = P[sid][0]
                m = maske(L, t)
                for a0, b0, _ in fort[str(sid)]["bereiche_ms"]:
                    w = (t >= a0) & (t <= b0)
                    fo[0] += int((w & m).sum()); fo[1] += int(w.sum())
            if r.get("user_id") == 350:
                g_s += r["foiling_time_s"]
        if brett:
            for d in brett:
                sid = d["paar"][1]
                t = d["t"]
                r = next((x for x in res if x["id"] == sid), None)
                if r is None:
                    fehlt.add(sid); continue
                L = [(x["t0"], x["t1"]) for x in r["runs"]]
                m = maske(L, t); z = d["z"]
                br[0] += int((m & (z > 0)).sum()); br[1] += int((m & (z == 0)).sum()); br[2] += int((~m & (z > 0)).sum())
                gl[0] += int((m & (z == 1)).sum()); gl[1] += int((z == 1).sum())
        with gzip.open(aus / f"{name}.json.gz", "wt") as f:
            json.dump(res, f, default=str)
        tp, fp, fn = br[:3]
        z = (f"{name:28s} Laeufe {sum(len(x['runs']) for x in res):6d} · {gesamt_s / 3600:6.1f} h"
             + (f" · Brett Praez. {tp / max(tp + fp, 1):.3f} Treffer {tp / max(tp + fn, 1):.3f} Gleit {gl[0]}/{gl[1]}" if brett else "")
             + f" · Guillaume-Fortsetzung {fo[0]}/{fo[1]} s, u350 gesamt {g_s / 60:.0f} min")
        print(z, flush=True); zeilen.append(z)
    if fehlt:
        print("Brett-Uhren nicht im Ausgangs-Satz:", sorted(fehlt))
    (aus / "uebersicht.txt").write_text("\n".join(zeilen) + "\n")


if __name__ == "__main__":
    main()
