#!/usr/bin/env python3
"""Neubau Stufe A r7 (23.10.2026): Brett-Wahrheit je Uhr-Sekunde aus der NEUEN Paar-Liste. REIN LESEND.

Wie `brett_training.daten()` (Wahrheit pumpen/gleiten/aus aus dem Nicken des Brett-Handys, Versatz aus
`paare_ausrichten.py`), aber
  - ALLE Paare aus der Liste (Standard data/ml/v3/paare-2026-10-23.json) statt der Handliste GUTE,
  - jedes Paar mit Labels: Fahrer, Uhr-Geraet, App-Version, gemessene Accel-Rate, time_base, detection,
    Ausrichtung (Streuung, r je Lauf, Zahl der Laeufe) und eine QUALITAET daraus:
        gut      Streuung <= 400 ms, >= 2 ausgerichtete Laeufe, Median-r >= 0,35
        mittel   Streuung <= 1200 ms und Median-r >= 0,25 (auch nur 1 Lauf)
        schwach  sonst (Ausrichtung nicht belegt — Versatz kann um Sekunden falsch sein)
    und ein Gewicht je Qualitaet (gut 5 = bisheriges Brett-Gewicht, mittel 3, schwach 1).
  - `live_nutzbar`: die Uhr-Session laeuft live ueber das Modell (detection == model, Accel >= 8 Hz).
    Uhren unter 8 Hz (Wear OS u574 bis 1.2.37: 6,7-8,4 Hz) rechnet die Live-Erkennung als gps_only —
    sie koennen das Handgelenk-Modell weder trainieren noch nutzen.
  - Uhren ohne Accel (gps_only, z. B. u460 FR55 lite) stehen in der Paar-Liste, kommen hier nicht vor.
Je Uhr-Session nur EIN Paar (das mit der besten Ausrichtung): #10873 lag mit zwei Handys am Brett,
#12608 ebenso.

Ausgabe: data/ml/v3/r7/brett_r7.pkl (Liste von dicts, Format wie brett_training.daten() + Labels) und
eine Tabelle auf stdout.

Aufruf (aus server/): DATABASE_URL=... DETECTOR_V2=1 nice -n 15 .venv/bin/python ../scripts/v3/brett_daten_r7.py
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse
import json
import pathlib
import pickle
import sys

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
ML = WURZEL / "server" / "data" / "ml"
GEWICHT = {"gut": 5.0, "mittel": 3.0, "schwach": 1.0}


def qualitaet(p) -> str:
    r = p.get("r_je_lauf") or []
    rmed = float(np.median(r)) if r else 0.0
    st = p.get("streuung_ms")
    if st is None or p.get("versatz_ms") is None:
        return "schwach"
    if st <= 400 and len(r) >= 2 and rmed >= 0.35:
        return "gut"
    if st <= 1200 and rmed >= 0.25:
        return "mittel"
    return "schwach"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--paare", default=str(ML / "v3" / "paare-2026-10-23.json"))
    ap.add_argument("--aus", default=str(ML / "v3" / "r7" / "brett_r7.pkl"))
    a = ap.parse_args()
    import brett_wahrheit as W
    from brett_training import wahrheit
    from app import db, models
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    paare = [p for p in json.loads(pathlib.Path(a.paare).read_text()) if p.get("uhr_accel", True)]
    rang = {"gut": 0, "mittel": 1, "schwach": 2}
    beste = {}
    for p in paare:
        p["qualitaet"] = qualitaet(p)
        k = p["uhr"]
        if k not in beste or (rang[p["qualitaet"]], p.get("streuung_ms") or 1e9) < \
                (rang[beste[k]["qualitaet"]], beste[k].get("streuung_ms") or 1e9):
            beste[k] = p
    S = db.SessionLocal()
    out = []
    try:
        for p in sorted(beste.values(), key=lambda x: x["uhr"]):
            b_id, u_id, vers = p["brett"], p["uhr"], p["versatz_ms"]
            e = p.get("uhr_etiketten") or {}
            try:
                B = W.brett(S, b_id)
            except SystemExit as ex:
                print(f"#{b_id}: {ex}"); continue
            u = S.get(models.Session, u_id)
            tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": u.session_uuid, "accel_hz": u.accel_hz,
                                                             "accel_scale": u.accel_scale}))
            t = tb.t_gps_ms.astype(float)
            z = wahrheit(B, t + vers)
            drin = (t + vers >= B["t"][0]) & (t + vers <= B["t"][-1])
            r = p.get("r_je_lauf") or []
            d = {"paar": (b_id, u_id), "fahrer": u.user_id, "t": t[drin], "z": z[drin],
                 "qualitaet": p["qualitaet"], "gewicht": GEWICHT[p["qualitaet"]],
                 "streuung_ms": p.get("streuung_ms"), "r_median": round(float(np.median(r)), 2) if r else None,
                 "laeufe_ausgerichtet": len(r), "versatz_ms": vers,
                 "geraet": e.get("device_model") or "Garmin", "app_version": e.get("app_version"),
                 "accel_hz_measured": e.get("accel_hz_measured"), "time_base": e.get("time_base"),
                 "detection": e.get("detection"),
                 "live_nutzbar": e.get("detection") == "model"}
            out.append(d)
            zz = d["z"]
            print(f"#{b_id}+#{u_id} u{u.user_id:<4} {d['geraet'][:18]:18} {str(d['app_version']):7} "
                  f"{(d['accel_hz_measured'] or 0):6.1f} Hz {str(d['time_base'])[:13]:13} {str(d['detection']):8} "
                  f"Streuung {str(d['streuung_ms']):>5} r {d['r_median']} n {d['laeufe_ausgerichtet']:2} -> "
                  f"{d['qualitaet']:7} · {zz.size} s, pumpen {int((zz == 2).sum())} gleiten {int((zz == 1).sum())} "
                  f"aus {int((zz == 0).sum())}", flush=True)
    finally:
        S.rollback(); S.close()
    pathlib.Path(a.aus).parent.mkdir(parents=True, exist_ok=True)
    with open(a.aus, "wb") as f:
        pickle.dump(out, f)
    print("geschrieben:", a.aus, len(out), "Uhr-Sessions")


if __name__ == "__main__":
    main()
