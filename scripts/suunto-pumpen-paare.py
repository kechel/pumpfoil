"""Pump-Zaehler der Suunto-App (watch-suunto/quelle/pumpe.js) gegen die Brett-Wahrheit — rein lesend.

Jan, 17.10.2026: „teste das auch mit den bekannten Uhr- & Phone-on-Board-Sessions, damit das nicht
wieder nur auf meinen Daten trainiert ist, auch die Foilscoot-Session". Je Paar (Brett-Handy + Uhr
desselben Fahrers, server/data/ml/v3/paare.json, Ausrichtung <= 400 ms) und je Brett-Lauf:
  Brett  = Server-Zaehler (find_pumps_cadence) auf dem Brett-Handy — die Wahrheit (GROUND-TRUTH.md)
  Server = derselbe Zaehler auf der Uhr
  Suunto = der Uhr-Zaehler der SuuntoPlus-App auf der Uhr (50 Hz wie die Suunto)
Dazu die Zeitpunkte: wie weit liegt jeder Brett-Pump vom naechsten Suunto-Pump (inkl. Ausrichtungsfehler).

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/suunto-pumpen-paare.py [brett:uhr ...]
"""
import base64
import json
import os
import pathlib
import subprocess
import sys

import numpy as np

W = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(W / "server"))
sys.path.insert(0, str(W / "scripts" / "v3"))
HZ = 25.0
RAND_S = 10


def lade(db, sid):
    from app import models
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    s = db.get(models.Session, sid)
    tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": s.session_uuid, "accel_hz": s.accel_hz,
                                                      "accel_scale": s.accel_scale}))
    return {"id": sid, "t0": float(tb.window_start_ms), "r": M.raster(tb), "scale": tb.accel_scale or 2048,
            "laeufe": [(x["t_start_session_ms"], x["t_end_session_ms"])
                       for x in json.loads(s.result.segments_json or "[]")] if s.result else [],
            "model": s.device_model}


def stueck(d, a_ms, b_ms):
    i0 = int((a_ms - d["t0"]) / 1000 * HZ); i1 = int((b_ms - d["t0"]) / 1000 * HZ)
    if i0 < 0 or i1 > d["r"].shape[0] or i1 - i0 < 3 * HZ:
        return None
    return d["r"][i0:i1]


def server_pumps(r, scale, vor, nach):
    from app.ml.features import vertical_against_gravity, bandpass_fft, FILTER_BAND
    from app.ml.pumps import find_pumps_cadence
    v = bandpass_fft(vertical_against_gravity(r, scale, HZ), HZ, *FILTER_BAND)
    return (find_pumps_cadence(v[vor:len(v) - nach], HZ) + vor) / HZ


def main():
    from app.db import SessionLocal
    from paare_ausrichten import laden, ausrichten
    paare = json.loads((W / "server/data/ml/v3/paare.json").read_text())
    liste = [(p["brett"], p["uhr"], p.get("versatz_ms"), p.get("streuung_ms")) for p in paare]
    for x in sys.argv[1:]:
        b, u = map(int, x.split(":"))
        liste.append((b, u, None, None))
    db = SessionLocal()
    zeilen, auftraege, meta = [], [], {}
    for b, u, versatz, streuung in liste:
        nur_anzahl = False
        if versatz is None:   # nicht in paare.json: hier ausrichten (rein rechnend, nichts geschrieben)
            a = ausrichten(laden(db, b), laden(db, u))
            versatz, streuung = a.get("versatz_ms"), a.get("streuung_ms")
            if (versatz is None or (streuung or 0) > 400) and a.get("laeufe_partner"):
                # Feinausrichtung scheitert (z. B. Foil Scoot: Brett und Arm bewegen sich anders) —
                # die Lauf-Partner (Start/Ende je Lauf) reichen fuer die ANZAHL, nicht fuer Zeitpunkte.
                versatz, streuung, nur_anzahl = a["mittel_ms"], 0, True
        if versatz is None or streuung is None or streuung > 400:
            print(f"#{b}/#{u}: Ausrichtung unsicher (Streuung {streuung}), uebersprungen"); continue
        B, U = lade(db, b), lade(db, u)
        for k, (a_ms, e_ms) in enumerate(B["laeufe"]):
            rb = stueck(B, a_ms - RAND_S * 1000, e_ms + RAND_S * 1000)
            ru = stueck(U, a_ms - versatz - RAND_S * 1000, e_ms - versatz + RAND_S * 1000)
            if rb is None or ru is None:
                continue
            vor = int(RAND_S * HZ)
            tb = server_pumps(rb, B["scale"], vor, vor)
            tu = server_pumps(ru, U["scale"], vor, vor)
            key = f"{b}:{u}:{k}"
            meta[key] = (b, u, k, (e_ms - a_ms) / 1000, tb, tu, (U["model"] or "") + (" [nur Anzahl]" if nur_anzahl else ""), nur_anzahl)
            auftraege.append({"id": key, "hz": HZ, "scale": U["scale"],
                              "b64": base64.b64encode(np.round(ru).astype("<i2").tobytes()).decode()})
    db.close()
    out = subprocess.run(["node", str(W / "watch-suunto/test/pumpen-roh.mjs")], input=json.dumps(auftraege),
                         capture_output=True, text=True, cwd=W / "watch-suunto", check=True).stdout
    suunto = json.loads(out)
    summe = {"brett": 0, "server": 0, "suunto": 0}
    fehler = []
    print(f"{'Paar/Lauf':18} {'s':>5} {'Brett':>6} {'Server':>7} {'Suunto':>7}  Uhr")
    for key, (b, u, k, dauer, tb, tu, modell, nur_anzahl) in meta.items():
        lo, hi = RAND_S, RAND_S + dauer
        ts = np.array([t for t in suunto[key] if lo <= t < hi])
        summe["brett"] += len(tb); summe["server"] += len(tu); summe["suunto"] += len(ts)
        for t in ([] if nur_anzahl else tb):
            if ts.size:
                fehler.append(float(np.min(np.abs(ts - t))))
        print(f"#{b}/#{u} L{k:<3} {dauer:5.0f} {len(tb):6d} {len(tu):7d} {len(ts):7d}  {modell or ''}")
    f = np.array(fehler)
    print(f"\nSumme  Brett {summe['brett']}  Server-auf-Uhr {summe['server']}  Suunto-auf-Uhr {summe['suunto']}")
    print(f"Suunto/Brett {summe['suunto'] / max(1, summe['brett']):.3f}   Server/Brett {summe['server'] / max(1, summe['brett']):.3f}")
    if f.size:
        print(f"Zeitpunkte (Brett-Pump -> naechster Suunto-Pump): median {np.median(f):.3f} s, "
              f"p90 {np.percentile(f, 90):.3f} s, < 0,25 s: {np.mean(f < 0.25):.0%}")


if __name__ == "__main__":
    main()
