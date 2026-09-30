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
        p_ref = None
        rf = ML / "v3" / "p_r3" / f"{s['id']}.npz"
        if MODELL != "r3" and rf.exists():          # Haltungs-Modelle brauchen r3 als Referenz
            rr = np.load(rf); p_ref = np.interp(tb.t_gps_ms.astype(float), rr["t"], rr["p"])
        p = stufe_a.wahrscheinlichkeit(tb, fahrer=s["user_id"], p_ref=p_ref)
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


def teil(L, t, pg, theta, luecke_s=3, min_s=3):
    """Jeden Lauf in die Stuecke zerlegen, in denen p >= theta ist (Loecher <= luecke_s geschlossen).
    Anlass: tief verschmilzt Gehen und Fahren zu EINEM Abschnitt, dessen mittleres p dann unter der
    Veto-Schwelle liegt — das Veto warf den echten Lauf darin mit weg (#8490, #1341)."""
    out = []
    for a, b in L:
        idx = np.flatnonzero((t >= a) & (t <= b))
        if idx.size == 0:
            out.append((a, b)); continue
        gut = pg[idx] >= theta
        # kurze Loecher schliessen
        i = 0
        while i < gut.size:
            if not gut[i]:
                j = i
                while j + 1 < gut.size and not gut[j + 1]:
                    j += 1
                if i > 0 and j + 1 < gut.size and (t[idx[j + 1]] - t[idx[i - 1]]) / 1000 <= luecke_s + 1:
                    gut[i:j + 1] = True
                i = j + 1
            else:
                i += 1
        i = 0
        while i < gut.size:
            if gut[i]:
                j = i
                while j + 1 < gut.size and gut[j + 1]:
                    j += 1
                x, y = t[idx[i]], t[idx[j]]
                if y - x >= min_s * 1000:
                    out.append((x, y))
                i = j + 1
            else:
                i += 1
    return out


def kurz(L, t, pg, tau_k, k_s=8):
    """Stuecke unter k_s Sekunden brauchen ein klar hohes mittleres p — die meisten kurzen Stuecke
    nach `teil` sind Reste langer Nicht-Foil-Abschnitte (Gehen am Ufer), in denen p kurz hochging."""
    out = []
    for a, b in L:
        if b - a >= k_s * 1000:
            out.append((a, b)); continue
        m = (t >= a) & (t <= b)
        if m.any() and pg[m].mean() >= tau_k:
            out.append((a, b))
    return out


HS = ML / "v3" / "hs"


def haltung_je_sekunde(s):
    """Schwerkraft + Bewegungs-Energie je Sekunde (fuer den Haltungs-Check), zwischengespeichert."""
    f = HS / f"{s['id']}.npz"
    if f.exists():
        d = np.load(f)
        return s["id"], d["t"], d["g"], d["a2"]
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import haltung as H
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    try:
        t, g, a2 = H.je_sekunde(build_timebase_for_session(M.ganze_aufnahme(s)))
    except Exception:
        return s["id"], None, None, None
    HS.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(f, t=t, g=g.astype(np.float32), a2=a2.astype(np.float32))
    return s["id"], t, g, a2


def haltung_check(L, t, p, hs, regel, ref_p=0.9, ref_s=10):
    """Jans Idee (30.09.): in echten Laeufen sitzt die Uhr wie in den ANDEREN sicheren Laeufen der
    Session. Lauf weg, wenn (winkel > w ODER profil > pr) UND staerke < st — gegen die Referenz aus
    den uebrigen sicheren Laeufen (mittleres p >= ref_p, >= ref_s s), nie gegen sich selbst.
    Weniger als 2 Referenz-Laeufe: kein Urteil."""
    import haltung as H
    w, pr, st = regel
    th, g, a2 = hs
    sicher = []
    for a, b in L:
        m = (t >= a) & (t <= b)
        if b - a >= ref_s * 1000 and m.any() and p[m].mean() >= ref_p:
            x = H.abschnitt(th, g, a2, a, b)
            if x:
                sicher.append(((a, b), x))
    out = []
    for a, b in L:
        andere = [x for (aa, bb), x in sicher if (aa, bb) != (a, b)]
        x = H.abschnitt(th, g, a2, a, b)
        if len(andere) < 2 or x is None:
            out.append((a, b)); continue
        f = H.merkmale_gegen(x, H.referenz(andere))
        if (f[0] > w or f[2] > pr) and f[3] < st:
            continue
        out.append((a, b))
    return out


def konstanz_check(L, sid, schwelle, max_s=None):
    """Jan (30.09.): in echten Laeufen bleibt die Uhr-Haltung konstant (gegen SICH SELBST, also
    unabhaengig von Stellungswechseln). Lauf weg, wenn der Median von konstanz30 (±15 s, Anteil
    innerhalb 20° der eigenen Hauptrichtung) im Lauf unter `schwelle` liegt. Optional nur fuer
    Laeufe bis max_s Sekunden."""
    f = ML / "v3" / "ds_h" / f"{sid}.npz"
    if not f.exists():
        return L
    d = np.load(f)
    t, k = d["t"], d["H"][:, 4]
    out = []
    for a, b in L:
        m = (t >= a) & (t <= b) & np.isfinite(k)
        if m.sum() >= 3 and np.median(k[m]) < schwelle and (max_s is None or (b - a) / 1000 <= max_s):
            continue
        out.append((a, b))
    return out


