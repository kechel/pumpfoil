#!/usr/bin/env python3
"""Testaufnahmen der Wear-App ab 1.2.40 (Messweg nach Doku) auswerten — REIN LESEND.

Je Session: Uhr, App, Dauer, GPS-Quelle (`hs` = Health Services / `lm` = LocationManager) samt
Wechselgrund, Waechter-Eingriffe, GPS-Abdeckung (letzter Punkt / Dauer), groesste GPS-Luecke,
Accel-Modus und gemessene Rate. Anlass 07.10.2026: GPS brach auf Wear-Uhren nach Minuten ab
(u818 #13822, u574 #13051); die Testaufnahmen sollen zeigen, ob der neue Weg auf echten Uhren hält.

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/messweg-pruefen.py [--tage 14] [--ab-version 1.2.40]
"""
import argparse, json, logging, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "server"))
logging.disable(logging.WARNING)
from datetime import datetime, timedelta, timezone

from app import models, storage
from app.db import SessionLocal


def version_tuple(v):
    try:
        return tuple(int(x) for x in (v or "").split("."))
    except ValueError:
        return ()


ap = argparse.ArgumentParser()
ap.add_argument("--tage", type=int, default=14)
ap.add_argument("--ab-version", default="1.2.40")
a = ap.parse_args()
db = SessionLocal()
seit = datetime.now(timezone.utc) - timedelta(days=a.tage)
rows = (db.query(models.Session, models.DeviceToken)
        .join(models.DeviceToken, models.DeviceToken.id == models.Session.device_id)
        .filter(models.DeviceToken.platform == "wear", models.Session.started_at >= seit,
                models.Session.deleted.isnot(True))
        .order_by(models.Session.started_at).all())
print(f"{'Session':>8} {'Nutzer':>6} {'Uhr':22} {'App':7} {'min':>5} {'GPS':4} {'neu':>3} {'Abdeck.':>7} {'Luecke':>7} {'Accel':7} {'Hz':>6} Achse   Wechsel")
for s, d in rows:
    if version_tuple(s.app_version or d.app_version) < version_tuple(a.ab_version):
        continue
    mw = json.loads(s.messweg_json) if s.messweg_json else {}
    dauer = (s.ended_at - s.started_at).total_seconds() if s.ended_at and s.started_at else 0
    g = storage.load_gps(s.session_uuid)
    t = [p[0] / 1000 for p in g]
    abdeckung = f"{(t[-1] / dauer * 100):.0f} %" if t and dauer else "–"
    luecke = f"{max((b - x for x, b in zip(t, t[1:])), default=0):.0f} s" if len(t) > 1 else "–"
    m = json.loads(s.result.metrics_json or "{}") if s.result else {}
    hz = m.get("accel_hz_measured")
    print(f"#{s.id:>7} u{s.user_id:<5} {(d.label or '')[:22]:22} {(s.app_version or d.app_version or '')[:7]:7} "
          f"{dauer / 60:5.1f} {mw.get('gps', '?'):4} {mw.get('gps_neu', '–'):>3} {abdeckung:>7} {luecke:>7} "
          f"{mw.get('accel', '?'):7} {(f'{hz:.1f}' if hz else '–'):>6} {str(m.get('time_base') or '–')[:7]:7} {mw.get('gps_wechsel') or ''}")
db.close()
