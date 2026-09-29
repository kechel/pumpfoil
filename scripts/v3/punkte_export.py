#!/usr/bin/env python3
"""Erkennung v3: GPS-Punkte aller Sessions mit Beschleunigung exportieren — fuer die Wasser-
Zuordnung im Training (jrc_wasser.py laeuft in einem eigenen venv mit rasterio). REIN LESEND.
Schreibt server/data/ml/punkte.npz: lat, lon, t_ms, session (je Punkt)."""
import gzip, json, pathlib, sys
import numpy as np
WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
from app import storage  # noqa: E402
ML = WURZEL / "server" / "data" / "ml"
b = json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))
L, O, T, S = [], [], [], []
for s in b:
    if (s["accel_hz"] or 0) < 15 or s["detection"] in (None, "gps_only", "none") or not s.get("uuid"):
        continue
    try:
        g = np.asarray(storage.load_gps(s["uuid"]), dtype=float)
    except Exception:
        continue
    if g.ndim != 2 or len(g) == 0:
        continue
    L.append(g[:, 1]); O.append(g[:, 2]); T.append(g[:, 0]); S.append(np.full(len(g), s["id"], dtype=np.int32))
np.savez_compressed(ML / "punkte.npz", lat=np.concatenate(L), lon=np.concatenate(O),
                    t_ms=np.concatenate(T), session=np.concatenate(S))
print("Sessions", len(S), "Punkte", sum(len(x) for x in S))
