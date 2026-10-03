#!/usr/bin/env python3
"""Kuerzt das neue Modell die Laufenden? Uhr-Laufende (v2 / v3 / Variante) gegen das Brett. REIN LESEND.
Anlass (03.10.2026): echtes Gleiten liegt vor allem am Laufende, und genau dort endet der Uhr-Lauf oft
Sekunden vor dem Brett-Lauf. Vermutung: `teil` schneidet nach p — hoert der Arm auf zu pumpen, sinkt p.
Variante „ende": liegt das Ende des LETZTEN v3-Stuecks innerhalb eines v2-Laufs, gilt dessen Ende.
Brett-Laufende = gespeichertes Ende der Brett-Session (GPS-Heuristik, Tempo faellt ab = Aufsetzen).
Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/laufende_pruefen.py
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import json, pathlib, sys
import numpy as np
WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))


def ende_nicht_kuerzen(L, v2):
    """Rein: das jeweils LETZTE v3-Stueck in einem v2-Lauf bekommt dessen (spaeteres) Ende."""
    out = [list(x) for x in sorted(L)]
    for x, y in v2:
        drin = [k for k, (a, b) in enumerate(out) if x <= b <= y]
        if drin:
            k = max(drin, key=lambda i: out[i][1])
            if y > out[k][1] and not any(out[j][0] > out[k][1] and out[j][0] < y for j in range(len(out))):
                out[k][1] = y
    return [tuple(x) for x in out]


def main():
    from app.db import SessionLocal
    from app import models
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.detect_v2 import analyze_session_v2
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import nachbearbeitung as N, merkmale as M
    paare = [p for p in json.load(open(WURZEL / "server/data/ml/v3/paare.json")) if p["streuung_ms"] <= 400]
    db = SessionLocal()
    R = {"v2": [], "v3": [], "ende": []}
    for p in paare:
        s = db.get(models.Session, p["uhr"]); b = db.get(models.Session, p["brett"])
        bl = [(g["t_start_session_ms"] - p["versatz_ms"], g["t_end_session_ms"] - p["versatz_ms"])
              for g in json.loads(b.result.segments_json or "[]")]
        sens = getattr(db.get(models.User, s.user_id), "foil_sensitivity", None) or "normal"
        kw = dict(SENSITIVITY_PRESETS.get(sens) or {}) if sens != "normal" else {}
        v2s = analyze_session_v2(s, judge_fremdkraft=True, **kw)["segments"]
        v2 = [(g["t_start_session_ms"], g["t_end_session_ms"]) for g in v2s]
        tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": s.session_uuid, "accel_hz": s.accel_hz, "accel_scale": s.accel_scale}))
        tief = analyze_session_v2(s, judge_fremdkraft=True, **N.TIEF_KW)["segments"]
        L, _, _ = N.laeufe(tb, v2s, tief, sens, [])
        for name, laeufe in (("v2", v2), ("v3", L), ("ende", ende_nicht_kuerzen(L, v2))):
            for x, y in bl:                                      # je Brett-Lauf das passende Uhr-Ende
                kand = [(a, c) for a, c in laeufe if a < y and c > x]
                if kand:
                    R[name].append((max(c for _, c in kand) - y) / 1000.0)
        print(f"#{p['uhr']}/{p['brett']}: Brett-Laeufe {len(bl)}, v2 {len(v2)}, v3 {len(L)}", flush=True)
    db.close()
    print(f"\n{'':6} {'Laeufe':>6} {'Median':>7} {'Mittel':>7} {'Uhr endet >1,5 s frueher':>25} {'|Abw| <= 1,5 s':>15}")
    for name, d in R.items():
        d = np.array(d)
        print(f"{name:6} {d.size:6d} {np.median(d):+6.1f}s {d.mean():+6.1f}s {np.mean(d < -1.5) * 100:24.0f} % {np.mean(np.abs(d) <= 1.5) * 100:14.0f} %")


if __name__ == "__main__":
    main()
