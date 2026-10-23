#!/usr/bin/env python3
"""Kontrolle hgb_7 (Puffer 5 s) gegen Wahrheiten, die NICHT im Training waren — heute gegen neu. REIN LESEND.

  A  Tap-Pumps (pump_truth, Konsens wie app/pumptruth.compare_takes, hier nur gelesen/aufgerufen)
  B  Label-Intervalle (labels: pump/glide) — Anteil pumpen/gleiten je Fenster
  C  Label-App-FITs (analyse/train_foil_status/*.fit): Pumps je Lap gegen run_pumps (Laps nach start_time dedupliziert)
  D  Laufende verlaengern (Brett-Paare, Fahrer heraus): Laufende = Ende einer anschliessenden Gleitphase (<= 5 s)
Fuer Sessions eines Trainingsfahrers wird das Modell OHNE diesen Fahrer benutzt (sonst Gesamtmodell).

Aufruf (aus server/): DATABASE_URL=... DETECTOR_V2=1 DETECTOR_V3=1 OMP_NUM_THREADS=1 nice \
    .venv/bin/python ../scripts/pumpgleit/kontrolle.py
Ausgabe: server/data/ml/pumpgleit/kontrolle.json + Tabellen auf stdout.
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import glob
import json
import logging
import pathlib
import pickle
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gemeinsam as G
import merkmale as M
import modell as MO
from heute import laden

PUFFER = 5.0
FITS = G.WURZEL / "analyse" / "train_foil_status"


# ------------------------------------------------------------------ Modelle

def modelle():
    """{fahrer: (clf-Wrapper, theta)} ohne den Fahrer, dazu None: Gesamtmodell aus modell_gesamt.pkl."""
    lag = json.loads((G.AUS / "heute.json").read_text())["lag_ms"]
    D = MO.datensatz(laden(), PUFFER)
    T = [d for d in D if d["train"]]
    alle = [n for n in M.NAMEN if n not in M.GRUPPEN["kreisel"]]
    out = {}
    for f in sorted({d["fahrer"] for d in T}):
        tr = [d for d in T if d["fahrer"] != f]
        X = np.vstack([d["X"][d["y"] >= 0] for d in tr]); y = np.concatenate([d["y"][d["y"] >= 0] for d in tr])
        g = np.concatenate([np.full((d["y"] >= 0).sum(), d["fahrer"]) for d in tr])
        mod = MO.Wrapper("hgb_7", alle).fit(X, y, MO.gewichte(y, g))
        th, _ = MO.theta_waehlen(mod, tr, PUFFER, lag)
        out[f] = (mod.predict_proba, th)
    with open(G.AUS / "modell_gesamt.pkl", "rb") as fh:
        ges = pickle.load(fh)
    out[None] = (lambda X: ges["clf"].predict_proba(X[:, ges["sp"]]), ges["theta"])
    return out, D, lag


def neu(MODS, user, U, laeufe):
    pp, th = MODS.get(user, MODS[None])
    S = M.signale(U)
    tw, X, li, puf = M.merkmale(S, laeufe, PUFFER)
    p = pp(X) if X.shape[0] else np.zeros((0, 3))
    return M.ableiten(tw, p, S, laeufe, PUFFER, theta=th), tw, p, th


# ------------------------------------------------------------------ A Taps

def offset_suchen(wahr, erk, halb_ms):
    best = (-1, 0.0)
    for off in np.arange(-halb_ms, halb_ms + 1, 20.0):
        t_, _, _, _ = G.zuordnen(wahr, erk, 250.0, off)
        if t_ > best[0]:
            best = (t_, off)
    return best[1]


def teil_a(db, MODS):
    from app import models
    from app.pumptruth import compare_takes
    P = models.PumpTruth
    gruppen = defaultdict(lambda: defaultdict(list))
    for r in db.query(P.session_id, P.run_idx, P.take, P.t_ms).all():
        gruppen[(r[0], r[1])][r[2]].append(float(r[3]))
    erg = []
    for (sid, run), takes in sorted(gruppen.items(), key=lambda x: (x[0][0], x[0][1] or -1)):
        cmp = compare_takes([{"take": k, "times_ms": v} for k, v in takes.items()])
        s0 = db.get(models.Session, sid)
        # Taps liegen auf der Zuschnitt-Basis (wie t_start_ms der Laeufe), nicht in Session-ms:
        # nachgesehen an #295/#354 (Taps 889-928 s bzw. 17-53 s = genau ein Lauf in t_start_ms).
        tr = float(s0.trim_start_ms or 0)
        kons = np.asarray(cmp["consensus_ms"], float) + tr
        cmp["window_ms"] = [x + tr for x in cmp["window_ms"]] if cmp.get("window_ms") else None
        if kons.size < 5:
            continue
        U = G.uhr_daten(db, sid)
        s = db.get(models.Session, sid)
        if U is None:
            erg.append({"session": sid, "lauf": run, "konsens": int(kons.size), "grund": "keine Accel/GPS-Daten",
                        "geloescht": bool(s.deleted) if s else None})
            continue
        laeufe = G.gespeicherte_laeufe(U)
        H = G.heute_pumps(U, laeufe)
        A, *_ = neu(MODS, U["user"], U, laeufe)
        lo, hi = cmp["window_ms"]
        eh = np.array([x for h in H for x in h["pump_ms"]]); en = np.array([x for a in A for x in a["pump_ms"]])
        halb = float(np.median(np.diff(kons))) / 2
        off = offset_suchen(kons, eh[(eh >= lo - 1000) & (eh <= hi + 1000)], halb)
        z = {"session": sid, "user": U["user"], "lauf": run, "takes": len(takes), "konsens": int(kons.size),
             "fs": U["fs"], "detection": U["detection"], "geloescht": bool(s.deleted), "offset_ms": off, "laeufe": []}
        # je gespeichertem Lauf, der das Fenster schneidet; Taps ausserhalb jedes Laufs extra
        in_lauf = np.zeros(kons.size, bool)
        for i, (a, b) in enumerate(laeufe):
            x0, x1 = max(a, lo), min(b, hi)
            if x1 - x0 < 2000:
                continue
            w = kons[(kons >= x0) & (kons <= x1)]
            in_lauf |= (kons >= x0) & (kons <= x1)
            zl = {"lauf": i, "dauer_s": round((x1 - x0) / 1000, 1), "taps": int(w.size)}
            for name, e in (("heute", eh), ("neu", en)):
                ee = e[(e >= x0 + off) & (e <= x1 + off)]
                for tol in (250, 400):
                    t_, v_, x_, _ = G.zuordnen(w, ee, float(tol), off)
                    zl[f"{name}_{tol}"] = [t_, v_, x_]
                zl[f"{name}_n"] = int(ee.size)
            z["laeufe"].append(zl)
        z["taps_ausserhalb_laeufe"] = int((~in_lauf).sum())
        erg.append(z)
    return erg


# ------------------------------------------------------------------ B Labels

def teil_b(db, MODS):
    from app import models
    L = models.Label
    erg = []
    for sid in sorted({r[0] for r in db.query(L.session_id).distinct()}):
        U = G.uhr_daten(db, sid)
        labs = db.query(L.label, L.t_start_ms, L.t_end_ms).filter(L.session_id == sid).all()
        if U is None:
            erg.append({"session": sid, "grund": "keine Accel/GPS", "n": len(labs)}); continue
        hz = U["accel_hz_measured"] or U["fs"]
        if hz < 8:
            erg.append({"session": sid, "grund": f"Accel {hz:.1f} Hz < 8", "n": len(labs), "user": U["user"]}); continue
        laeufe = G.gespeicherte_laeufe(U)
        H = G.heute_pumps(U, laeufe) if laeufe else []
        A, tw, p, th = neu(MODS, U["user"], U, laeufe) if laeufe else ([], np.zeros(0), np.zeros((0, 3)), 0.5)
        q = p[:, 1] / np.maximum(p[:, 1] + p[:, 2], 1e-9) if p.size else np.zeros(0)
        zust = np.where(p[:, 0] >= 0.5, 0, np.where(q >= th, 1, 2)) if p.size else np.zeros(0, int)
        gl_h = [g for h in H for g in h["gleit"]]
        gl_n = [g for a in A for g in a["gleit"]]
        for lab, s0, s1 in labs:
            t = np.arange(s0, s1, 250.0)
            imlauf = np.zeros(t.size, bool)
            for a, b in laeufe:
                imlauf |= (t >= a) & (t <= b)
            if tw.size:
                j = np.clip(np.searchsorted(tw, t), 1, tw.size - 1)
                j = np.where(np.abs(tw[j - 1] - t) < np.abs(tw[j] - t), j - 1, j)
                ok = np.abs(tw[j] - t) <= 130
                zz = zust[j]
            else:
                ok = np.zeros(t.size, bool); zz = np.zeros(t.size, int)
            erg.append({"session": sid, "user": U["user"], "fs": hz, "detection": U["detection"], "label": lab,
                        "dauer_s": round((s1 - s0) / 1000, 1), "anteil_im_lauf": round(float(imlauf.mean()), 3),
                        "neu_pumpen": round(float(np.mean(ok & (zz == 2))), 3),
                        "neu_gleiten": round(float(np.mean(ok & (zz == 1))), 3),
                        "neu_aus": round(float(np.mean(ok & (zz == 0))), 3),
                        "neu_gleitphasen_s": round(float(G.sekunden_maske(t, gl_n).mean()) * (s1 - s0) / 1000, 1),
                        "heute_gleitphasen_s": round(float(G.sekunden_maske(t, gl_h).mean()) * (s1 - s0) / 1000, 1),
                        "heute_pumps": int(sum(1 for h in H for x in h["pump_ms"] if s0 <= x <= s1)),
                        "neu_pumps": int(sum(1 for a in A for x in a["pump_ms"] if s0 <= x <= s1))})
    return erg


# ------------------------------------------------------------------ C FIT-Laps

def fit_uhr(pfad):
    import fitparse
    from app.fitimport import _accel_msg_time, accel_from_messages
    from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND
    fit = fitparse.FitFile(open(pfad, "rb").read())
    am, laps, rec = [], [], []
    for m in fit.get_messages():
        if m.name == "accelerometer_data":
            am.append({d.name: d.value for d in m})
        elif m.name == "lap":
            laps.append({d.name: d.value for d in m})
        elif m.name == "record":
            rec.append({d.name: d.value for d in m})
    b, hz = accel_from_messages(am)
    acc = np.frombuffer(b, dtype="<i2"); acc = acc[: (acc.size // 3) * 3].reshape(-1, 3)
    a0 = _accel_msg_time(am[0])
    a0 = a0.replace(tzinfo=None) if a0 is not None and a0.tzinfo is not None else a0
    hz = float(hz)
    t = np.arange(acc.shape[0]) / hz * 1000.0
    sc = 180.0 / 2 ** 31
    gps = []
    for r in rec:
        ts = r.get("timestamp")
        if ts is None or r.get("position_lat") is None:
            continue
        ts = ts.replace(tzinfo=None) if ts.tzinfo else ts
        sp = r.get("gps_speed") if r.get("gps_speed") is not None else r.get("enhanced_speed", r.get("speed"))
        gps.append([(ts - a0).total_seconds() * 1000.0, r["position_lat"] * sc, r["position_long"] * sc,
                    float(sp) if sp is not None else np.nan])
    # Lauf im Lap: der Label-App-Lap beginnt LANGE vor dem Lauf (Lap 2 von 23296854256: Lap ab 0 s,
    # foil_status 1 erst ab 1296 s fuer 44 s, run_duration 0:46). `start_time + run_duration` (so rechnet
    # server/scripts/pump_calibrate.py) traefe meist das Treiben VOR dem Lauf. Darum: laengstes
    # foil_status-Stueck im Lap (bis 5 s nach Lap-Ende), Laenge muss auf 5 s zu run_duration passen.
    rt = np.array([((r["timestamp"].replace(tzinfo=None) if r["timestamp"].tzinfo else r["timestamp"]) - a0).total_seconds() * 1000.0
                   for r in rec if r.get("timestamp") is not None])
    rf = np.array([1 if r.get("foil_status") else 0 for r in rec if r.get("timestamp") is not None])
    seen, runs, verworfen = set(), [], 0
    for lp in laps:
        rp, st = lp.get("run_pumps"), lp.get("start_time")
        dur = lp.get("run_duration")
        try:
            if isinstance(dur, str) and ":" in dur:
                sec = 0.0
                for part in dur.split(":"):
                    sec = sec * 60 + float(part)
                dur = sec
            else:
                dur = float(dur)
        except (TypeError, ValueError):
            dur = None
        if rp is None or st is None or not dur:
            continue
        st = st.replace(tzinfo=None) if st.tzinfo else st
        if (st, rp) in seen:
            continue
        seen.add((st, rp))
        a = (st - a0).total_seconds() * 1000.0
        e = a + float(lp.get("total_elapsed_time") or dur) * 1000.0 + 5000.0
        m = (rt >= a) & (rt < e)
        d = np.diff(np.concatenate([[0], rf[m], [0]]))
        an, ab = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
        if an.size == 0:
            verworfen += 1; continue
        k = int(np.argmax(ab - an))
        tt = rt[m]
        x0, x1 = tt[an[k]], tt[min(ab[k], tt.size - 1)]
        if abs((x1 - x0) / 1000.0 - dur) > 5:
            verworfen += 1; continue
        runs.append((x0, x1, int(rp)))
    U = {"id": pathlib.Path(pfad).name, "user": 2, "fs": hz, "lo": 0.0, "t": t, "acc": acc.astype(np.float32) / 2048.0,
         "vsig": bandpass_fft(vertical_against_gravity(acc, 2048, hz), hz, *FILTER_BAND),
         "echt": np.ones(t.size, bool), "gps": np.asarray(gps, float), "gyro": None}
    # Bei manchen Firmwares passt die Zeit der Accel-Nachricht nicht (Laeufe Tage daneben): dann Accel-Start
    # = erster Record (die Aufnahme startet beide gleichzeitig) — als Vermutung gekennzeichnet (a0_quelle).
    U["a0_quelle"] = "accel"
    if runs and not all(0 <= a and b <= t[-1] for a, b, _ in runs) and rt.size:
        r0 = next(r["timestamp"] for r in rec if r.get("timestamp") is not None)
        r0 = r0.replace(tzinfo=None) if r0.tzinfo else r0
        sh = (a0 - r0).total_seconds() * 1000.0
        runs = [(a + sh, b + sh, n) for a, b, n in runs]
        U["gps"][:, 0] += sh
        U["a0_quelle"] = "erster_record"
        runs = [x for x in runs if 0 <= x[0] and x[1] <= t[-1]]
    U["laps_verworfen"] = verworfen
    return U, sorted(runs)


def teil_c(MODS, db):
    """Label-App-FITs: analyse/train_foil_status (Jan, u2) + Original-FITs der importierten Sessions mit
    foil_status.json (server/data/fit-*/original.fit). Doppelte Aufnahmen ueber die Lap-Startzeiten weg."""
    from app import models
    erg, gesehen = [], set()
    dateien = [(f, 2) for f in sorted(glob.glob(str(FITS / "*.fit")))]
    for f in sorted(glob.glob(str(G.WURZEL / "server" / "data" / "fit-*" / "original.fit"))):
        d = pathlib.Path(f).parent
        if not (d / "foil_status.json").exists():
            continue
        s = db.query(models.Session).filter(models.Session.session_uuid == d.name).first()
        dateien.append((f, s.user_id if s is not None else None))
    for f, user in dateien:
        try:
            U, runs = fit_uhr(f)
        except Exception as e:      # kein Accel, kaputte Datei
            continue
        laeufe = [(a, b) for a, b, _ in runs]
        if not laeufe:
            continue
        key = (U["t"].size,) + tuple(round((b - a) / 1000) for a, b in laeufe)
        if key in gesehen:
            continue
        gesehen.add(key)
        U["id"] = pathlib.Path(f).parent.name if "fit-" in f else pathlib.Path(f).name
        U["user"] = user
        H = G.heute_pumps(U, laeufe)
        A, *_ = neu(MODS, user, U, laeufe)
        for (a, b, rp), h, n in zip(runs, H, A):
            erg.append({"fit": U["id"], "user": user, "a0": U["a0_quelle"], "verworfen_in_datei": U["laps_verworfen"], "dauer_s": round((b - a) / 1000, 1), "run_pumps": rp, "heute": h["pumps"],
                        "neu": int(sum(1 for x in n["pump_ms"] if a <= x <= b))})
    return erg


# ------------------------------------------------------------------ D Laufende

def teil_d(D, MODS):
    erg = defaultdict(lambda: {"vorher": [], "nachher": [], "verl": 0, "laeufe": 0, "falsch": 0, "ueber_s": 0.0,
                               "verl_s": [], "start": []})
    for d in [d for d in D if d["train"]]:
        P, laeufe, f = d["P"], d["laeufe"], d["fahrer"]
        pp, th = MODS[f]
        p = pp(d["X"])
        A = M.ableiten(d["tw"], p, d["S"], laeufe, PUFFER, theta=th)
        z = MO.lauf_zuordnung(P, laeufe)
        ok = [L for L in P["laeufe"] if L["ok"]]
        for L, ui in zip(ok, z):
            if ui is None:
                continue
            a, b = laeufe[ui]
            nxt = laeufe[ui + 1][0] if ui + 1 < len(laeufe) else np.inf
            ext, _ = M.laufende_verlaengern(A[ui], a, b, nxt, P["uhr"]["gps"], PUFFER)
            e = erg[f"u{f}"]
            e["laeufe"] += 1
            e["vorher"].append((b - L["aufsetzen"]) / 1000.0)
            e["nachher"].append((b + ext * 1000 - L["aufsetzen"]) / 1000.0)
            e["start"].append((a - L["start"]) / 1000.0)
            if ext > 0:
                e["verl"] += 1; e["verl_s"].append(ext)
                if b + ext * 1000 > L["aufsetzen"] + 1000:
                    e["falsch"] += 1
                    e["ueber_s"] += (b + ext * 1000 - max(b, L["aufsetzen"])) / 1000.0
    return erg


def main():
    logging.disable(logging.WARNING)
    MODS, D, lag = modelle()
    db = G.db_lesend()
    out = {}
    try:
        out["A"] = teil_a(db, MODS)
        out["B"] = teil_b(db, MODS)
        out["C"] = teil_c(MODS, db)
    finally:
        db.rollback(); db.close()
    dd = teil_d(D, MODS)
    out["D"] = {k: {kk: vv for kk, vv in v.items()} for k, v in dd.items()}
    (G.AUS / "kontrolle.json").write_text(json.dumps(out, indent=1, default=float))
    # --- Tabellen
    print("A Tap-Pumps (Konsens), je Lauf: Taps | heute T/V/X ±250 (±400) | neu T/V/X ±250 (±400)")
    for z in out["A"]:
        if "grund" in z:
            print(f" #{z['session']} Lauf {z['lauf']} Konsens {z['konsens']}: {z['grund']} (geloescht={z['geloescht']})"); continue
        print(f" #{z['session']} u{z['user']} Lauf {z['lauf']} Takes {z['takes']} Konsens {z['konsens']} {z['fs']:.0f} Hz "
              f"{z['detection']} geloescht={z['geloescht']} Versatz {z['offset_ms']:.0f} ms, Taps ausserhalb Laeufen {z['taps_ausserhalb_laeufe']}")
        for l in z["laeufe"]:
            print(f"    Lauf {l['lauf']} {l['dauer_s']} s Taps {l['taps']} | heute n={l['heute_n']} {l['heute_250']} ({l['heute_400']}) "
                  f"| neu n={l['neu_n']} {l['neu_250']} ({l['neu_400']})")
    print("\nB Label-Intervalle")
    for z in out["B"]:
        if "grund" in z:
            print(f" #{z['session']}: {z['grund']} ({z['n']} Labels)"); continue
        print(f" #{z['session']} u{z['user']} {z['fs']:.0f} Hz {z['detection']} {z['label']:5} {z['dauer_s']:6.1f} s im Lauf "
              f"{z['anteil_im_lauf']:.2f} | neu pumpen {z['neu_pumpen']:.2f} gleiten {z['neu_gleiten']:.2f} aus {z['neu_aus']:.2f} "
              f"Gleitphasen {z['neu_gleitphasen_s']} s | heute Gleitphasen {z['heute_gleitphasen_s']} s | Pumps {z['heute_pumps']} -> {z['neu_pumps']}")
    print("\nC Label-App-FITs, Pumps je Lap gegen run_pumps")
    C = out["C"]
    print(f" Dateien {len({c['fit'] for c in C})}, Fahrer {sorted({str(c['user']) for c in C})}")
    t = np.array([c["run_pumps"] for c in C], float)
    for name in ("heute", "neu"):
        o = np.array([c[name] or 0 for c in C], float)
        print(f" {name:5}: Laps {len(C)}, Summe {int(o.sum())} / Wahrheit {int(t.sum())} = {o.sum() / t.sum():.2f}, "
              f"MAE {np.mean(np.abs(o - t)):.1f} Pumps/Lap, rel. Fehler {np.mean(np.abs(o - t) / np.maximum(t, 1)):.1%}, "
              f"Bias {np.mean(o - t):+.1f}")
    for u in sorted({str(c["user"]) for c in C}):
        cc = [c for c in C if str(c["user"]) == u]
        t = np.array([c["run_pumps"] for c in cc], float)
        print(f"  u{u}: Laps {len(cc)}, Wahrheit {int(t.sum())}, heute {sum(c['heute'] or 0 for c in cc)} "
              f"(rel {np.mean([abs((c['heute'] or 0) - c['run_pumps']) / max(c['run_pumps'], 1) for c in cc]):.1%}), "
              f"neu {sum(c['neu'] for c in cc)} (rel {np.mean([abs(c['neu'] - c['run_pumps']) / max(c['run_pumps'], 1) for c in cc]):.1%})")
    print("\nD Laufende = Ende anschliessender Gleitphase (<= 5 s, GPS-Pruefung), Brett-Paare, Fahrer heraus")
    for k, e in sorted(out["D"].items()):
        v, n = np.array(e["vorher"]), np.array(e["nachher"])
        print(f" {k:5} Laeufe {e['laeufe']:3} verlaengert {e['verl']:3} (Median {np.median(e['verl_s']) if e['verl_s'] else 0:.1f} s) | "
              f"Ende-Aufsetzen vorher Median {np.median(v):+.1f} [MAE {np.mean(np.abs(v)):.2f}] nachher {np.median(n):+.1f} "
              f"[MAE {np.mean(np.abs(n)):.2f}] | ueber Aufsetzen+1 s hinaus: {e['falsch']} ({e['ueber_s']:.1f} s) | "
              f"Start-Brettstart Median {np.median(e['start']):+.1f}")


if __name__ == "__main__":
    main()
