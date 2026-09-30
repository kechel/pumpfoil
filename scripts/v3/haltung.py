#!/usr/bin/env python3
"""Erkennung v3: Haltung der Uhr je Abschnitt, relativ zur Session. REIN LESEND.

Jans Idee (30.09.2026, an #9580): „bei den meisten Pumpern ist die Richtung der Uhr immer etwa gleich
verteilt waehrend eines Laufs, und genau das koennte bei erkanntem Pumpen an Land (also Laufen) ganz
anders sein." Gemessen je Abschnitt, jeweils gegen die TYPISCHE Lauf-Haltung derselben Session
(Median ueber die sicheren Laeufe, p_r3 >= 0,9, >= 10 s — ohne den gepruefften Abschnitt selbst):
  winkel   Winkel der mittleren Schwerkraft-Richtung zur typischen Lauf-Richtung (Grad)
  streu    wie stark die Richtung im Abschnitt wackelt (mittlere Abweichung, Grad)
  profil   Abstand der Bewegungs-Anteile x/y/z zum typischen Lauf-Profil (L1, 0..2)
  staerke  Bewegungs-Staerke (rms) relativ zur typischen Lauf-Staerke
Gruppen: echt (sichere Laeufe), land (Sichtpruefung), aussortiert (Nutzer), gehen (bewegt an Land,
kein Lauf, Datensatz-Quelle „land"). Ergebnis: AUC je Merkmal echt gegen jede Gruppe, dazu je Fahrer.

Aufruf (aus server/): DATABASE_URL=... nice -n 15 .venv/bin/python ../scripts/v3/haltung.py [--jobs 10]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse
import gzip
import json
import pathlib
import sys
from multiprocessing import Pool

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
ML = WURZEL / "server" / "data" / "ml"
MERKMALE = ["winkel", "streu", "profil", "staerke"]


def je_sekunde(tb):
    from app.analysis.v3 import merkmale as M
    fs = float(tb.accel_hz or 25)
    r = M.raster(tb, 25.0) / (tb.accel_scale or 2048)
    fs = 25.0
    off = float(tb.window_start_ms)
    k = int(fs)
    grav = np.stack([np.convolve(r[:, i], np.ones(k) / k, mode="same") for i in range(3)], 1)
    ac = r - grav
    n = r.shape[0] // k
    g = grav[:n * k].reshape(n, k, 3).mean(1)
    a2 = (ac[:n * k] ** 2).reshape(n, k, 3).mean(1)
    t = off + (np.arange(n) + 0.5) * 1000.0
    return t, g, a2


def abschnitt(t, g, a2, a, b):
    m = (t >= a) & (t <= b)
    if m.sum() < 5:
        return None
    gg = g[m]; gn = gg / np.maximum(np.linalg.norm(gg, axis=1, keepdims=True), 1e-9)
    gu = gn.mean(0); gu /= max(np.linalg.norm(gu), 1e-9)
    streu = float(np.degrees(np.arccos(np.clip(gn @ gu, -1, 1))).mean())
    var = a2[m].mean(0)
    return gu, streu, var / max(var.sum(), 1e-12), float(np.sqrt(var.sum()))


def referenz(stuecke):
    if not stuecke:
        return None
    gu = np.median([x[0] for x in stuecke], axis=0); gu /= max(np.linalg.norm(gu), 1e-9)
    return gu, np.median([x[2] for x in stuecke], axis=0), float(np.median([x[3] for x in stuecke]))


def merkmale_gegen(x, ref):
    gu, streu, profil, rms = x
    rg, rp, rr = ref
    return [float(np.degrees(np.arccos(np.clip(gu @ rg, -1, 1)))), streu,
            float(np.abs(profil - rp).sum()), rms / max(rr, 1e-6)]


def eine(arg):
    s, land, ausg = arg
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    sid = s["id"]
    try:
        tb = build_timebase_for_session(M.ganze_aufnahme(s))
        t, g, a2 = je_sekunde(tb)
    except Exception:
        return []
    pf = ML / "v3" / "p_r3" / f"{sid}.npz"
    if not pf.exists():
        return []
    d = np.load(pf); tp, p = d["t"], d["p"]
    sicher = []
    for r in s["runs"]:
        m = (tp >= r["t0"]) & (tp <= r["t1"])
        if r["t1"] - r["t0"] >= 10000 and m.any() and p[m].mean() >= 0.9:
            x = abschnitt(t, g, a2, r["t0"], r["t1"])
            if x:
                sicher.append(((r["t0"], r["t1"]), x))
    if len(sicher) < 2:
        return []
    out = []
    def ref_ohne(a, b):
        return referenz([x for (aa, bb), x in sicher if bb < a or aa > b])
    for (a, b), x in sicher:
        ref = ref_ohne(a, b)
        if ref:
            out.append(("echt", s["user_id"], sid, a, b, merkmale_gegen(x, ref)))
    for grp, bereiche in (("land", land), ("aussortiert", ausg)):
        for a, b in bereiche:
            if b - a < 5000:
                continue
            x = abschnitt(t, g, a2, a, b); ref = ref_ohne(a, b)
            if x and ref:
                out.append((grp, s["user_id"], sid, a, b, merkmale_gegen(x, ref)))
    ds = ML / "v3" / "ds" / f"{sid}.npz"
    if ds.exists():
        dd = np.load(ds)
        mm = dd["q"] == 4            # Quelle „land": bewegt, klar an Land, kein Lauf
        i = 0; tt = dd["t"]
        while i < mm.size:
            if mm[i]:
                j = i
                while j + 1 < mm.size and mm[j + 1]:
                    j += 1
                if tt[j] - tt[i] >= 10000:
                    x = abschnitt(t, g, a2, tt[i], tt[j]); ref = ref_ohne(tt[i], tt[j])
                    if x and ref:
                        out.append(("gehen", s["user_id"], sid, float(tt[i]), float(tt[j]), merkmale_gegen(x, ref)))
                i = j + 1
            else:
                i += 1
    return out


def auc(pos, neg):
    """P(neg > pos) — >0,5 heisst: die Gruppe liegt beim Merkmal HOEHER als die echten Laeufe."""
    pos, neg = np.asarray(pos), np.asarray(neg)
    if pos.size == 0 or neg.size == 0:
        return float("nan")
    alle = np.concatenate([pos, neg]); rang = alle.argsort().argsort() + 1
    return float((rang[pos.size:].sum() - neg.size * (neg.size + 1) / 2) / (pos.size * neg.size))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--jobs", type=int, default=10)
    a = ap.parse_args()
    b = json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))
    L = json.load(gzip.open(sorted(ML.glob("labels-*.json.gz"))[-1]))
    sicht = json.loads((ML / "land_urteil_sicht.json").read_text())
    land = {}
    for x in json.loads((ML / "laeufe_an_land.json").read_text()):
        if x[0] in sicht["land"]:
            land.setdefault(x[0], []).append((x[3], x[4]))
    ausg = {x["session"]: x["bereiche"] for x in L["nutzer_aussortiert"]}
    wahl = [s for s in b if (s["accel_hz"] or 0) >= 15 and s["detection"] == "model" and s.get("uuid")
            and s.get("placement") != "board"
            and (s["id"] in land or s["id"] in ausg or s["user_id"] == 2
                 or (ML / "v3" / "ds" / f"{s['id']}.npz").exists())]
    # alle mit Datensatz waeren ~2500 — fuer „gehen" reicht eine feste Stichprobe plus alle Sonderfaelle
    rng = np.random.default_rng(7)
    rest = [s for s in wahl if s["id"] not in land and s["id"] not in ausg and s["user_id"] != 2]
    wahl = [s for s in wahl if s not in rest] + list(rng.choice(rest, size=min(400, len(rest)), replace=False))
    print("Sessions:", len(wahl), flush=True)
    with Pool(a.jobs) as pool:
        zeilen = [z for res in pool.imap_unordered(eine, [(s, land.get(s["id"], []), ausg.get(s["id"], [])) for s in wahl], chunksize=2) for z in res]
    (ML / "v3" / "haltung.json").write_text(json.dumps(zeilen))
    grp = {}
    for g_, u, sid, a0, b0, f in zeilen:
        grp.setdefault(g_, []).append((u, f))
    print({k: len(v) for k, v in grp.items()})
    echt = np.array([f for u, f in grp.get("echt", [])])
    print("\nMedian je Gruppe:", "  ".join(MERKMALE))
    for k, v in grp.items():
        f = np.array([x for u, x in v])
        print(f"  {k:12s} n={len(v):5d}  " + "  ".join(f"{np.median(f[:, i]):7.2f}" for i in range(4)))
    print("\nAUC echt gegen Gruppe (1,0 = trennt vollstaendig; <0,5 = Gruppe niedriger):")
    for k in ("land", "aussortiert", "gehen"):
        if k not in grp:
            continue
        f = np.array([x for u, x in grp[k]])
        print(f"  {k:12s} " + "  ".join(f"{n} {auc(echt[:, i], f[:, i]):.2f}" for i, n in enumerate(MERKMALE)))
    # Jan (u2) allein
    e2 = np.array([f for u, f in grp.get("echt", []) if u == 2])
    for k in ("land", "aussortiert", "gehen"):
        f = np.array([x for u, x in grp.get(k, []) if u == 2])
        if len(e2) and len(f):
            print(f"  u2 {k:9s} n={len(f):4d} " + "  ".join(f"{n} {auc(e2[:, i], f[:, i]):.2f}" for i, n in enumerate(MERKMALE)))


if __name__ == "__main__":
    main()
