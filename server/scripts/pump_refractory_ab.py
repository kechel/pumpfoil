"""Read-only A/B: Pump-Zahl ohne vs. mit Jump-Refraktaerzeit (nach jedem Aufsprung-Impuls
keine Pump-Zaehlung fuer REFR Sekunden). Zeigt, wie viele (Fehl-)Pumps rund um Aufspruenge
wegfallen. python -m scripts.pump_refractory_ab"""
import numpy as np
from app.db import SessionLocal
from app import models, storage
from app.analysis.gps import analyze_gps
from app.analysis.foil_model import detect_jumps, predict_foiling_mask
from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND
from app.ml import pumps

REFR = 1.5  # s

def counts(session):
    accel = np.asarray(storage.load_accel(session.session_uuid)); gps = storage.load_gps(session.session_uuid)
    if accel is None or accel.shape[0] == 0 or not gps:
        return None
    fs = float(session.accel_hz)
    mask = predict_foiling_mask(gps, accel, fs, session.accel_scale)
    jumps_ms = detect_jumps(accel, fs, session.accel_scale)
    res = analyze_gps(gps, gps_hz=session.gps_hz, mask_override=mask, impulse_times_ms=jumps_ms, water_rings=None)
    vs = bandpass_fft(vertical_against_gravity(accel, session.accel_scale, fs), fs, *FILTER_BAND)
    jt = np.asarray(jumps_ms, dtype=float)
    base = kept = 0
    for sg in res.get("segments") or []:
        a0 = max(int(round(sg["t_start_ms"] / 1000 * fs)), 0)
        a1 = min(int(round(sg["t_end_ms"] / 1000 * fs)), vs.size)
        if a1 <= a0:
            continue
        idx = pumps.find_pumps_local(vs[a0:a1], fs)
        tms = (a0 + idx) / fs * 1000.0
        base += tms.size
        if jt.size:
            near = np.any((tms[:, None] >= jt[None, :]) & (tms[:, None] <= jt[None, :] + REFR * 1000.0), axis=1)
            kept += int((~near).sum())
        else:
            kept += tms.size
    return base, kept

def main():
    db = SessionLocal()
    rows = []
    for s in db.query(models.Session).order_by(models.Session.id).all():
        ar = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
        if not ar or ar.detection != "model":
            continue
        try:
            r = counts(s)
        except Exception as e:  # noqa: BLE001
            print(f"#{s.id} FEHLER: {e}"); continue
        if r:
            rows.append((s.id, s.user_id, r[0], r[1]))
    tb = sum(r[2] for r in rows); tk = sum(r[3] for r in rows)
    print(f"\nRefraktaer {REFR}s | {len(rows)} Sessions | Pumps {tb} -> {tk}  ({(tk/tb-1)*100:+.1f}%, {tb-tk} entfernt)")
    print("\n=== meiste entfernte Pumps (Aufsprung-Naehe) ===")
    for sid, uid, b, k in sorted(rows, key=lambda r: -(r[2] - r[3]))[:18]:
        print(f"  #{sid} u{uid}: {b} -> {k}  (-{b-k})  https://pumpfoil.org/sessions/{sid}")
    print("\n=== Glide/Aufsprung-Testfaelle ===")
    for sid in (427, 432, 433):
        rr = [r for r in rows if r[0] == sid]
        if rr: print(f"  #{sid}: {rr[0][2]} -> {rr[0][3]}")
    db.close()

if __name__ == "__main__":
    main()
