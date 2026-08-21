#!/usr/bin/env python3
"""Prueft den Session-Export (GPX + FIT) durch RUECKIMPORT — rein lesend.

Aufruf (aus server/, damit .env/DB gefunden werden):
    .venv/bin/python ../scripts/export-check.py [session_id ...]

Ohne Argumente werden Sessions verschiedener Bauart selbst gesucht (mit/ohne Puls, mit Trim,
mit aussortierten Bereichen, GPS-only). Fuer jede wird die Datei erzeugt und wieder gelesen:
GPX mit dem XML-Parser, FIT mit fitparse (derselbe Leser, mit dem wir fremde FIT-Dateien
importieren). Verglichen werden Punktzahl, Zeitachse, Koordinaten, Puls und Strecke — der Test
glaubt dem Encoder nichts, sondern rechnet nach.
"""
from __future__ import annotations

import io
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import timezone
from pathlib import Path

HIER = Path(__file__).resolve().parent
SERVER = HIER.parent / "server"
sys.path.insert(0, str(SERVER))

# .env manuell parsen (siehe CLAUDE.md: `set -a; . ./.env` exportiert DATABASE_URL nicht zuverlaessig)
env_txt = (SERVER / ".env").read_text() if (SERVER / ".env").exists() else ""
for k, v in re.findall(r"^([A-Z0-9_]+)=(.*)$", env_txt, re.M):
    os.environ.setdefault(k, v.strip().strip('"').strip("'"))

import numpy as np                                    # noqa: E402
import fitparse                                       # noqa: E402
from app import export_track, models                  # noqa: E402
from app.analysis.timebase import build_timebase_for_session   # noqa: E402
from app.db import SessionLocal                       # noqa: E402
from app.fitimport import _SEMI_TO_DEG                # noqa: E402

GPX_NS = {"g": "http://www.topografix.com/GPX/1/1",
          "tpx": "http://www.garmin.com/xmlschemas/TrackPointExtension/v1",
          "pf": "https://pumpfoil.org/xmlschemas/track/v1"}

fehler: list[str] = []


def pruefe(bedingung: bool, text: str) -> None:
    if not bedingung:
        fehler.append(text)
    print(("   ok   " if bedingung else "  FEHLT ") + text)


