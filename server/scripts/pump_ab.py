"""Read-only A/B: Pump-Zahl je Session bei k=0.6 vs k=0.45 (gleicher run_analysis-Pfad,
ohne DB-Schreiben). Nutzung: python -m scripts.pump_ab"""
import numpy as np
from app.db import SessionLocal
from app import models, storage
from app.analysis.gps import analyze_gps
from app.analysis.foil_model import detect_jumps, predict_foiling_mask
from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND
from app.ml import pumps


def pumps_for(session, k):
    gps = storage.load_gps(session.session_uuid)
    accel = storage.load_accel(session.session_uuid)
    if accel is None or accel.shape[0] == 0 or not gps:
        return None
    ts0, ts1 = session.trim_start_ms, session.trim_end_ms
    if (ts0 is not None or ts1 is not None) and gps:
        lo = ts0 if ts0 is not None else 0
        hi = ts1 if ts1 is not None else gps[-1][0]
        gps = [[s[0] - lo] + list(s[1:]) for s in gps if lo <= s[0] <= hi]
        a_lo = max(int(round(lo / 1000.0 * session.accel_hz)), 0)
        a_hi = min(int(round(hi / 1000.0 * session.accel_hz)), accel.shape[0])
        accel = accel[a_lo:a_hi] if a_hi > a_lo else accel[0:0]
    if accel.shape[0] == 0:
        return None
    fs = float(session.accel_hz)
    mask = predict_foiling_mask(gps, accel, fs, session.accel_scale)
    impulses = detect_jumps(accel, fs, session.accel_scale)
    res = analyze_gps(gps, gps_hz=session.gps_hz, mask_override=mask,
                      impulse_times_ms=impulses, water_rings=None)
    vsig = bandpass_fft(vertical_against_gravity(accel, session.accel_scale, fs), fs, *FILTER_BAND)
    total = 0
    for seg in res.get("segments") or []:
        a0 = max(int(round(seg["t_start_ms"] / 1000.0 * fs)), 0)
        a1 = min(int(round(seg["t_end_ms"] / 1000.0 * fs)), vsig.size)
        if a1 > a0:
            total += int(pumps.find_pumps_local(vsig[a0:a1], fs, k=k).size)
    return total


def main():
    db = SessionLocal()
    rows = []
    sessions = db.query(models.Session).order_by(models.Session.id).all()
    for s in sessions:
        try:
            b = pumps_for(s, 0.6)
            if b is None:
                continue
            n = pumps_for(s, 0.45)
        except Exception as e:  # noqa: BLE001
            print(f"#{s.id} FEHLER: {e}")
            continue
        rows.append((s.id, s.user_id, b, n))
    tb = sum(r[2] for r in rows)
    tn = sum(r[3] for r in rows)
    print(f"\nSessions: {len(rows)}   Summe Pumps k0.6={tb}  k0.45={tn}  ({(tn/tb-1)*100:+.1f}%)")
    print("\n=== groesste absolute Zunahme ===")
    for sid, uid, b, n in sorted(rows, key=lambda r: -(r[3] - r[2]))[:20]:
        pct = (n / b - 1) * 100 if b else 0
        print(f"  #{sid} u{uid}: {b} -> {n}  (+{n-b}, {pct:+.0f}%)  https://pumpfoil.org/sessions/{sid}")
    db.close()


if __name__ == "__main__":
    main()
