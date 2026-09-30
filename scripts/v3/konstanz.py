#!/usr/bin/env python3
"""Erkennung v3: wie KONSTANT haelt jemand die Uhr — innerhalb eines Laufs, gegen sich selbst. REIN LESEND.

Jan (30.09.2026): „95 %+ je Run sollte eher konstant bleiben, waehrend Spazierengehen eher nur <20 %
konstant haben. Bei Autofahrten noch viel extremer, weil man sich da gar nicht selber bewegt …
schau dir das auch ueber sliding windows an und erstelle daraus eine Verteilung der Richtungswechsel
der Uhren-Achsen."

Anders als haltung.py (gegen die ANDEREN Laeufe der Session, scheiterte an Stellungswechseln) misst
das hier jeden Abschnitt nur gegen SICH SELBST:
  konstanz   Anteil der Zeit, in der die Schwerkraft-Richtung (1-s-Mittel, alle 0,2 s) innerhalb
             KONST_GRAD der Hauptrichtung des Abschnitts liegt
  wechsel    wie schnell die Uhr-Achse dreht: mittlere Winkelaenderung der Schwerkraft-Richtung,
             Grad je Sekunde (aus 0,2-s-Schritten)
  energie    Bewegung ohne Schwerkraft (rms, g) — Auto: kaum eigene Bewegung
Ausgewertet je ganzem Abschnitt und in gleitenden Fenstern (FENSTER_S, Schritt FENSTER_S/2).

Gruppen: echt (sichere Laeufe), land (Sicht), aussortiert (Nutzer), gehen (bewegt an Land),
auto (> 40 km/h, >= 30 s, alle Sessions), jan_gehen / jan_auto (Jans FIT ohne Pumpfoil),
brett_gehen (Brett pumpt nicht, Uhr 2,5-8 km/h). Abschnitte aus data/ml/v3/haltung.json.

Aufruf (aus server/): DATABASE_URL=... nice -n 15 .venv/bin/python ../scripts/v3/konstanz.py [--jobs 12]
Ergebnis: data/ml/v3/konstanz.json + Tabelle; Bild mit ~/ml-venv: scripts/v3/konstanz_bild.py
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
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
HZ, SCHRITT_HZ = 25.0, 5.0
KONST_GRAD = 20.0
FENSTER_S = 10


def richtungen(tb):
    """-> t (Session-ms, 5 Hz), u (Einheitsvektor Schwerkraft), e (Bewegungs-Energie rms je Schritt)."""
    from app.analysis.v3 import merkmale as M
    r = M.raster(tb, HZ) / float(tb.accel_scale or 2048)
    if r.shape[0] < 2 * HZ:
        return None
    k = int(HZ)
    grav = np.stack([np.convolve(r[:, i], np.ones(k) / k, mode="same") for i in range(3)], 1)
    ac = r - grav
    s = int(HZ / SCHRITT_HZ)
    n = r.shape[0] // s
    g = grav[:n * s].reshape(n, s, 3).mean(1)
    e = np.sqrt((ac[:n * s] ** 2).reshape(n, s, 3).sum(2).mean(1))
    u = g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
    t = float(tb.window_start_ms) + (np.arange(n) + 0.5) * 1000.0 / SCHRITT_HZ
    return t, u, e


def kennzahlen(u, e):
    if u.shape[0] < 5:
        return None
    m = u.mean(0); m /= max(np.linalg.norm(m), 1e-9)
    ab = np.degrees(np.arccos(np.clip(u @ m, -1, 1)))
    schritt = np.degrees(np.arccos(np.clip((u[1:] * u[:-1]).sum(1), -1, 1)))
    return [float((ab <= KONST_GRAD).mean()), float(schritt.mean() * SCHRITT_HZ), float(np.sqrt((e ** 2).mean()))]


def auswerten(t, u, e, a, b):
    m = (t >= a) & (t <= b)
    ganz = kennzahlen(u[m], e[m])
    if ganz is None:
        return None
    fen = []
    x = a
    while x + FENSTER_S * 1000 <= b:
        mm = (t >= x) & (t < x + FENSTER_S * 1000)
        k = kennzahlen(u[mm], e[mm])
        if k:
            fen.append(k)
        x += FENSTER_S * 500
    return ganz, fen


def stuecke(mask, t, min_ms):
    out, i = [], 0
    while i < mask.size:
        if mask[i]:
            j = i
            while j + 1 < mask.size and mask[j + 1]:
                j += 1
            if t[j] - t[i] >= min_ms:
                out.append((float(t[i]), float(t[j])))
            i = j + 1
        else:
            i += 1
    return out


def eine(arg):
    s, abschnitte = arg
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    try:
        tb = build_timebase_for_session(M.ganze_aufnahme(s))
        R = richtungen(tb)
    except Exception:
        return []
    if R is None:
        return []
    t, u, e = R
    out = []
    for grp, a, b in abschnitte:
        x = auswerten(t, u, e, a, b)
        if x:
            out.append((grp, s["user_id"], s["id"], a, b) + x)
    # Autofahrt: GPS > 40 km/h am Stueck >= 30 s
    tg = tb.t_gps_ms.astype(float)
    v = np.nan_to_num(np.array([g[3] if len(g) > 3 and g[3] is not None else np.nan for g in tb.gps], float))
    for a, b in stuecke(v > 40 / 3.6, tg, 30000):
        x = auswerten(t, u, e, a, b)
        if x:
            out.append(("auto", s["user_id"], s["id"], a, b) + x)
    return out


def fit_gruppen():
    """Jans FIT ohne Pumpfoil: Gehen (3-7 km/h) und Auto (> 30 km/h) getrennt."""
    import io, zipfile
    from app.fitimport import parse_fit_bytes
    from app.analysis.timebase import build_timebase
    out = []
    for p in sorted((ML / "v3" / "negativ_fit").glob("*.zip")):
        roh = p.read_bytes()
        z = zipfile.ZipFile(io.BytesIO(roh))
        roh = z.read([n for n in z.namelist() if n.lower().endswith(".fit")][0])
        f = parse_fit_bytes(roh)
        acc = np.frombuffer(f.get("accel_bytes") or b"", dtype="<i2").reshape(-1, 3)
        if acc.shape[0] < 500 or len(f["gps_samples"]) < 60:
            continue
        tb = build_timebase(f["gps_samples"], acc, 2048, f.get("accel_hz"))
        R = richtungen(tb)
        if R is None:
            continue
        t, u, e = R
        tg = tb.t_gps_ms.astype(float)
        v = np.nan_to_num(np.array([g[3] if len(g) > 3 and g[3] is not None else np.nan for g in tb.gps], float))
        v3 = np.convolve(v, np.ones(5) / 5, mode="same")
        for grp, m, lang in (("jan_gehen", (v3 > 3 / 3.6) & (v3 < 7 / 3.6), 20000), ("jan_auto", v3 > 30 / 3.6, 30000)):
            for a, b in stuecke(m, tg, lang):
                x = auswerten(t, u, e, a, b)
                if x:
                    out.append((grp, 2, p.stem, a, b) + x)
    return out


def brett_gehen():
    """Brett-Paare: Brett pumpt nicht, Uhr 2,5-8 km/h, >= 10 s -> Gehen, von der Karte unabhaengig."""
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    f = pathlib.Path(os.environ.get("BRETT_Z", ""))
    if not f.is_file():
        return []
    b = {s["id"]: s for s in json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))}
    out = []
    for d in pickle.load(open(f, "rb")):
        uid = d["paar"][1]
        if uid not in b:
            continue
        R = richtungen(build_timebase_for_session(M.ganze_aufnahme(b[uid])))
        if R is None:
            continue
        t, u, e = R
        v = d["X"][:, 0] * 3.6
        for grp, m in (("brett_gehen", (d["z"] == 0) & (v >= 2.5) & (v <= 8)), ("brett_fahren", d["z"] > 0)):
            for a, bb in stuecke(m, d["t"], 10000):
                x = auswerten(t, u, e, a, bb)
                if x:
                    out.append((grp, d["fahrer"], uid, a, bb) + x)
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--jobs", type=int, default=12)
    a = ap.parse_args()
    b = {s["id"]: s for s in json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))}
    H = json.loads((ML / "v3" / "haltung.json").read_text())
    je = {}
    for grp, u, sid, a0, b0, _ in H:
        je.setdefault(sid, []).append((grp, a0, b0))
    arbeit = [(b[sid], je[sid]) for sid in je if sid in b]
    with Pool(a.jobs) as pool:
        Z = [z for res in pool.imap_unordered(eine, arbeit, chunksize=2) for z in res]
    Z += fit_gruppen() + brett_gehen()
    (ML / "v3" / "konstanz.json").write_text(json.dumps(Z))
    G = {}
    for z in Z:
        G.setdefault(z[0], []).append(z)
    namen = ["konstanz", "wechsel °/s", "energie g"]
    print(f"\nje ABSCHNITT (Median, 10. / 90. Perzentil) — konstanz = Anteil innerhalb {KONST_GRAD:.0f}° der eigenen Hauptrichtung")
    for k in ("echt", "brett_fahren", "aussortiert", "land", "gehen", "brett_gehen", "jan_gehen", "auto", "jan_auto"):
        if k not in G:
            continue
        f = np.array([z[5] for z in G[k]])
        print(f"  {k:13s} n={len(f):5d}  " + "  ".join(
            f"{n} {np.median(f[:, i]):5.2f} ({np.percentile(f[:, i], 10):5.2f}-{np.percentile(f[:, i], 90):5.2f})"
            for i, n in enumerate(namen)))
    print(f"\nje {FENSTER_S}-s-FENSTER (Median, 10. / 90. Perzentil)")
    for k in ("echt", "brett_fahren", "aussortiert", "land", "gehen", "brett_gehen", "jan_gehen", "auto", "jan_auto"):
        if k not in G:
            continue
        f = np.array([w for z in G[k] for w in z[6]])
        if not len(f):
            continue
        print(f"  {k:13s} n={len(f):6d}  " + "  ".join(
            f"{n} {np.median(f[:, i]):5.2f} ({np.percentile(f[:, i], 10):5.2f}-{np.percentile(f[:, i], 90):5.2f})"
            for i, n in enumerate(namen)))


if __name__ == "__main__":
    main()