def vereinigung(L1, L2):
    out = []
    for a, b in sorted(list(L1) + list(L2)):
        if out and a <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
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
    # Reihenfolge umgekehrt: erst den GANZEN Lauf pruefen, dann die Raender schneiden. Andersherum
    # blieb von langen tief-Laeufen, die kaum Foilen waren, ein kurzes Stueck mit hohem p stehen
    # und bestand das Veto muehelos (2554 neue Laeufe unter 8 s, 1179 davon ohne v2-Gegenstueck).
    "tief+veto0.4+schnitt0.5": ("tief", [("veto", 0.4), ("schnitt", 0.5)]),
    "tief+veto0.5+schnitt0.5": ("tief", [("veto", 0.5), ("schnitt", 0.5)]),
    "tief+veto0.5+schnitt0.4": ("tief", [("veto", 0.5), ("schnitt", 0.4)]),
    "tief+veto0.6+schnitt0.5": ("tief", [("veto", 0.6), ("schnitt", 0.5)]),
    "tief+veto0.5+schnitt0.5+veto0.5": ("tief", [("veto", 0.5), ("schnitt", 0.5), ("veto", 0.5)]),
    # Profil-Empfindlichkeit als Stellschraube fuer die MODELL-Schwellen statt fuer die Tempo-
    # Grenzen (Jan: „es sollte auch die profileinstellung beachten … oder vielleicht brauchen wir
    # die dann auch nicht mehr"). Werte je Stufe in EMPF_SCHWELLEN.
    "tief+empf": ("tief", "empf"),
    "tief+empf2": ("tief", "empf2"),
    "tief+teil0.4+veto0.5": ("tief", [("teil", 0.4), ("veto", 0.5)]),
    "tief+teil0.5+veto0.5": ("tief", [("teil", 0.5), ("veto", 0.5)]),
    "tief+teil0.3+veto0.5": ("tief", [("teil", 0.3), ("veto", 0.5)]),
    "tief+empfteil": ("tief", "empfteil"),
    "tief+teil0.4+veto0.5+kurz0.8": ("tief", [("teil", 0.4), ("veto", 0.5), ("kurz", 0.8)]),
    "beide+teil0.4+veto0.5+kurz0.8": ("beide", [("teil", 0.4), ("veto", 0.5), ("kurz", 0.8)]),
    "beide+teil0.4+veto0.5+kurz0.9": ("beide", [("teil", 0.4), ("veto", 0.5), ("kurz", 0.9)]),
    "beide+empfteilkurz": ("beide", "empfteilkurz"),
    "tief+empfteilkurz": ("tief", "empfteilkurz"),
    "beide+empfteilkurzroh": ("beide", "empfteilkurzroh"),
    "beide+empfteilkurzhalt": ("beide", "empfteilkurzhalt"),
    "beide+empfteilkurzkonst0.2": ("beide", "empfteilkurzkonst:0.2"),
    "beide+empfteilkurzkonst0.3": ("beide", "empfteilkurzkonst:0.3"),
    "beide+empfteilkurzkonst0.4": ("beide", "empfteilkurzkonst:0.4"),
    "beide+empfteilkurzkonst0.3bis60": ("beide", "empfteilkurzkonst:0.3:60"),
    "beide+empfteilkurzhalt2": ("beide", "empfteilkurzhalt2"),
    "tief+schnitt0.5+veto0.6": ("tief", [("schnitt", 0.5), ("veto", 0.6)]),
    "tief+schnitt0.6+veto0.6": ("tief", [("schnitt", 0.6), ("veto", 0.6)]),
    "tief+schnitt0.5+naht4+veto0.5": ("tief", [("schnitt", 0.5), ("naht", 4), ("veto", 0.5)]),
    "tief+schnitt0.5+naht8+veto0.5": ("tief", [("schnitt", 0.5), ("naht", 8), ("veto", 0.5)]),
    "tief+naht4+schnitt0.5+veto0.5": ("tief", [("naht", 4), ("schnitt", 0.5), ("veto", 0.5)]),
}


EMPF_TEIL = {"normal": (0.4, 0.5), "light": (0.3, 0.4), "attempts": (0.25, 0.3)}
EMPF_SCHWELLEN = {
    "empf": {"normal": (0.5, 0.4), "light": (0.4, 0.3), "attempts": (0.3, 0.25)},
    "empf2": {"normal": (0.5, 0.4), "light": (0.35, 0.3), "attempts": (0.2, 0.2)},
}


EMPF_KURZ = {"normal": 0.8, "light": 0.7, "attempts": 0.6}


empf_sid = [None]


