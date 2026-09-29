#!/usr/bin/env python3
"""Erkennung v3: „Lauf geht langsam weiter" als Label. REIN LESEND, schreibt nur server/data/ml/v3/.

Anlass Guillaume (u350, 29.09.2026, Handy an der Brust): „die Laeufe sind zu kurz, es fehlt fast
die Haelfte" — belegt an #10339: nach dem Lauf-Ende pumpt er 12-20 s bei 5-10 km/h weiter, unsere
Schwelle schneidet am ersten Tal ab. Jan: „ich denke schon alle seine laeufe".

Regel je erkanntem Lauf, VORWAERTS und RUECKWAERTS erweitert:
  - Tempo im gleitenden 3-s-Mittel >= FORT_MIN_KMH,
  - nie laenger als STOPP_S unter STOPP_KMH (das waere ein echter Halt),
  - und die Beschleunigung zeigt Pumpbewegung (pump_rms >= PUMP_MIN, wie in merkmale.py).
Ergebnis: Zeitbereiche (Session-ms) je Session, getrennt nach „vorher" und „nachher".

`--pruefen` misst die Regel stattdessen an den Brett-Paaren: wie viele der Sekunden, die die Regel
an Uhr-Laeufe anhaengt, zeigen am BRETT wirklich Pumps (Wahrheit)?

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/fortsetzung_labels.py [--pruefen]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import json
import pathlib
import sys

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
ML = WURZEL / "server" / "data" / "ml"

FORT_MIN_KMH, STOPP_KMH, STOPP_S, PUMP_MIN = 4.0, 3.0, 2, 0.3
MENSCH = {350: "Guillaume 29.09.2026: Laeufe zu kurz, es fehlt fast die Haelfte (Handy Brust)"}


def fortsetzungen(t_s, v_kmh, pump, laeufe_s):
    """-> Liste (a, b, seite) in Sekunden: angehaengte Bereiche vor/nach jedem Lauf."""
    v3 = np.convolve(v_kmh, np.ones(3) / 3, mode="same")
    aus = []
    for a, b in laeufe_s:
        for seite, schritt in (("nachher", 1), ("vorher", -1)):
            # erste Sekunde AUSSERHALB des Laufs (vorwaerts: hinter dem Ende, rueckwaerts: vor dem Start)
            i = int(np.searchsorted(t_s, b, side="right")) if schritt > 0 else int(np.searchsorted(t_s, a)) - 1
            unten = 0; letzter_gut = None
            while 0 <= i < t_s.size:
                if any(x <= t_s[i] <= y for x, y in laeufe_s):     # anderer Lauf erreicht
                    break
                if v_kmh[i] < STOPP_KMH:
                    unten += 1
                    if unten > STOPP_S:
                        break
                else:
                    unten = 0
                if v3[i] < FORT_MIN_KMH:
                    break
                if pump[i] >= PUMP_MIN:
                    letzter_gut = i
                i += schritt
            if letzter_gut is not None:
                x, y = sorted((t_s[letzter_gut], b if schritt > 0 else a))
                if y - x >= 2:
                    aus.append((float(x), float(y), seite))
    return aus


def session_merkmale(S, sid):
    from app import models
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    s = S.get(models.Session, sid)
    tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": s.session_uuid, "accel_hz": s.accel_hz,
                                                     "accel_scale": s.accel_scale}))
    t, X = M.merkmale(tb)
    laeufe = [(x["t_start_session_ms"] / 1000, x["t_end_session_ms"] / 1000)
              for x in json.loads(s.result.segments_json or "[]")]
    return s, t / 1000, X[:, 0] * 3.6, X[:, M.NAMEN.index("pump_rms")], laeufe


def main():
    from app import db, models
    S = db.SessionLocal()
    try:
        if "--pruefen" in sys.argv:
            import brett_wahrheit as W
            paare = {(p["brett"], p["uhr"]): p for p in json.loads((ML / "v3" / "paare.json").read_text())}
            gute = [(9535, 9534), (9650, 9649), (10195, 10194), (10248, 10250), (10328, 10326), (10875, 10873)]
            ja = nein = 0
            for b_id, u_id in gute:
                B = W.brett(S, b_id); vers = paare[(b_id, u_id)]["versatz_ms"]
                s, t, v, pump, laeufe = session_merkmale(S, u_id)
                for a, b, seite in fortsetzungen(t, v, pump, laeufe):
                    sek = np.arange(a, b, 1.0) * 1000 + vers
                    bp = np.sort(B["pumps"])
                    for x in sek:
                        j = np.searchsorted(bp, x)
                        nah = min(abs(bp[j] - x) if j < bp.size else 1e9, abs(bp[j - 1] - x) if j > 0 else 1e9)
                        ja += nah <= 800; nein += nah > 800
                print(f"#{u_id} (u{s.user_id}): angehaengt {sum(b - a for a, b, _ in fortsetzungen(t, v, pump, laeufe)):.0f} s", flush=True)
            print(f"Regel an den Brett-Paaren: {ja + nein} angehaengte Sekunden, davon mit Brett-Pump in ±0,8 s: "
                  f"{ja} ({ja / max(ja + nein, 1):.0%})")
            return
        out = {"_meta": {"regel": f"Tempo 3-s-Mittel >= {FORT_MIN_KMH} km/h, nie > {STOPP_S} s unter "
                                  f"{STOPP_KMH} km/h, pump_rms >= {PUMP_MIN}", "quelle": MENSCH}, "sessions": {}}
        for uid in MENSCH:
            ids = [x.id for x in S.query(models.Session).filter(models.Session.user_id == uid,
                                                               models.Session.deleted.is_(False)).all()]
            for sid in ids:
                s, t, v, pump, laeufe = session_merkmale(S, sid)
                if s.result is None or s.result.detection != "model":
                    continue
                f = fortsetzungen(t, v, pump, laeufe)
                out["sessions"][str(sid)] = {"user": uid, "bereiche_ms": [[a * 1000, b * 1000, seite] for a, b, seite in f]}
                laenge = sum(b - a for a, b in laeufe)
                print(f"#{sid}: {len(laeufe)} Laeufe {laenge:.0f} s · angehaengt {sum(b - a for a, b, _ in f):.0f} s "
                      f"(vorher {sum(b - a for a, b, x in f if x == 'vorher'):.0f}, nachher {sum(b - a for a, b, x in f if x == 'nachher'):.0f})")
        (ML / "v3" / "labels_fortsetzung.json").write_text(json.dumps(out, indent=1))
    finally:
        S.rollback(); S.close()


if __name__ == "__main__":
    main()