def eine(db, s) -> None:
    tb = build_timebase_for_session(s, accel=np.empty((0, 3), dtype=np.int16))
    pts = export_track.punkte(tb.gps, s.started_at)
    print(f"\n#{s.id} {s.started_at} sport={s.sport} trim=({s.trim_start_ms},{s.trim_end_ms}) "
          f"gps_roh={len(tb.gps)} punkte={len(pts)}")
    if not pts:
        print("   (keine GPS-Punkte — uebersprungen)")
        return
    mit_hr = sum(1 for p in pts if p.hr is not None)
    segmente = sum(1 for p in pts if p.neu)
    print(f"   Puls-Punkte={mit_hr} Segmente={segmente} Strecke={pts[-1].dist_m:.0f} m")

    # ---- GPX ----
    gpx = export_track.gpx_bytes(s, pts)
    root = ET.fromstring(gpx)
    trkpts = root.findall(".//g:trkpt", GPX_NS)
    pruefe(len(trkpts) == len(pts), f"GPX Punktzahl {len(trkpts)} == {len(pts)}")
    pruefe(len(root.findall(".//g:trkseg", GPX_NS)) == segmente,
           f"GPX Segmente {len(root.findall('.//g:trkseg', GPX_NS))} == {segmente}")
    hr_gpx = len(root.findall(".//tpx:hr", GPX_NS))
    pruefe(hr_gpx == mit_hr, f"GPX Puls-Werte {hr_gpx} == {mit_hr}")
    d_lat = max(abs(float(e.get("lat")) - p.lat) for e, p in zip(trkpts, pts))
    d_lon = max(abs(float(e.get("lon")) - p.lon) for e, p in zip(trkpts, pts))
    pruefe(d_lat < 1e-6 and d_lon < 1e-6, f"GPX Koordinaten max. Abweichung {max(d_lat, d_lon):.2e} Grad")
    t_erst = trkpts[0].find("g:time", GPX_NS).text
    pruefe(t_erst.endswith("Z") and t_erst.startswith(pts[0].t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")),
           f"GPX erste Zeit {t_erst} passt zu {pts[0].t.astimezone(timezone.utc)}")

    # ---- FIT ----
    fit = export_track.fit_bytes(s, pts)
    ff = fitparse.FitFile(io.BytesIO(fit))
    recs = list(ff.get_messages("record"))
    erwartet = []
    letzte = None
    for p in pts:                      # dieselbe Sekunden-Entdopplung wie im Encoder
        sek = int(p.t.timestamp())
        if sek != letzte:
            erwartet.append(p); letzte = sek
    pruefe(len(recs) == len(erwartet), f"FIT record-Zahl {len(recs)} == {len(erwartet)}")
    fid = list(ff.get_messages("file_id"))
    pruefe(len(fid) == 1 and fid[0].get_value("type") == "activity", "FIT file_id = activity")
    pruefe(len(list(ff.get_messages("session"))) == 1, "FIT genau eine session-Message")
    pruefe(len(list(ff.get_messages("lap"))) == 1, "FIT genau eine lap-Message")
    pruefe(len(list(ff.get_messages("activity"))) == 1, "FIT genau eine activity-Message")
    ses = list(ff.get_messages("session"))[0]
    print(f"   FIT session: sport={ses.get_value('sport')} dist={ses.get_value('total_distance')} m "
          f"dauer={ses.get_value('total_elapsed_time')} s v_max={ses.get_value('max_speed')} m/s "
          f"hr_avg={ses.get_value('avg_heart_rate')}")
    d_lat = d_lon = 0.0
    hr_fit = 0
    for r, p in zip(recs, erwartet):
        la, lo = r.get_value("position_lat"), r.get_value("position_long")
        if la is not None:
            # fitparse gibt Positionen ROH in Semicircles zurueck (wie in app/fitimport.py) —
            # erst umrechnen, sonst vergleicht man Semicircles mit Grad.
            la *= _SEMI_TO_DEG; lo *= _SEMI_TO_DEG
            d_lat = max(d_lat, abs(la - p.lat)); d_lon = max(d_lon, abs(lo - p.lon))
        if r.get_value("heart_rate") is not None:
            hr_fit += 1
            if r.get_value("heart_rate") != p.hr:
                fehler.append(f"FIT Puls weicht ab: {r.get_value('heart_rate')} != {p.hr}")
    pruefe(d_lat < 1e-6 and d_lon < 1e-6, f"FIT Koordinaten max. Abweichung {max(d_lat, d_lon):.2e} Grad")
    pruefe(hr_fit == sum(1 for p in erwartet if p.hr is not None),
           f"FIT Puls-Werte {hr_fit} == {sum(1 for p in erwartet if p.hr is not None)}")
    t_fit = recs[0].get_value("timestamp").replace(tzinfo=timezone.utc)
    pruefe(abs((t_fit - pts[0].t).total_seconds()) < 1.0,
           f"FIT erste Zeit {t_fit} == {pts[0].t.astimezone(timezone.utc)}")
    dists = [r.get_value("distance") for r in recs if r.get_value("distance") is not None]
    pruefe(all(b >= a - 0.01 for a, b in zip(dists, dists[1:])), "FIT Strecke laeuft monoton")
    pruefe(abs(dists[-1] - pts[-1].dist_m) < 1.0,
           f"FIT Endstrecke {dists[-1]:.0f} m == {pts[-1].dist_m:.0f} m")
    print(f"   Dateigroessen: gpx={len(gpx)/1024:.0f} KiB  fit={len(fit)/1024:.0f} KiB")


def main() -> int:
    db = SessionLocal()
    S = models.Session
    ids = [int(a) for a in sys.argv[1:]]
    if ids:
        sessions = [db.get(S, i) for i in ids]
    else:
        sessions = []
        gesucht = [
            ("mit Trim", S.trim_start_ms.isnot(None)),
            ("mit Ausschluss", S.excluded_ranges.isnot(None)),
            ("fremder Sport", S.sport != "pumpfoil"),
            ("normal", S.trim_start_ms.is_(None)),
        ]
        for name, bed in gesucht:
            q = (db.query(S).filter(bed, S.deleted.isnot(True), S.status == "analyzed")
                 .order_by(S.id.desc()).limit(1).all())
            for s in q:
                if s.id not in [x.id for x in sessions]:
                    print(f"# ausgewaehlt ({name}): #{s.id}")
                    sessions.append(s)
    for s in filter(None, sessions):
        eine(db, s)
    print("\n" + ("ALLES GRUEN" if not fehler else f"{len(fehler)} PROBLEM(E):"))
    for f in fehler:
        print("  - " + f)
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
