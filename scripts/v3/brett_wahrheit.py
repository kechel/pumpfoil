#!/usr/bin/env python3
"""Erkennung v3, Schritt „Brett-Wahrheit": taugt das Handy am Brett als Wahrheit? REIN LESEND.

Aus der Lage des Bretts (`_lage_antwort`, dieselbe Rechnung wie die Brett-Ansicht) je Aufnahme:
  - Pump-Ereignisse: Gipfel des Nickens im Pump-Band (0,8-2,5 Hz), Mindesthoehe PUMP_MIN_DEG,
    Mindestabstand 0,4 s.
  - Zustand je Sekunde: pumpen (Pump-Gipfel in ±0,6 s) · gleiten (>= GLEIT_MPS schnell, kein
    Gipfel in ±1,5 s) · aus.
Zwei Aufnahmen DESSELBEN Bretts (zwei Handys) werden auf Zehntel ausgerichtet (Kreuzkorrelation
des Nickens) und verglichen: Pump fuer Pump und Sekunde fuer Sekunde. Stimmen sie ueberein, ist
die Brett-Wahrheit gut genug, um eine Uhr daran zu messen und zu trainieren.

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/brett_wahrheit.py 10874 10875
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import pathlib
import sys

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))

HZ = 25.0
PUMP_MIN_DEG = float(os.environ.get("PUMP_MIN_DEG", "3.0"))
GLEIT_MPS = 2.5


def bandpass(x, hz, lo, hi):
    X = np.fft.rfft(x - x.mean())
    f = np.fft.rfftfreq(x.size, 1 / hz)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n=x.size)


def brett(db, sid):
    """-> dict mit t (Session-ms, Raster HZ), pitch, pumps (Session-ms), v (je Raster-Punkt)."""
    from app import models, storage
    from app.api.sessions import _lage_antwort
    s = db.get(models.Session, sid)
    dauer = (s.ended_at - s.started_at).total_seconds() * 1000
    r = _lage_antwort(db, s, from_ms=0, to_ms=int(dauer), pad_s=0.0, hz=HZ)
    if not r.get("ok"):
        raise SystemExit(f"#{sid}: {r.get('grund')}")
    t = np.asarray(r["t_ms"], float)
    p = np.asarray(r["pitch_deg"], float)
    p = np.nan_to_num(p, nan=np.nanmedian(p))
    pb = bandpass(p, HZ, 0.8, 2.5)
    # Gipfel: lokales Maximum, Hoehe gegen die Taeler ringsum >= PUMP_MIN_DEG
    from scipy.signal import find_peaks
    idx, _ = find_peaks(pb, prominence=PUMP_MIN_DEG, distance=int(0.4 * HZ))
    g = np.asarray(storage.load_gps(s.session_uuid), float)
    v = np.interp(t, g[:, 0], np.nan_to_num(g[:, 3])) if len(g) else np.zeros_like(t)
    import json as _j
    laeufe = [(x["t_start_session_ms"], x["t_end_session_ms"])
              for x in _j.loads(s.result.segments_json or "[]")] if s.result else []
    return {"id": sid, "start": s.started_at.timestamp() * 1000, "t": t, "pitch": pb, "pumps": t[idx],
            "prom": _["prominences"], "v": v, "model": s.device_model, "laeufe": laeufe}


def zustand(b, sek):
    """Zustand je Sekunde (Session-ms-Raster `sek`): 2 pumpen, 1 gleiten, 0 aus."""
    z = np.zeros(sek.size, dtype=int)
    p = np.sort(b["pumps"])
    v = np.interp(sek, b["t"], b["v"])
    for i, s in enumerate(sek):
        j = np.searchsorted(p, s)
        nah = min(abs(p[j] - s) if j < p.size else 1e9, abs(p[j - 1] - s) if j > 0 else 1e9)
        if nah <= 600:
            z[i] = 2
        elif v[i] >= GLEIT_MPS and nah > 1500:
            z[i] = 1
    return z


def main():
    from app import db
    a_id, b_id = int(sys.argv[1]), int(sys.argv[2])
    S = db.SessionLocal()
    try:
        A, B = brett(S, a_id), brett(S, b_id)
    finally:
        S.rollback(); S.close()
    # Versatz: B auf A-Zeit. Grob aus den Startzeiten, fein aus der Kreuzkorrelation des Nickens
    # (Vorzeichen egal — vorn/hinten kann bei einem Handy verdreht sein).
    grob = B["start"] - A["start"]
    tA = A["t"]; pA = A["pitch"]
    pB = np.interp(tA, B["t"] + grob, B["pitch"], left=0, right=0)
    best = (0, 0.0)
    for lag in range(-int(5 * HZ), int(5 * HZ) + 1):
        q = np.roll(pB, lag)
        r = np.corrcoef(pA, q)[0, 1]
        if abs(r) > abs(best[1]):
            best = (lag, r)
    fein = best[0] / HZ * 1000
    versatz = grob - fein
    print(f"#{a_id} ({A['model']}) gegen #{b_id} ({B['model']}): Versatz {versatz / 1000:+.2f} s, "
          f"Nicken r = {best[1]:+.2f}{' (Vorzeichen verdreht)' if best[1] < 0 else ''}")
    pb_in_a = B["pumps"] + versatz
    lo, hi = max(tA[0], pb_in_a.min()), min(tA[-1], pb_in_a.max())
    # Nur in Laeufen vergleichen (Vereinigung der Lauf-Fenster beider Erkennungen, in A-Zeit):
    # Tragen, Anschieben, Stehen am Steg nicken auch — je nach Lage in der Tasche verschieden.
    fenster = list(A["laeufe"]) + [(a + versatz, b + versatz) for a, b in B["laeufe"]]
    def im_lauf(x):
        return np.array([any(a <= y <= b for a, b in fenster) for y in x], bool)
    print(f"Lauf-Fenster: A {len(A['laeufe'])}, B {len(B['laeufe'])}")
    pa = A["pumps"][(A["pumps"] >= lo) & (A["pumps"] <= hi)]
    pbb = pb_in_a[(pb_in_a >= lo) & (pb_in_a <= hi)]
    pa, pbb = pa[im_lauf(pa)], pbb[im_lauf(pbb)]
    # Pump-Zuordnung, gierig, ±250 ms
    benutzt = np.zeros(pbb.size, bool); treffer = 0; abst = []
    for x in pa:
        j = np.argmin(np.abs(pbb - x)) if pbb.size else None
        if j is not None and not benutzt[j] and abs(pbb[j] - x) <= 250:
            benutzt[j] = True; treffer += 1; abst.append(pbb[j] - x)
    print(f"Pumps: A {pa.size}, B {pbb.size}, gemeinsam {treffer} "
          f"({treffer / max(pa.size, 1):.0%} von A, {treffer / max(pbb.size, 1):.0%} von B), "
          f"Abstand Median {np.median(np.abs(abst)) if abst else 0:.0f} ms")
    sek = np.arange(lo, hi, 1000.0)
    zA = zustand(A, sek)
    Bv = dict(B, t=B["t"] + versatz, pumps=pb_in_a)
    zB = zustand(Bv, sek)
    namen = ["aus", "gleiten", "pumpen"]
    tab = np.zeros((3, 3), int)
    for x, y in zip(zA, zB):
        tab[x, y] += 1
    print("Zustand je Sekunde (Zeilen A, Spalten B):", "  ".join(f"{n:>8s}" for n in namen))
    for i, n in enumerate(namen):
        print(f"   {n:8s}", "  ".join(f"{v:8d}" for v in tab[i]))
    ueber = np.trace(tab) / tab.sum()
    auf = tab[1:, 1:].sum() / max(tab[1:, :].sum(), 1)
    print(f"Uebereinstimmung je Sekunde {ueber:.1%} · 'auf dem Foil' (gleiten+pumpen) von A auch bei B {auf:.1%}")


if __name__ == "__main__":
    main()
