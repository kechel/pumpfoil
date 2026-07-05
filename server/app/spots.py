"""Spot-Identität per räumlicher Track-Überlappung.

Ein Spot ist NICHT ein pro-Session geocodeter Name, sondern ein CLUSTER sich
überschneidender Foiling-Tracks: alle Sessions, deren (gepufferte) Strecken sich
berühren, sind derselbe Spot. Der Name hängt am Spot (einmal geocodet), nicht an
jeder Session.

Regeln (Jan):
- Puffer „selber Spot" ~1 km (SAME_SPOT_GAP_M) — 3 km auseinander = getrennt.
- Kürzeste Strecke zuerst clustern → kompakte Spots entstehen zuerst; lange Fahrten
  kommen zuletzt und sehen dann „≥2 Spots".
- Überschneidet eine Session ≥2 bestehende Spots → KEIN Spot, nur Gewässername
  (Bodensee-Traverser fährt an vielen Spots vorbei → „Bodensee").

Reine Geometrie/Engine — kein DB-Zugriff (aufrufbar für Dry-Run UND Apply).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from shapely import wkt as _wkt
from shapely.geometry import MultiPoint, Polygon
from shapely.ops import unary_union

SAME_SPOT_GAP_M = 1000.0          # Tracks näher als das = selber Spot
_BUF = SAME_SPOT_GAP_M / 2.0      # je Track puffern -> Summe = Gap-Toleranz


def _project(points, lat0):
    """(lat,lon) -> lokale Meter-Ebene (Equirectangular um lat0)."""
    k = math.cos(math.radians(lat0))
    return [(lon * 111320.0 * k, lat * 110540.0) for lat, lon in points]


@dataclass
class SessionGeom:
    sid: int
    points: list          # Foiling-(lat,lon)
    dist_m: float         # gefoilte Distanz (Sortierschlüssel: kürzeste zuerst)
    start: tuple          # (lat,lon) erster Foiling-Punkt (nah am Ufer, fürs Geocoden)


@dataclass
class Spot:
    id: int
    poly: object                       # shapely (gepuffert, akkumuliert) in Meter-Ebene
    session_ids: list = field(default_factory=list)
    rep: tuple = None                  # repräsentativer (lat,lon) fürs Geocoden (Ufer-Startpunkt)


def build_spots(sessions: list[SessionGeom]):
    """Clustert Sessions zu Spots. Rückgabe:
      spots: list[Spot]
      assign: {sid -> spot_id | None}   (None = ≥2 Spots überschnitten -> Gewässername)
    """
    if not sessions:
        return [], {}
    all_pts = [p for s in sessions for p in s.points] or [s.start for s in sessions]
    lat0 = sorted(p[0] for p in all_pts)[len(all_pts) // 2]

    def poly_of(s):
        xy = _project(s.points or [s.start], lat0)
        return MultiPoint(xy).convex_hull.buffer(_BUF)

    spots: list[Spot] = []
    assign: dict[int, int | None] = {}
    nid = 0
    for s in sorted(sessions, key=lambda s: s.dist_m):   # kürzeste zuerst
        p = poly_of(s)
        hits = [sp for sp in spots if sp.poly.intersects(p)]
        if len(hits) == 0:
            nid += 1
            spots.append(Spot(id=nid, poly=p, session_ids=[s.sid], rep=s.start))
            assign[s.sid] = nid
        elif len(hits) == 1:
            sp = hits[0]
            sp.poly = unary_union([sp.poly, p])
            sp.session_ids.append(s.sid)
            assign[s.sid] = sp.id
        else:                                            # ≥2 Spots -> Gewässername, kein Spot
            assign[s.sid] = None
    return spots, assign


# ------------------------------------------------------------------ DB-Anbindung ----
# Polygone werden als lat/lon-WKT (Koordinaten "lon lat", absolut/frame-unabhängig)
# gespeichert; für Überlappungs-Tests projizieren wir on-the-fly in eine Meter-Ebene.

def _poly_m(points, lat0):
    return MultiPoint(_project(points, lat0)).convex_hull.buffer(_BUF)


def _m_to_wkt(poly_m, lat0) -> str:
    k = math.cos(math.radians(lat0))
    return Polygon([(x / (111320.0 * k), y / 110540.0) for x, y in poly_m.exterior.coords]).wkt


def _wkt_to_m(wkt_str: str, lat0):
    p = _wkt.loads(wkt_str)
    k = math.cos(math.radians(lat0))
    return Polygon([(lon * 111320.0 * k, lat * 110540.0) for lon, lat in p.exterior.coords])


def _session_geom(db, s):
    """SessionGeom aus DB/Storage (Foiling-Punkte, Distanz, Startpunkt) oder None."""
    import json as _json
    from . import models, storage
    gps = storage.load_gps(s.session_uuid) or []
    if not gps:
        return None
    ar = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
    pts = []
    if ar and ar.segments_json:
        for seg in _json.loads(ar.segments_json):
            a, b = int(seg.get("i_start", 0)), int(seg.get("i_end", 0))
            pts += [(gps[i][1], gps[i][2]) for i in range(a, min(b + 1, len(gps)))]
    if not pts:
        pts = [(g[1], g[2]) for g in gps]
    dist = (ar.foiling_distance_m or 0) if ar else 0
    return SessionGeom(sid=s.id, points=pts, dist_m=dist, start=pts[0])


def name_for(lat, lon):
    """(name, source, water) für einen Punkt: Ufer-Venue bevorzugt, sonst Gewässer.
    name=None -> Geocode fehlgeschlagen ODER nichts gefunden (Aufrufer kann später erneut)."""
    from .places import lookup_shore_name, lookup_water_name
    shore = lookup_shore_name(lat, lon)
    water = lookup_water_name(lat, lon)          # str | "" | None
    if shore:
        return shore, "venue", (water or None)
    if water:
        return water, "water", water
    return None, None, None


def rebuild_all(db, apply: bool = False):
    """Alle (nicht gelöschten) Sessions mit Track zu Spots clustern. apply=True schreibt
    spots-Tabelle + sessions.spot_id/place_name/place_water. Rückgabe: Report-Liste."""
    from . import models
    rows = (db.query(models.Session)
            .filter(models.Session.deleted.isnot(True), models.Session.place_lat.isnot(None))
            .all())
    geoms = [g for g in (_session_geom(db, s) for s in rows) if g and g.points]
    all_pts = [p for g in geoms for p in g.points]
    lat0 = sorted(p[0] for p in all_pts)[len(all_pts) // 2]
    spots, assign = build_spots(geoms)
    start_of = {g.sid: g.start for g in geoms}
    report = []
    if apply:
        db.query(models.Session).update({models.Session.spot_id: None})
        db.query(models.Spot).delete()
        db.flush()
    spot_row = {}
    for sp in spots:
        rep = sp.rep
        name, src, water = name_for(*rep)
        report.append({"spot": sp.id, "n": len(sp.session_ids), "name": name, "source": src, "water": water,
                       "sessions": sp.session_ids})
        if apply:
            row = models.Spot(name=name, name_source=src, water_name=water, lat=rep[0], lon=rep[1],
                              poly_wkt=_m_to_wkt(sp.poly, lat0))
            db.add(row); db.flush()
            spot_row[sp.id] = row
            for sid in sp.session_ids:
                s = db.get(models.Session, sid)
                s.spot_id = row.id
                s.place_name = name if name is not None else s.place_name
                s.place_water = water
    if apply:
        for sid, v in assign.items():
            if v is None:  # ≥2 Spots -> nur Gewässer
                s = db.get(models.Session, sid)
                _, _, w = name_for(*start_of[sid])
                s.spot_id = None
                if w:
                    s.place_name = w
                    s.place_water = w
        db.commit()
    return report


def assign_one(db, s):
    """Laufende Zuordnung einer EINZELNEN (neu analysierten) Session zu einem Spot.
    Setzt spot_id + place_name + place_water. Legt bei Bedarf einen neuen Spot an."""
    from . import models
    g = _session_geom(db, s)
    if g is None:
        return
    lat0 = g.start[0]
    new_m = _poly_m(g.points or [g.start], lat0)
    cand = (db.query(models.Spot)
            .filter(models.Spot.merged_into.is_(None), models.Spot.lat.isnot(None),
                    models.Spot.lat.between(lat0 - 0.25, lat0 + 0.25),
                    models.Spot.poly_wkt.isnot(None)).all())
    hits = [sp for sp in cand if _wkt_to_m(sp.poly_wkt, lat0).intersects(new_m)]
    if len(hits) == 1:
        sp = hits[0]
        merged = unary_union([_wkt_to_m(sp.poly_wkt, lat0), new_m])
        sp.poly_wkt = _m_to_wkt(merged, lat0)
        s.spot_id = sp.id
        if sp.name:
            s.place_name = sp.name
        s.place_water = sp.water_name
    elif len(hits) >= 2:            # ≥2 Spots -> nur Gewässer, kein Spot
        _, _, w = name_for(*g.start)
        s.spot_id = None
        if w:
            s.place_name = w; s.place_water = w
    else:                          # neuer Spot
        name, src, water = name_for(*g.start)
        sp = models.Spot(name=name, name_source=src, water_name=water,
                         lat=g.start[0], lon=g.start[1], poly_wkt=_m_to_wkt(new_m, lat0))
        db.add(sp); db.flush()
        s.spot_id = sp.id
        if name:
            s.place_name = name
        s.place_water = water
    db.commit()
