#!/usr/bin/env python3
"""Erkennung v3, Stufe B: Sportart je Lauf -> je Session. Zuerst nur Pumpfoil ja/nein (Jan,
29.09.: „sinnvolle Reihenfolge, eins nach dem anderen"), die Einzel-Sportarten nur als Bericht.

Merkmale je Lauf: Verteilung der Sekunden-Merkmale im Lauf (Median/P90) + Dauer, Strecke; je
Session: Wind-Signatur (Tempo abhaengig vom Kurs, s. `wind_signatur`). Labels NUR aus
Session-Sportarten, die ein Mensch gesetzt hat, plus Profil-Standard fuer andere Sportarten
(Nutzer hat im Profil eine Nicht-Pumpfoil-Sportart gewaehlt). Profil-Standard „pumpfoil" ist zu
verrauscht fuers Bewerten — er geht verduennt ins TRAINING, nie in die Bewertung.

Validierung: Fahrer herausgehalten (GroupKFold). Klassen mit einem Fahrer sind so nicht pruefbar —
der Bericht sagt das je Klasse ausdruecklich.

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/training_b.py [--speichern]
"""
import argparse
import collections
import glob
import gzip
import json
import math
import pathlib
import pickle
import sys

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
from app.analysis.v3 import merkmale as M  # noqa: E402

ML = WURZEL / "server" / "data" / "ml"
SPALTEN = ["speed", "speed_cv", "accel_rms", "pump_rms", "hf_rms", "straight_5s", "turn_5s",
           "band_pump", "band_schritt", "band_vib", "f_dom", "woelbung", "puls_rel"]


def wind_signatur(lat, lon, v, im_lauf):
    """Tempo gegen Kurs: v ~ a + b*cos(kurs - theta). Verhaeltnis b/a. Wind (Wing/Kite) zieht in
    eine Richtung schneller — Pumpen und Motor kaum. None, wenn zu wenig Kurse abgedeckt sind."""
    m = im_lauf & (v > 2)
    if m.sum() < 60:
        return None, None
    la, lo = lat[m], lon[m]
    dlat = np.diff(la); dlon = np.diff(lo) * np.cos(np.radians(la[:-1]))
    kurs = np.arctan2(dlon, dlat)
    vv = v[m][1:]
    ok = (np.abs(dlat) + np.abs(dlon)) > 1e-6
    if ok.sum() < 60:
        return None, None
    kurs, vv = kurs[ok], vv[ok]
    A = np.column_stack([np.ones_like(kurs), np.cos(kurs), np.sin(kurs)])
    koef, *_ = np.linalg.lstsq(A, vv, rcond=None)
    amp = math.hypot(koef[1], koef[2])
    # Abdeckung der Kurse (8 Sektoren), sonst ist das Verhaeltnis Zufall
    sek = np.bincount(((kurs + np.pi) / (2 * np.pi) * 8).astype(int) % 8, minlength=8)
    return amp / max(koef[0], 0.1), int((sek > 5).sum())


def daten():
    b = {s["id"]: s for s in json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))}
    from app import storage
    idx = {n: i for i, n in enumerate(M.NAMEN)}
    zeilen = []
    for f in sorted(glob.glob(str(ML / "v3" / "ds" / "*.npz"))):
        sid = int(pathlib.Path(f).stem)
        s = b[sid]
        sport = s.get("sport_class") or "pumpfoil"
        quelle = s.get("sport_source")
        mensch = quelle in ("owner", "admin")
        if not (mensch or (quelle == "default" and sport != "pumpfoil") or quelle == "default"):
            continue
        d = np.load(f)
        t, X = d["t"], d["X"]
        try:
            g = np.asarray(storage.load_gps(s["uuid"]), dtype=float)
        except Exception:
            continue
        if len(g) != t.size:
            continue
        il = d["im_lauf"]
        wind, abdeckung = wind_signatur(g[:, 1], g[:, 2], np.nan_to_num(g[:, 3]), il)
        for r in s["runs"]:
            m = (t >= r["t0"]) & (t <= r["t1"])
            if m.sum() < 5:
                continue
            Z = X[m]
            vec = []
            for c in SPALTEN:
                col = Z[:, idx[c]]
                vec += [float(np.median(col)), float(np.percentile(col, 90))]
            vec += [float(r.get("dur_s") or m.sum()), float(r.get("dist_m") or 0),
                    float(r.get("pump_hz") or 0), float(wind if wind is not None else -1),
                    float(abdeckung or 0)]
            zeilen.append((sid, s["user_id"], sport, "mensch" if mensch else "profil", vec))
    return zeilen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--speichern", action="store_true")
    a = ap.parse_args()
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.model_selection import GroupKFold
    Z = daten()
    rng = np.random.default_rng(0)
    # Profil-„pumpfoil" verduennt (verrauscht, riesig); alles andere ganz.
    Z = [z for z in Z if not (z[3] == "profil" and z[2] == "pumpfoil" and rng.random() > 0.15)]
    X = np.array([z[4] for z in Z], dtype=np.float32)
    y = np.array([1 if z[2] == "pumpfoil" else 0 for z in Z])
    g = np.array([z[1] for z in Z])
    sid = np.array([z[0] for z in Z])
    bewerten = np.array([z[3] == "mensch" or z[2] != "pumpfoil" for z in Z])
    sport = np.array([z[2] for z in Z])
    print("Laeufe", len(y), "Sessions", len(set(sid)), "Fahrer", len(set(g)),
          "· Pumpfoil", int(y.sum()), "andere", int((y == 0).sum()), flush=True)
    p = np.zeros(len(y))
    for tr, te in GroupKFold(5).split(X, y, g):
        clf = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.06, max_leaf_nodes=31,
                                             min_samples_leaf=40, class_weight="balanced", random_state=0)
        clf.fit(X[tr], y[tr])
        p[te] = clf.predict_proba(X[te])[:, 1]
    # je Session: Mittel der Lauf-Wahrscheinlichkeiten
    ses = collections.defaultdict(list)
    for i in range(len(y)):
        ses[sid[i]].append(i)
    print("\nStufe B, Fahrer herausgehalten — je SESSION (nur bewertbare Labels)")
    tab = collections.defaultdict(lambda: [0, 0, set()])
    for s_, ii in ses.items():
        i0 = ii[0]
        if not bewerten[i0]:
            continue
        vor = float(np.mean(p[ii])) >= 0.5
        wahr = bool(y[i0])
        t = tab[sport[i0]]
        t[0] += 1; t[1] += (vor == wahr); t[2].add(g[i0])
    for k, (n, ok, fahrer) in sorted(tab.items(), key=lambda kv: -kv[1][0]):
        hinweis = "  (nur 1 Fahrer: nicht pruefbar, jede Zahl hier ist Zufall)" if len(fahrer) < 2 else ""
        print(f"  {k:14s} {ok:4d}/{n:<4d} richtig  · {len(fahrer)} Fahrer{hinweis}")
    np.savez_compressed(ML / "v3" / "cv_b.npz", p=p, y=y, g=g, sid=sid, sport=sport, bewerten=bewerten)
    if a.speichern:
        clf = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.06, max_leaf_nodes=31,
                                             min_samples_leaf=40, class_weight="balanced", random_state=0)
        clf.fit(X, y)
        with open(ML / "v3" / "stufe_b.pkl", "wb") as f:
            pickle.dump({"clf": clf, "spalten": SPALTEN}, f)
        print("gespeichert:", ML / "v3" / "stufe_b.pkl")


if __name__ == "__main__":
    main()
