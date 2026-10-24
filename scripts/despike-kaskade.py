#!/usr/bin/env python3
"""Despike-Kaskade in analysis/gps.clean_speed_series (Regel 3) — REIN LESEND (24.10.2026).

Regel 3 vergleicht mit dem schon BEREINIGTEN linken Nachbarn: springt das Tempo um > SPIKE_JUMP auf > SPIKE_ABS_MIN
und bleibt oben, wird der ganze Abschnitt heruntergezogen. Zaehlt je Session, wie viele Sekunden heute anders sind als
mit dem ROHEN linken Nachbarn (gedachte Korrektur), und die groessten Abschnitte.

    cd server && DATABASE_URL=... .venv/bin/python ../scripts/despike-kaskade.py [--n 2000]
"""
import argparse, sys, logging
import numpy as np
sys.path.insert(0, ".")


def regel3_roh(speed, jump, absmin):
    out = speed.copy(); n = speed.size
    for i in range(n):
        prev = speed[i - 1] if i > 0 else speed[i + 1]
        nxt = speed[i + 1] if i < n - 1 else speed[i - 1]
        ref = min(prev, nxt)
        if speed[i] > ref + jump and speed[i] > absmin:
            out[i] = ref
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=2000); a = ap.parse_args()
    logging.disable(logging.WARNING)
    from app import models, storage
    from app.analysis import gps as G
    from app.db import SessionLocal
    db = SessionLocal()
    treffer = []
    geprueft = 0
    try:
        q = (db.query(models.Session).filter(models.Session.status == "analyzed", models.Session.deleted.isnot(True))
             .order_by(models.Session.id.desc()).limit(a.n))
        for s in q:
            g = storage.load_gps(s.session_uuid)
            if len(g) < 30:
                continue
            geprueft += 1
            sp = np.array([x[3] if len(x) > 3 and x[3] is not None else np.nan for x in g], float)
            if np.isnan(sp).all():
                continue
            sp = np.nan_to_num(sp)
            # Regel 1+2 wie im Original, dann Regel 3 einmal heute, einmal mit rohem Nachbarn
            heute = G.clean_speed_series(sp, 1)
            # gleiche Kette, nur Regel 3 ersetzt: Unterschied heute vs. Regel-3-roh nur dort, wo die Kaskade wirkt
            orig = G.clean_speed_series.__wrapped__ if hasattr(G.clean_speed_series, "__wrapped__") else None
            # Nachbau: Regel 1+2
            x = sp.copy()
            over = x > G.GLITCH_SPEED_MPS
            if over.any():
                x = np.where(over, G._running_median(np.where(over, 0.0, x), 15), x)
            mb = G._running_median(x, G.BURST_MEDIAN_WIN_S)
            b = (x > mb + G.BURST_MARGIN_MPS) & (x > G.BURST_ABS_MIN_MPS)
            x = np.where(b, mb, x)
            r3 = regel3_roh(x, G.SPIKE_JUMP_MPS, G.SPIKE_ABS_MIN_MPS)
            m5 = G._running_median(r3, 5)
            r4 = np.where(np.abs(r3 - m5) > G.SPEED_SPIKE_MPS, m5, r3)
            diff = np.abs(r4 - heute) > 2.0
            n_diff = int(diff.sum())
            if n_diff >= 5:
                treffer.append((n_diff, s.id, s.sport_class, (s.device_model or "Garmin").split(" ·")[0],
                                round(float(np.max(r4[diff])) * 3.6, 1), round(float(np.max(heute)) * 3.6, 1)))
    finally:
        db.rollback(); db.close()
    treffer.sort(reverse=True)
    print(f"{geprueft} Sessions geprueft, {len(treffer)} mit >= 5 s Unterschied")
    for t in treffer[:30]:
        print("  Sek", t[0], "#", t[1], t[2], t[3], "km/h korrigiert max", t[4], "heute max", t[5])


if __name__ == "__main__":
    main()
