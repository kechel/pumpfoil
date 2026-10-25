#!/usr/bin/env python3
"""Front-Start-Erkennung aus der Beschleunigung (Prototyp, 25.10.2026) — REIN LESEND.

Anlass: u439 (Amazfit Active 2, Front-Start vom Steg), #12734: ~20 Startversuche, angezeigt 0. Die GPS-Spur (1 Hz)
sieht von einem Front-Start nur 1-3 Punkte ueber 8 km/h; die Beschleunigung zeigt ihn klar:
  Ruhe (Stehen am Steg, Huellkurve fast flach) -> 1,5-6 s Anlauf (Schritte mit Spitzen 4-10 g) -> wieder ruhig.
Einzelne Spitzen ohne Anlauf (Klopfen, Spritzer) sind kein Start.

`anlaeufe(mag, hz)` -> Liste (t_start_s, t_ende_s, spitzen, max_g). Reine Funktion, numpy.

    cd server && DATABASE_URL=... .venv/bin/python ../scripts/frontstart/anlauf.py 12734 3419
"""
import sys

import numpy as np

HUELLE_S = 0.5          # Fenster der gleitenden Streuung
AKTIV_G = 0.8           # Streuung darueber = Anlauf-Bewegung
RUHE_G = 0.25           # Streuung darunter = Stehen
LUECKE_S = 0.8          # kuerzere ruhige Stellen im Anlauf zusammenziehen
DAUER_S = (1.2, 8.0)    # ein Anlauf dauert so lange
SPITZE_G = 3.0          # Schritt-/Absprung-Spitzen
MIN_SPITZEN = 3
VORRUHE_S = 3.0         # davor so lange ruhig (Median der Streuung)
VORRUHE_G = 0.35


def _streuung(mag, n):
    k = np.ones(n) / n
    m = np.convolve(mag, k, "same")
    m2 = np.convolve(mag * mag, k, "same")
    return np.sqrt(np.maximum(m2 - m * m, 0.0))


def anlaeufe(mag: np.ndarray, hz: float) -> list[tuple[float, float, int, float]]:
    if mag.size < hz * 10:
        return []
    # Auf die Schwerkraft normieren: Garmin liefert ~1000 je g bei gespeichertem accel_scale 2048 (Betrag ~0,5),
    # Zepp ~2048 je g. Der Median des Betrags ist bei jeder Uhr ~1 g.
    mag = mag / max(float(np.median(mag)), 1e-6)
    s = _streuung(mag, max(int(HUELLE_S * hz), 3))
    aktiv = s > AKTIV_G
    # Abschnitte
    d = np.diff(np.r_[0, aktiv.astype(int), 0])
    an, ab = np.where(d == 1)[0], np.where(d == -1)[0]
    teile = []
    for a, b in zip(an, ab):
        if teile and (a - teile[-1][1]) < LUECKE_S * hz:
            teile[-1][1] = b
        else:
            teile.append([a, b])
    out = []
    for a, b in teile:
        dauer = (b - a) / hz
        if not DAUER_S[0] <= dauer <= DAUER_S[1]:
            continue
        seg = mag[a:b]
        sp = np.where((seg[1:-1] > seg[:-2]) & (seg[1:-1] >= seg[2:]) & (seg[1:-1] > SPITZE_G))[0]
        # Spitzen mind. 0,2 s auseinander (Schritte)
        n_sp, letzte = 0, -1e9
        for i in sp:
            if i - letzte >= 0.2 * hz:
                n_sp += 1; letzte = i
        if n_sp < MIN_SPITZEN:
            continue
        v0 = max(int(a - VORRUHE_S * hz), 0)
        if a - v0 < hz or float(np.median(s[v0:a])) > VORRUHE_G:
            continue
        out.append((a / hz, b / hz, n_sp, round(float(seg.max()), 1)))
    return out


def main():
    import logging
    sys.path.insert(0, ".")
    logging.disable(logging.WARNING)
    from app import models, storage
    from app.analysis.foil_model import magnitude_g
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        for sid in map(int, sys.argv[1:]):
            s = db.get(models.Session, sid)
            acc = storage.load_accel(s.session_uuid)
            t0 = storage.load_accel_t0(s.session_uuid)
            dauer = (max(t0.values()) / 1000.0) if t0 else 0
            hz = len(acc) / dauer if dauer else (s.accel_hz or 25)
            mag = magnitude_g(acc, s.accel_scale)
            g = np.array(storage.load_gps(s.session_uuid), float)
            tg, v = g[:, 0] / 1000, g[:, 3] * 3.6
            al = anlaeufe(mag, hz)
            print(f"== #{sid} {s.sport_class} hz {hz:.0f}: {len(al)} Anlaeufe")
            for a, b, n, mx in al:
                m = (tg >= a - 1) & (tg <= b + 5)
                vmax = float(v[m][v[m] < 40].max()) if (m & (v < 40)).any() else None
                print(f"   {a:7.1f}-{b:6.1f}s  {b - a:3.1f}s  Spitzen {n:2d}  max {mx:4.1f} g  GPS-Spitze danach "
                      f"{vmax if vmax is None else round(vmax, 1)} km/h")
    finally:
        db.rollback(); db.close()


if __name__ == "__main__":
    main()
