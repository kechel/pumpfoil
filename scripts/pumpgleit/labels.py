#!/usr/bin/env python3
"""Schritt 1: Brett-Wahrheit (Brett-Regeln) auf die Uhr-Zeitachse legen. REIN LESEND.

Je Paar (beste Ausrichtung je Uhr-Session, scripts/v3/paare_ausrichten.py -> paare-2026-10-23.json):
  - Brett-Regeln je Brett-Lauf neu gerechnet (gemeinsam.je_lauf_erweitert = brett_regeln.je_lauf +
    Tiefpunkt je Zyklus); Gegenprobe: Pumps je Lauf muessen die gespeicherten treffen.
  - Pump-Ereignisse (tiefster Punkt + Gipfel), Gleitphasen (Anzeige-Regel 1,5-15 s), Laufstart,
    Laufende, Aufsetzen, Carve-Maske (Gieren am Brett >= 60 Grad in 2 s) — alles in Uhr-Session-ms.
  - Label je Uhr-Rasterpunkt: -1 unbekannt (ausserhalb der Brett-Aufnahme oder Lauf ohne Aussage),
    0 aus, 1 gleiten, 2 pumpen; Carve separat.
Ausgabe: server/data/ml/pumpgleit/paare/<uhr>.pkl (Labels + Uhr-Rohdaten), labels.json (Uebersicht).

Aufruf (aus server/): DATABASE_URL=... DETECTOR_V2=1 DETECTOR_V3=1 OMP_NUM_THREADS=1 nice \
    .venv/bin/python ../scripts/pumpgleit/labels.py
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import json
import logging
import pickle
import sys
import pathlib

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gemeinsam as G


def main():
    logging.disable(logging.WARNING)
    (G.AUS / "paare").mkdir(parents=True, exist_ok=True)
    db = G.db_lesend()
    uebersicht = []
    try:
        for p in G.paare_beste():
            b_id, u_id, vers = p["brett"], p["uhr"], float(p["versatz_ms"])
            B = G.brett_wahrheit(db, b_id)
            if not B["ok"]:
                print(f"#{b_id}: keine Brett-Lage ({B.get('grund')})", flush=True)
                continue
            U = G.uhr_daten(db, u_id)
            if U is None:
                print(f"#{u_id}: keine Uhr-Daten", flush=True)
                continue
            # Gegenprobe gegen die gespeicherten Brett-Pumps
            neu = [len(k["pumps"]) if k["ok"] else None for k in B["laeufe"]]
            gegen = sum(1 for x, y in zip(neu, B["gespeichert_pumps"]) if x is not None and x == y)
            nok = sum(1 for x in neu if x is not None)
            # auf die Uhr-Zeitachse
            tb = B["t"]
            tu = U["t"]
            j = np.clip(np.searchsorted(tb, tu + vers), 0, tb.size - 1)
            drin = (tu + vers >= tb[0]) & (tu + vers <= tb[-1])
            lab = np.where(drin, B["lab"][j], -1).astype(np.int8)
            carve_b = G.carve_maske(tb, B["gier_dps"])
            carve = drin & carve_b[j]
            gier_u = np.where(drin, B["gier_dps"][j], np.nan).astype(np.float32)
            laeufe = []
            for k in B["laeufe"]:
                a, td, e = k["start"] - vers, k["aufsetzen"] - vers, k["ende"] - vers
                if not k["ok"]:
                    lab[(tu >= a) & (tu <= e)] = -1
                laeufe.append({"ok": k["ok"], "start": a, "ende": e, "aufsetzen": td,
                               "aufsetzen_quelle": k["aufsetzen_quelle"],
                               "pumps_tief": [x["tief"] - vers for x in k["pumps"]],
                               "pumps_gipfel": [x["gipfel"] - vers for x in k["pumps"]],
                               "zyklen_ende": [x["folge"] - vers for x in k["pumps"]],
                               "hub": [x["hub"] for x in k["pumps"]],
                               "schwach_tief": [x["tief"] - vers for x in k["schwach"]],
                               "gleit": [[x - vers, y - vers] for x, y in k["gleit"]]})
            # Carve-Ereignisse in Laeufen (zusammenhaengend)
            in_lauf = np.zeros(tu.size, bool)
            for L in laeufe:
                if L["ok"]:
                    in_lauf |= (tu >= L["start"]) & (tu <= L["aufsetzen"])
            cm = carve & in_lauf
            n_carve = int(np.sum(np.diff(np.concatenate([[0], cm.astype(np.int8)])) == 1))
            meta = {"brett": b_id, "uhr": u_id, "user": U["user"], "versatz_ms": vers,
                    "qualitaet": p["qualitaet"], "streuung_ms": p.get("streuung_ms"),
                    "r_median": float(np.median(p["r_je_lauf"])) if p.get("r_je_lauf") else None,
                    "device_model": U["device_model"], "app_version": U["app_version"],
                    "accel_hz_measured": U["accel_hz_measured"], "fs": U["fs"], "time_base": U["time_base"],
                    "sport_class": U["sport_class"], "detection": U["detection"], "v3": U["v3"],
                    "gyro": U["gyro"] is not None,
                    "pump_timing_ok": bool((U["accel_hz_measured"] or U["fs"]) >= 15.0),
                    "gegenprobe_laeufe": f"{gegen}/{nok}"}
            ok_l = [L for L in laeufe if L["ok"]]
            zs = {"laeufe": len(laeufe), "laeufe_ok": len(ok_l),
                  "pumps": sum(len(L["pumps_tief"]) for L in ok_l),
                  "gleit_n": sum(len(L["gleit"]) for L in ok_l),
                  "gleit_s": round(sum(y - x for L in ok_l for x, y in L["gleit"]) / 1000.0, 1),
                  "foil_s": round(sum(L["aufsetzen"] - L["start"] for L in ok_l) / 1000.0, 1),
                  "carve_n": n_carve, "carve_s": round(float(cm.sum()) / U["fs"], 1)}
            meta.update(zs)
            with open(G.AUS / "paare" / f"{u_id}.pkl", "wb") as f:
                pickle.dump({"meta": meta, "laeufe": laeufe, "lab": lab, "carve": carve, "brett_gier": gier_u,
                             "uhr": U}, f)
            uebersicht.append(meta)
            print(f"#{b_id}+#{u_id} u{U['user']:<4} {U['device_model'][:16]:16} {U['fs']:5.1f} Hz "
                  f"{str(U['time_base'])[:12]:12} {p['qualitaet']:7} Gyro {meta['gyro']!s:5} | "
                  f"Laeufe {zs['laeufe_ok']}/{zs['laeufe']} Pumps {zs['pumps']} Gleit {zs['gleit_n']} "
                  f"({zs['gleit_s']} s) Foil {zs['foil_s']} s Carves {n_carve} ({zs['carve_s']} s) "
                  f"Gegenprobe {meta['gegenprobe_laeufe']}", flush=True)
    finally:
        db.rollback(); db.close()
    (G.AUS / "labels.json").write_text(json.dumps(uebersicht, indent=1))
    print("geschrieben:", G.AUS / "labels.json")


if __name__ == "__main__":
    main()
