"""Offline-Kalibrierung: Steg-Erkennung aus den Lauf-Startpunkten.

Clustert die Startpunkte aller Foiling-Segmente eines Nutzers robust (dichtester
Cluster = Steg) und sortiert Ausreißer-Starts aus (verfälschen die Kalibrierung nicht).
Dient zur Validierung der Foil-Erkennung ('Läufe starten am Steg') — NICHT Teil der Web-App.

Aufruf:  python scripts/calibrate_dock.py [user_email]
"""
from __future__ import annotations

import json
import sys

import numpy as np

from app.analysis.geo import haversine_m
from app.db import SessionLocal
from app import models

DOCK_RADIUS_M = 30.0  # Startpunkte innerhalb dieses Radius gelten als 'am Steg'


def main():
    email = sys.argv[1] if len(sys.argv) > 1 else None
    db = SessionLocal()
    q = db.query(models.Session)
    if email:
        u = db.query(models.User).filter_by(email=email).first()
        if not u:
            print(f"User {email} nicht gefunden"); return
        q = q.filter(models.Session.user_id == u.id)

    starts = []  # (lat, lon, session_id, seg_idx)
    for s in q.all():
        if not s.result or not s.result.track_geojson or not s.result.segments_json:
            continue
        coords = json.loads(s.result.track_geojson)["geometry"]["coordinates"]
        for k, seg in enumerate(json.loads(s.result.segments_json)):
            i = seg["i_start"]
            if 0 <= i < len(coords):
                lon, lat = coords[i]
                starts.append((lat, lon, s.id, k))
    if not starts:
        print("Keine Lauf-Startpunkte gefunden."); return

    lat = np.array([p[0] for p in starts]); lon = np.array([p[1] for p in starts])
    # Robust: der Punkt mit den meisten Nachbarn im Radius ist das Cluster-Zentrum.
    best_i, best_n = 0, -1
    for i in range(len(starts)):
        d = haversine_m(np.full_like(lat, lat[i]), np.full_like(lon, lon[i]), lat, lon)
        n = int((d <= DOCK_RADIUS_M).sum())
        if n > best_n:
            best_n, best_i = n, i
    d0 = haversine_m(np.full_like(lat, lat[best_i]), np.full_like(lon, lon[best_i]), lat, lon)
    inliers = d0 <= DOCK_RADIUS_M
    dock_lat, dock_lon = lat[inliers].mean(), lon[inliers].mean()  # verfeinertes Zentrum

    d = haversine_m(np.full_like(lat, dock_lat), np.full_like(lon, dock_lon), lat, lon)
    inl = d <= DOCK_RADIUS_M
    print(f"Läufe gesamt: {len(starts)}")
    print(f"Steg (Zentrum der Startpunkte): {dock_lat:.5f}, {dock_lon:.5f}")
    print(f"Am Steg gestartet: {int(inl.sum())}/{len(starts)} ({inl.mean()*100:.0f}%)")
    print(f"Ausreißer-Starts (>{DOCK_RADIUS_M:.0f} m vom Steg): {int((~inl).sum())}")
    for i in np.where(~inl)[0]:
        print(f"  - Session {starts[i][2]}, Lauf {starts[i][3]+1}: {d[i]:.0f} m vom Steg")
    db.close()


if __name__ == "__main__":
    main()