def anwenden(L, schritte, t, v, pg, empf="normal", p_roh=None, hs=None):
    if schritte == "empfteil":
        theta, tau = EMPF_TEIL.get(empf or "normal", EMPF_TEIL["normal"])
        schritte = [("teil", theta), ("veto", tau)]
    elif schritte == "empfteilkurz":
        theta, tau = EMPF_TEIL.get(empf or "normal", EMPF_TEIL["normal"])
        schritte = [("teil", theta), ("veto", tau), ("kurz", 0.8)]
    elif schritte in ("empfteilkurzhalt", "empfteilkurzhalt2"):
        theta, tau = EMPF_TEIL.get(empf or "normal", EMPF_TEIL["normal"])
        regel = (30, 0.4, 0.5) if schritte == "empfteilkurzhalt" else (30, 0.4, 0.4)
        schritte = [("teil", theta), ("veto", tau), ("kurz", 0.8), ("haltung", regel)]
    elif isinstance(schritte, str) and schritte.startswith("empfteilkurzkonst"):
        theta, tau = EMPF_TEIL.get(empf or "normal", EMPF_TEIL["normal"])
        teile = schritte.split(":")          # empfteilkurzkonst:<schwelle>[:<max_s>]
        k = (float(teile[1]), float(teile[2]) if len(teile) > 2 else None)
        schritte = [("teil", theta), ("veto", tau), ("kurz", 0.8), ("konstanz", k)]
    elif schritte == "empfteilkurzroh":
        # kurze Stuecke am UNGEGLAETTETEN p messen (die Glaettung zieht p an den Raendern kurzer
        # Laeufe herunter) und je Empfindlichkeit milder
        theta, tau = EMPF_TEIL.get(empf or "normal", EMPF_TEIL["normal"])
        schritte = [("teil", theta), ("veto", tau), ("kurzroh", EMPF_KURZ.get(empf or "normal", 0.8))]
    if isinstance(schritte, str):
        tau, theta = EMPF_SCHWELLEN[schritte].get(empf or "normal", EMPF_SCHWELLEN[schritte]["normal"])
        schritte = [("veto", tau), ("schnitt", theta)]
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
        elif art == "teil":
            L = teil(L, t, pg, x)
        elif art == "kurz":
            L = kurz(L, t, pg, x)
        elif art == "konstanz":
            L = konstanz_check(L, empf_sid[0], *x)
        elif art == "haltung":
            if hs is not None:
                L = haltung_check(L, t, p_roh if p_roh is not None else pg, hs, x)
        elif art == "kurzroh":
            L = kurz(L, t, p_roh if p_roh is not None else pg, x)
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
    with Pool(a.jobs) as pool:
        HSD = {sid: (t, g, a2) for sid, t, g, a2 in pool.imap_unordered(haltung_je_sekunde, [basis[i] for i in ids], chunksize=4)
               if t is not None}
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    # Wahrheiten fuer die direkte Messung
    brett = pickle.load(open(a.brett, "rb")) if a.brett else None
    fort = json.loads((ML / "v3" / "labels_fortsetzung.json").read_text())["sessions"]
    aus = ML / "werkbank" / MODELL
    aus.mkdir(parents=True, exist_ok=True)
    zeilen = []
    fehlt = set()
    for name, (quelle, schritte) in VARIANTEN.items():
        Q = basis if quelle == "v2" else tief      # „beide": Kopf von tief, Laeufe vereinigt
        res, gesamt_s = [], 0.0
        br = np.zeros(4, int)            # tp fp fn, gleit erkannt
        gl = [0, 0]
        fo = [0, 0]; g_s = 0.0
        klar = [0, 0]
        for sid in ids:
            r = dict(Q[sid])
            L0 = [(x["t0"], x["t1"]) for x in r["runs"]]
            if quelle == "beide":
                L0 = vereinigung(L0, [(x["t0"], x["t1"]) for x in basis[sid]["runs"]])
            if sid in P and schritte:
                t, v, p = P[sid]
                empf_sid[0] = sid
                L = anwenden(L0, schritte, t, v, glaetten(p), r.get("sensitivity"), p, HSD.get(sid))
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
            if sid in P:
                t, _, p = P[sid]
                for x in basis[sid]["runs"]:
                    m = (t >= x["t0"]) & (t <= x["t1"])
                    if m.sum() >= 5 and p[m].mean() >= 0.8:
                        klar[1] += 1
                        o = sum(max(0, min(x["t1"], y["t1"]) - max(x["t0"], y["t0"])) for y in r["runs"])
                        klar[0] += o < 0.5 * (x["t1"] - x["t0"])
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
             + f" · Guillaume-Fortsetzung {fo[0]}/{fo[1]} s, u350 gesamt {g_s / 60:.0f} min"
             + f" · klare v2-Laeufe verloren {klar[0]}/{klar[1]}"
             + f" · <8 s {sum(1 for x in res for y in x['runs'] if y['dur_s'] < 8)}")
        print(z, flush=True); zeilen.append(z)
    if fehlt:
        print("Brett-Uhren nicht im Ausgangs-Satz:", sorted(fehlt))
    (aus / "uebersicht.txt").write_text("\n".join(zeilen) + "\n")


if __name__ == "__main__":
    main()
