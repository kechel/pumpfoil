#!/usr/bin/env python3
"""Was unterscheidet Laeufe AN LAND von echten kurzen Laeufen auf dem Wasser? REIN LESEND.
Je Merkmal die AUC (0,5 = kein Unterschied, 1,0 = trennt perfekt; unter 0,5 = umgekehrt).
Bestehende Sekunden-Merkmale + neue Kandidaten aus der rohen Beschleunigung (Jan, 29.09.)."""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import gzip, json, pathlib, sys
from multiprocessing import Pool
import numpy as np
WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
ML = WURZEL / "server" / "data" / "ml"


def neue_merkmale(r, scale, t_rel, v):
    """r: (n,3) Accel-Raster 25 Hz fuer den Lauf. -> dict neuer Kandidaten."""
    from scipy.ndimage import uniform_filter1d
    a = r / scale
    if a.shape[0] < 50:
        return None
    g = uniform_filter1d(a, size=25, axis=0)                 # 1-s-Mittel = Schwerkraft/Haltung
    gn = g / (np.linalg.norm(g, axis=1, keepdims=True) + 1e-9)
    dyn = a - g
    vert = (dyn * gn).sum(axis=1)                            # entlang der Schwerkraft
    hor = np.linalg.norm(dyn - vert[:, None] * gn, axis=1)
    winkel = np.degrees(np.arccos(np.clip((gn[1:] * gn[:-1]).sum(axis=1), -1, 1)))
    ruck = np.linalg.norm(np.diff(a, axis=0), axis=1) * 25
    # Rhythmus: Hoehe des Autokorrelations-Gipfels bei 0,5-1,25 s (0,8-2 Hz)
    x = np.linalg.norm(dyn, axis=1); x = x - x.mean()
    ac = np.correlate(x, x, "full")[x.size - 1:]; ac = ac / (ac[0] + 1e-12)
    rhythmus = float(ac[12:32].max()) if ac.size > 32 else 0.0
    # Haltung: Streuung der Schwerkraft-Richtung (dreht das Handgelenk?)
    haltung = float(np.degrees(np.arccos(np.clip(gn @ gn.mean(axis=0) / (np.linalg.norm(gn.mean(axis=0)) + 1e-9), -1, 1))).mean())
    vv = v[np.isfinite(v)]
    return {"vert_rms": float(vert.std()), "hor_rms": float(hor.std()),
            "vert_anteil": float(vert.var() / (vert.var() + hor.var() + 1e-12)),
            "dreh_grad_s": float(winkel.mean() * 25), "haltung_streuung": haltung,
            "ruck_rms": float(np.sqrt((ruck ** 2).mean())), "rhythmus": rhythmus,
            "tempo_std": float(vv.std()) if vv.size else 0.0,
            "tempo_anstieg": float(np.abs(np.diff(vv)).mean()) if vv.size > 1 else 0.0}


def eine(arg):
    s, laeufe = arg
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    try:
        tb = build_timebase_for_session(M.ganze_aufnahme(s))
        if not tb.has_accel:
            return []
        t, X = M.merkmale(tb)
        r = M.raster(tb)
    except Exception:
        return []
    off = float(tb.window_start_ms)
    v = X[:, 0]
    from app.analysis.v3 import stufe_a
    try:
        pa = stufe_a.glaetten(stufe_a.wahrscheinlichkeit(tb, fahrer=s["user_id"]), 5)
    except Exception:
        pa = np.full(t.size, np.nan)
    out = []
    for (a, b, klasse) in laeufe:
        m = (t >= a) & (t <= b)
        if m.sum() < 3:
            continue
        i0, i1 = int((a - off) / 1000 * 25), int((b - off) / 1000 * 25)
        nm = neue_merkmale(r[max(i0, 0):i1], tb.accel_scale or 2048, None, v[m])
        if nm is None:
            continue
        alt = {n: float(np.median(X[m, k])) for k, n in enumerate(M.NAMEN)}
        out.append((s["id"], klasse, {**alt, **nm, "dauer_s": (b - a) / 1000,
                                      "p_stufe_a": float(np.nanmean(pa[m])), "user": s["user_id"], "sid": s["id"]}))
    return out


def auc(pos, neg):
    x = np.concatenate([pos, neg]); rang = x.argsort().argsort() + 1
    return (rang[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))


def main():
    b = {s["id"]: s for s in json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))}
    sicht = json.loads((ML / "land_urteil_sicht.json").read_text())
    land = {}
    for x in json.loads((ML / "laeufe_an_land.json").read_text()):
        if x[0] in sicht["land"]:
            land.setdefault(x[0], []).append((x[3], x[4], "land"))
    for f in json.loads((ML / "testfaelle.json").read_text())["faelle"]:
        if f.get("soll") == "kein_lauf":
            land.setdefault(f["session"], []).append((f["t0"], f["t1"], "land"))
    # echte kurze Laeufe: klar auf Wasser, <= 60 s, Pumpfoil, aus Sessions ohne Land-Befund
    p = np.load(ML / "punkte.npz"); w = np.load(ML / "wasser.npz")
    ses = p["session"]; u, idx = np.unique(ses, return_index=True)
    bd = dict(zip(u.tolist(), zip(idx, list(idx[1:]) + [ses.size])))
    rng = np.random.default_rng(1)
    echt = {}
    kand = [sid for sid in bd if sid in b and sid not in land and (b[sid].get("sport_class") or "pumpfoil") == "pumpfoil"
            and b[sid]["detection"] == "model" and b[sid].get("placement") != "board"]
    for sid in rng.choice(kand, 400, replace=False):
        sid = int(sid); a0, e0 = bd[sid]; t = p["t_ms"][a0:e0]; occ = w["occ"][a0:e0]
        for r in b[sid]["runs"]:
            if (r["dur_s"] or 0) > 60:
                continue
            m = (t >= r["t0"]) & (t <= r["t1"])
            if m.sum() >= 3 and (occ[m] >= 50).mean() >= 0.8:
                echt.setdefault(sid, []).append((r["t0"], r["t1"], "echt"))
    arbeit = [(b[s], l) for s, l in list(land.items()) + list(echt.items())]
    with Pool(10) as pool:
        zeilen = [z for res in pool.imap_unordered(eine, arbeit) for z in res]
    L = [z[2] for z in zeilen if z[1] == "land"]; E = [z[2] for z in zeilen if z[1] == "echt"]
    print(f"Laeufe an Land: {len(L)} ({len({z[0] for z in zeilen if z[1]=='land'})} Sessions) · echte kurze Laeufe: {len(E)}")
    namen = [k for k in L[0].keys() if k not in ("user", "sid")]
    erg = []
    for n in namen:
        a = auc(np.array([x[n] for x in L]), np.array([x[n] for x in E]))
        erg.append((abs(a - 0.5), a, n, np.median([x[n] for x in L]), np.median([x[n] for x in E])))
    print(f"{'Merkmal':20s} {'AUC':>5s}  {'Median Land':>12s} {'Median echt':>12s}")
    for _, a, n, ml, me in sorted(erg, reverse=True):
        print(f"{n:20s} {a:5.2f}  {ml:12.3f} {me:12.3f}")
    json.dump({"land": L, "echt": E}, open(ML / "v3" / "unterschiede.json", "w"))


if __name__ == "__main__":
    main()
