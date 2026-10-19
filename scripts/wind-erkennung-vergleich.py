#!/usr/bin/env python3
"""Wind-Erkennung (app/analysis/windlauf.py) gegen den gespeicherten Stand — rein LESEND.

Ruft NICHT run_analysis (das committet selbst), sondern analyze_session_v2 direkt: rechnet nur.
Je Wind-Session: Laeufe, Foil-Zeit, Foil-Strecke alt (analysis_results) gegen neu, dazu die
Schwellen-Quelle (Luecke/fest). Am Ende Mediane und die Faelle mit den groessten Aenderungen.

    cd server && OMP_NUM_THREADS=1 .venv/bin/python ../scripts/wind-erkennung-vergleich.py [--limit N] [--session ID]
"""
from __future__ import annotations

import argparse
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from app import models, storage  # noqa: E402
from app.analysis.detect_v2 import analyze_session_v2  # noqa: E402
from app.analysis.windlauf import schwellen, v2_parameter  # noqa: E402
from app.db import SessionLocal  # noqa: E402

WIND = ("wingfoil", "kitefoil", "parawing")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--session", type=int, default=0)
    a = ap.parse_args()
    db = SessionLocal()
    q = (db.query(models.Session, models.AnalysisResult)
         .join(models.AnalysisResult, models.AnalysisResult.session_id == models.Session.id)
         .filter(models.Session.sport_class.in_(WIND), models.Session.deleted.isnot(True)))
    if a.session:
        q = q.filter(models.Session.id == a.session)
    q = q.order_by(models.Session.id.desc())
    if a.limit:
        q = q.limit(a.limit)
    zeilen = []
    for s, ar in q.all():
        try:
            gps = storage.load_gps(s.session_uuid)
        except Exception:
            continue
        if not gps:
            continue
        lo = s.trim_start_ms if s.trim_start_ms is not None else gps[0][0]
        hi = s.trim_end_ms if s.trim_end_ms is not None else gps[-1][0]
        gps_t = [g for g in gps if lo <= g[0] <= hi]
        sw = schwellen(gps_t)
        try:
            neu = analyze_session_v2(s, judge_fremdkraft=False, **v2_parameter(sw))
        except Exception as e:  # noqa: BLE001
            print(f"#{s.id}: Fehler {type(e).__name__}: {e}")
            continue
        alt_segs = json.loads(ar.segments_json or "[]")
        zeilen.append({
            "id": s.id, "quelle": sw["quelle"], "start": sw["start_kmh"], "ende": sw["ende_kmh"],
            "alt_n": len(alt_segs), "neu_n": len(neu["segments"]),
            "alt_t": float(ar.foiling_time_s or 0), "neu_t": float(neu["foiling_time_s"] or 0),
            "alt_m": float(ar.foiling_distance_m or 0), "neu_m": float(neu["foiling_distance_m"] or 0),
            "gesamt_m": float(ar.total_distance_m or 0),
        })
    db.close()
    if not zeilen:
        print("keine Sessions"); return
    n = len(zeilen)
    luecke = [z for z in zeilen if z["quelle"] == "luecke"]
    print(f"{n} Wind-Sessions, Schwelle aus Luecke: {len(luecke)} ({len(luecke) / n:.0%}), sonst fest 12/8")
    if luecke:
        print(f"  Start-Schwelle Median {st.median(z['start'] for z in luecke):.1f} km/h, Ende Median "
              f"{st.median(z['ende'] for z in luecke):.1f} km/h")
    med = lambda k: st.median(z[k] for z in zeilen)  # noqa: E731
    print(f"Laeufe je Session   alt {med('alt_n'):.0f}  neu {med('neu_n'):.0f}")
    print(f"Foil-Zeit (min)     alt {med('alt_t') / 60:.1f}  neu {med('neu_t') / 60:.1f}")
    anteil = lambda k: st.median(z[k] / z["gesamt_m"] for z in zeilen if z["gesamt_m"] > 0)  # noqa: E731
    print(f"Foil-Strecke/gesamt alt {anteil('alt_m'):.0%}  neu {anteil('neu_m'):.0%}")
    verh = [z["neu_t"] / z["alt_t"] for z in zeilen if z["alt_t"] > 0]
    print(f"Foil-Zeit neu/alt: Median {st.median(verh):.2f}, p10 {sorted(verh)[len(verh) // 10]:.2f}, "
          f"p90 {sorted(verh)[(9 * len(verh)) // 10]:.2f}")
    print(f"weniger Laeufe: {sum(1 for z in zeilen if z['neu_n'] < z['alt_n']) / n:.0%}, "
          f"mehr: {sum(1 for z in zeilen if z['neu_n'] > z['alt_n']) / n:.0%}, "
          f"neu 0 Laeufe (alt > 0): {sum(1 for z in zeilen if z['neu_n'] == 0 and z['alt_n'] > 0)}")
    print("\ngroesste Aenderung der Foil-Zeit:")
    for z in sorted(zeilen, key=lambda z: -abs(z["neu_t"] - z["alt_t"]))[:10]:
        print(f"  #{z['id']}: {z['quelle']:6} {z['start']:.0f}/{z['ende']:.0f} km/h  Laeufe {z['alt_n']}->{z['neu_n']}  "
              f"Foil {z['alt_t'] / 60:.1f}->{z['neu_t'] / 60:.1f} min  {z['alt_m'] / 1000:.1f}->{z['neu_m'] / 1000:.1f} km "
              f"(gesamt {z['gesamt_m'] / 1000:.1f})")


if __name__ == "__main__":
    main()
