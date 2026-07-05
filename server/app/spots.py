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
    """(name, source, water) für einen Punkt. Priorität (Locals benennen Spots nach dem ORT):
      1. Ortschaft (place=village/town/city) — z. B. „Immenstaad am Bodensee", „Vaires-sur-Marne"
      2. Ufer-Venue (leisure=sports_centre/marina/beach…) — falls kein Ort in Reichweite
      3. Gewässername
    Ort-zuerst ist auch am konsistentesten (die Venue-Abfrage ist flakiger). Gewässername kommt
    IMMER als Label (water) mit. name=None -> nichts gefunden/Fehler (Aufrufer kann später erneut)."""
    from .places import lookup_place_name, lookup_shore_name, lookup_water_name
    water = lookup_water_name(lat, lon)          # str | "" | None
    town = lookup_place_name(lat, lon)
    if town:
        return town, "town", (water or None)
    shore = lookup_shore_name(lat, lon)
    if shore:
        return shore, "venue", (water or None)
    if water:
        return water, "water", water
    return None, None, (water or None)


def rebuild_all(db, apply: bool = False):
    """Alle (nicht gelöschten) Sessions mit Track zu Spots clustern. apply=True schreibt
    spots-Tabelle + sessions.spot_id/place_name/place_water. Rückgabe: Report-Liste."""
    from . import models
    # Nur ECHTE Pumpfoil-Sessions mit On-Foil-Erkennung clustern (is_pumpfoil + num_runs>0) —
    # aussortierte (is_pumpfoil=False) bekommen keinen Spot.
    rows = (db.query(models.Session)
            .join(models.AnalysisResult, models.AnalysisResult.session_id == models.Session.id)
            .filter(models.Session.deleted.isnot(True), models.Session.place_lat.isnot(None),
                    models.Session.is_pumpfoil.is_(True),
                    models.AnalysisResult.num_runs > 0)
            .all())
    geoms = [g for g in (_session_geom(db, s) for s in rows) if g and g.points]
    all_pts = [p for g in geoms for p in g.points]
    lat0 = sorted(p[0] for p in all_pts)[len(all_pts) // 2]
    spots, assign = build_spots(geoms)
    report = [{"spot": sp.id, "n": len(sp.session_ids), "sessions": sp.session_ids} for sp in spots]
    n_multi = sum(1 for v in assign.values() if v is None)
    if apply:
        # SCHNELL: nur clustern + spot_id setzen, KEIN Geocoding (das macht name_pending_spots
        # separat, pro Spot committed). place_name bleibt vorerst wie es ist.
        db.query(models.Session).update({models.Session.spot_id: None})
        db.query(models.Spot).delete()
        db.flush()
        for sp in spots:
            row = models.Spot(name=None, lat=sp.rep[0], lon=sp.rep[1], poly_wkt=_m_to_wkt(sp.poly, lat0))
            db.add(row); db.flush()
            for sid in sp.session_ids:
                db.get(models.Session, sid).spot_id = row.id
        for sid, v in assign.items():
            if v is None:                      # ≥2 Spots -> kein Spot (später Gewässername)
                db.get(models.Session, sid).spot_id = None
        db.commit()
    return {"spots": len(spots), "multi_spot_sessions": n_multi, "detail": report}


def spot_name_by_id(db, sid) -> str | None:
    from . import models
    row = db.get(models.Spot, int(sid)) if str(sid).isdigit() else None
    return row.name if row else None


def spot_id_by_name(db, name: str) -> int | None:
    from . import models
    row = (db.query(models.Spot)
           .filter(models.Spot.name == name, models.Spot.merged_into.is_(None)).first())
    return row.id if row else None


def canon_spot_name(db, ref) -> str:
    """Kanonischer Spot-NAME aus id ODER Name (austauschbar). Kanonisch = Name (eindeutig),
    da bestehende Daten (Chat-Scopes, Homespot) namensbasiert sind -> keine Migration nötig.
    Unauflösbare id/Name werden unverändert zurückgegeben."""
    if ref is None:
        return ref
    ref = str(ref)
    if ref.isdigit():
        return spot_name_by_id(db, ref) or ref
    return ref


def _unique_name(db, name: str, exclude_id: int | None = None) -> str:
    """Macht einen Spot-Namen eindeutig (zwei echte Spots, gleicher Ort -> „X", „X 2" …),
    damit die String-basierte Gruppierung nicht zwei Spots verschmilzt."""
    from . import models
    base = name
    for i in range(1, 50):
        cand = base if i == 1 else f"{base} {i}"
        q = db.query(models.Spot).filter(models.Spot.name == cand, models.Spot.merged_into.is_(None))
        if exclude_id is not None:
            q = q.filter(models.Spot.id != exclude_id)
        if not db.query(q.exists()).scalar():
            return cand
    return base


def name_pending_spots(db, max_spots: int | None = None) -> dict:
    """Geocodet noch unbenannte Spots (name IS NULL) — pro Spot committed, fehlertolerant
    (name_for None -> bleibt offen, nächster Lauf erneut). Setzt Spot-Name + place_name/
    place_water aller Mitglieds-Sessions. Wiederholt aufrufbar (Overpass ist flaky)."""
    from . import models
    q = db.query(models.Spot).filter(models.Spot.name.is_(None), models.Spot.merged_into.is_(None))
    if max_spots:
        q = q.limit(max_spots)
    named = pending = 0
    for sp in q.all():
        name, src, water = name_for(sp.lat, sp.lon)
        if name is None:
            pending += 1
            continue
        sp.name, sp.name_source, sp.water_name = _unique_name(db, name, sp.id), src, water
        (db.query(models.Session).filter(models.Session.spot_id == sp.id)
         .update({models.Session.place_name: name, models.Session.place_water: water}))
        db.commit()
        named += 1
    return {"named": named, "still_pending": pending}


def assign_one(db, s):
    """Laufende Zuordnung einer EINZELNEN (neu analysierten) Session zu einem Spot.
    Setzt spot_id + place_name + place_water. Legt bei Bedarf einen neuen Spot an."""
    from . import models
    g = _session_geom(db, s)
    if g is None:
        return
    # Spot nur fuer echte Pumpfoil-Sessions mit On-Foil. Sonst: nur Name (kein Spot).
    r = s.result
    if not (s.is_pumpfoil and r and (r.num_runs or 0) > 0):
        name, src, water = name_for(*g.start)
        s.spot_id = None
        if name:
            s.place_name = name
            s.place_water = water
        db.commit()
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
        if name:
            name = _unique_name(db, name)
        sp = models.Spot(name=name, name_source=src, water_name=water,
                         lat=g.start[0], lon=g.start[1], poly_wkt=_m_to_wkt(new_m, lat0))
        db.add(sp); db.flush()
        s.spot_id = sp.id
        if name:
            s.place_name = name
        s.place_water = water
    db.commit()
