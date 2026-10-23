#!/usr/bin/env python3
"""Erkennung v3: GPS-Punkte aller Sessions mit Beschleunigung exportieren — fuer die Wasser-
Zuordnung im Training (jrc_wasser.py laeuft in einem eigenen venv mit rasterio). REIN LESEND.
Schreibt server/data/ml/punkte.npz: lat, lon, t_ms, session (je Punkt).
Seit 23.10.2026 (Neubau r7): --baseline B --aus P [--ohne-ds DIR] — nur Sessions, die in DIR
(alter Datensatz) noch fehlen; Standard wie bisher."""
import argparse, gzip, json, pathlib, sys
import numpy as np
WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
from app import storage  # noqa: E402
ML = WURZEL / "server" / "data" / "ml"
ap = argparse.ArgumentParser()
ap.add_argument("--baseline", default="")
ap.add_argument("--aus", default=str(ML / "punkte.npz"))
ap.add_argument("--ohne-ds", dest="ohne_ds", default="")
a = ap.parse_args()
b = json.load(gzip.open(a.baseline or sorted(ML.glob("baseline-*.json.gz"))[-1]))
schon = {p.stem for p in pathlib.Path(a.ohne_ds).glob("*.npz")} if a.ohne_ds else set()
L, O, T, S = [], [], [], []
for s in b:
    if (s["accel_hz"] or 0) < 15 or s["detection"] in (None, "gps_only", "none") or not s.get("uuid"):
        continue
    if str(s["id"]) in schon:
        continue
    try:
        g = np.asarray(storage.load_gps(s["uuid"]), dtype=float)
    except Exception:
        continue
    if g.ndim != 2 or len(g) == 0:
        continue
    L.append(g[:, 1]); O.append(g[:, 2]); T.append(g[:, 0]); S.append(np.full(len(g), s["id"], dtype=np.int32))
np.savez_compressed(a.aus, lat=np.concatenate(L), lon=np.concatenate(O),
                    t_ms=np.concatenate(T), session=np.concatenate(S))
print("Sessions", len(S), "Punkte", sum(len(x) for x in S))
