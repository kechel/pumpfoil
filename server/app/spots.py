"""Spot-Identität per räumlicher Track-Überlappung.

Ein Spot ist NICHT ein pro-Session geocodeter Name, sondern ein CLUSTER sich
überschneidender Foiling-Tracks: alle Sessions, deren (gepufferte) Strecken sich
berühren, sind derselbe Spot. Der Name hängt am Spot (einmal geocodet), nicht an
jeder Session.

Regeln (Jan):
- Puffer „selber Spot" ~1 km (SAME_SPOT_GAP_M) — 3 km auseinander = getrennt.
- Kürzeste Strecke zuerst clustern → kompakte Spots entstehen zuerst; lange Fahrten
  kommen zuletzt und sehen dann „≥2 Spots".
- Überschneidet eine Session ≥2 bestehende Spots → **der Startpunkt entscheidet** (Jan,
  2026-07-26): der Spot, in dem die Session STARTET, gewinnt — eine lange Fahrt von Tizzano
  Richtung Cala Longa gehört zu Tizzano. Erst wenn der Start in KEINEM der Spots liegt (echte
  Traverse, die irgendwo dazwischen losfährt), gibt es nur den Gewässernamen ohne Spot.

Reine Geometrie/Engine — kein DB-Zugriff (aufrufbar für Dry-Run UND Apply).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from shapely import wkt as _wkt
from shapely.geometry import MultiPoint, MultiPolygon, Polygon
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
    """Meter-Ebene -> lat/lon-WKT. Beherrscht auch MultiPolygon.

    Warum (Befund 24.08.): `unary_union` zweier Spot-Polygone liefert ein MultiPolygon, sobald sie
    sich NICHT beruehren — und genau das passiert beim Zusammenfuehren zweier Spots am selben Steg,
    deren Tracks in verschiedene Teile eines Sees fuehren (Loosdrecht/Tienhoven, 2,6 km zwischen den
    Polygonen). Vorher lief das in ein `AttributeError: 'MultiPolygon' object has no attribute
    'exterior'` — der Admin-Merge zweier disjunkter Spots war schlicht nie ausprobiert worden.
    Die Alternative, die konvexe Huelle zu nehmen, waere schlechter: sie wuerde den Zwischenraum
    mit einschliessen und beim naechsten Zuordnen fremde Spots verschlucken.
    """
    k = math.cos(math.radians(lat0))

    def zurueck(poly):
        return Polygon([(x / (111320.0 * k), y / 110540.0) for x, y in poly.exterior.coords])

    teile = list(getattr(poly_m, "geoms", [poly_m]))
    if len(teile) == 1:
        return zurueck(teile[0]).wkt
    return MultiPolygon([zurueck(t) for t in teile]).wkt


def _wkt_to_m(wkt_str: str, lat0):
    """lat/lon-WKT -> Meter-Ebene. Gegenstueck zu `_m_to_wkt`, ebenfalls MultiPolygon-faehig."""
    p = _wkt.loads(wkt_str)
    k = math.cos(math.radians(lat0))

    def hin(poly):
        return Polygon([(lon * 111320.0 * k, lat * 110540.0) for lon, lat in poly.exterior.coords])

    teile = list(getattr(p, "geoms", [p]))
    if len(teile) == 1:
        return hin(teile[0])
    return MultiPolygon([hin(t) for t in teile])


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
    # Overpass hat NICHTS geliefert (gesperrt/Timeout/wirklich nichts) -> Nominatim-Fallback
    # (gleiche Datenbasis OpenStreetMap, anderer Dienst). Ohne ihn blieben Spots dauerhaft
    # namenlos, solange Overpass diese VM aussperrt.
    from .places import lookup_place_nominatim
    ort, nm_water = lookup_place_nominatim(lat, lon)
    if ort:
        return ort, "town", (nm_water or None)
    if nm_water:
        return nm_water, "water", nm_water
    return None, None, None


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


def rename_spot_row(db, sp, new_name: str, source: str = "manual") -> str:
    """Spot umbenennen und den Namen überall mitziehen: `place_name` aller Sessions,
    Chat-Scope (`spot:<name>`) und Homespot-Einstellungen. Der NAME ist kanonisch (bestehende
    Daten sind namensbasiert), deshalb muss ein Rename immer alle drei Stellen anfassen.
    Kein Commit — der Aufrufer entscheidet."""
    from . import models
    old, new = sp.name, (new_name or "").strip()[:120]
    if not new or new == old:
        return old
    sp.name, sp.name_source = new, source
    (db.query(models.Session).filter(models.Session.spot_id == sp.id)
     .update({models.Session.place_name: new}))
    if old:
        old_scope, new_scope = f"spot:{old}", f"spot:{new}"
        db.query(models.ChatMessage).filter_by(scope=old_scope).update({models.ChatMessage.scope: new_scope})
        # ChatRoomState ist pro (user, scope) EINDEUTIG -> beim Umziehen können zwei Zeilen
        # desselben Nutzers zusammenfallen (er war in beiden Räumen). Dann zusammenführen:
        # weiter gelesen gewinnt, „verlassen" nur wenn beide verlassen sind, Push wenn eines an.
        keep = {r.user_id: r for r in db.query(models.ChatRoomState).filter_by(scope=new_scope).all()}
        for r in db.query(models.ChatRoomState).filter_by(scope=old_scope).all():
            tgt = keep.get(r.user_id)
            if tgt is None:
                r.scope = new_scope
                keep[r.user_id] = r
                continue
            tgt.last_read_id = max(tgt.last_read_id or 0, r.last_read_id or 0)
            tgt.left = bool(tgt.left and r.left)
            tgt.push = bool(tgt.push or r.push)
            db.delete(r)
        db.flush()
        import json as _json
        for u in db.query(models.User).filter(models.User.settings_json.isnot(None)).all():
            try:
                st = _json.loads(u.settings_json)
            except ValueError:
                continue
            if st.get("homespot") == old:
                st["homespot"] = new
                u.settings_json = _json.dumps(st)
    return new


def dubletten_zusammenfuehren(db, apply: bool = False) -> dict:
    """Spots, die naeher als DUBLETTE_M beieinander liegen, sind Dubletten -> zusammenfuehren.

    Eigener Durchgang, NICHT im Polygon-Pfad von `repair`: dort haengen Spots ueber die
    gepufferten Tracks bis zu einem Kilometer weit zusammen (SAME_SPOT_GAP_M), und dann wuerde
    die Suffix-Toleranz unten neun "Helsinki"-Spots ueber ~4 km verschmelzen. Hier zaehlt
    ausschliesslich der Abstand der Spot-Koordinaten.

    Zusammengefuehrt wird, wenn hoechstens EIN Spot der Gruppe Sessions hat (die anderen sind
    Waisen) ODER alle besetzten denselben Namensstamm tragen ("Kołczewo" == "Kołczewo 4", s.
    `namensstamm`). Verschiedene ECHTE Namen auf demselben Punkt bleiben eine inhaltliche
    Entscheidung -> `needs_review` (Beispiele: "Tizzano" <-> "Cala Longa", 7 m;
    "Neckarsteinach" <-> "Neuhof", 0 m — gegenueberliegende Neckarseiten).

    Ziel der Zusammenfuehrung ist der Spot mit den meisten Sessions, bei Gleichstand der
    benannte, sonst der aeltere. `apply=False` = Trockenlauf, schreibt nichts.
    """
    from . import models
    rep: dict = {"merged": [], "needs_review": [], "applied": apply}
    spots = (db.query(models.Spot)
             .filter(models.Spot.merged_into.is_(None), models.Spot.lat.isnot(None),
                     models.Spot.lon.isnot(None)).all())
    counts = {sp.id: _session_count(db, sp.id) for sp in spots}
    # Einfachverkettung: A-B und B-C nah -> eine Gruppe (die Dubletten-Ketten aus dem
    # Anlege-Wettlauf liegen sowieso alle auf demselben Punkt).
    eltern = {sp.id: sp.id for sp in spots}

    def wurzel(i):
        while eltern[i] != i:
            eltern[i] = eltern[eltern[i]]
            i = eltern[i]
        return i

    # Zwei Naehe-Begriffe, beide zaehlen (s. `steg_punkt`): Spot-Koordinate (Polygonmitte) UND
    # Steg (Mittel der Session-Startpunkte). Der zweite faengt die Faelle, in denen dieselbe
    # Startstelle in verschiedene Teile eines Gewaessers fuehrt.
    stege = {sp.id: steg_punkt(db, sp.id) for sp in spots}
    for i, a in enumerate(spots):
        for b in spots[i + 1:]:
            if abs((a.lat or 0) - (b.lat or 0)) > 0.05:
                continue
            nah = _nah(a, b)
            if not nah:
                pa, pb = stege.get(a.id), stege.get(b.id)
                nah = (pa is not None and pb is not None
                       and abstand_m(pa[0], pa[1], pb[0], pb[1]) <= DUBLETTE_M)
            if nah:
                ra, rb = wurzel(a.id), wurzel(b.id)
                if ra != rb:
                    eltern[ra] = rb
    gruppen: dict[int, list] = {}
    for sp in spots:
        gruppen.setdefault(wurzel(sp.id), []).append(sp)

    for grp in gruppen.values():
        if len(grp) < 2:
            continue
        grp.sort(key=lambda x: (-counts.get(x.id, 0), x.name is None, x.id))
        target, sources = grp[0], grp[1:]
        besetzt = [x for x in grp if counts.get(x.id, 0) > 0]
        stamme = {namensstamm(x.name) for x in besetzt if x.name}
        eintrag = {"into": target.id, "into_name": target.name,
                   "abstand_max_m": round(max(abstand_m(a.lat, a.lon, b.lat, b.lon)
                                              for a in grp for b in grp), 1),
                   "from": [{"id": x.id, "name": x.name, "sessions": counts.get(x.id, 0)}
                            for x in sources]}
        if len(besetzt) > 1 and len(stamme) > 1:
            rep["needs_review"].append(eintrag)
            continue
        rep["merged"].append(eintrag)
        if apply:
            _merge_spot_rows(db, target, sources, target.lat)
    if apply:
        db.commit()
    return rep


def repair(db, apply: bool = False, reassign_limit: int = 100) -> dict:
    """Spot-Daten generisch heilen (wiederholbar, `apply=False` = Dry-Run).

    Vier Klassen von Altlasten, die die laufende Zuordnung blockieren:
      0. **Dubletten auf derselben Koordinate** (unter DUBLETTE_M) aus dem Anlege-Wettlauf
         mehrerer Worker -> `dubletten_zusammenfuehren`.
      1. **Waisen-Spots** ohne aktive Session (Reste von Renn-/Löschsituationen). Überlappen sie
         einen echten Spot, werden sie dorthin gemerged, sonst entfernt.
      2. **Überlappende Spots** — zwei Zeilen für denselben Ort. Werden zusammengeführt
         (meiste Sessions gewinnt, Name/Gewässer werden übernommen).
      3. **Sessions ohne Spot**, die einen bekommen müssten (`is_pumpfoil`, Läufe > 0, Track da).
         Nach 1.+2. greift `assign_one` wieder normal.

    NICHT angetastet wird die bewusste Regel „Track überschneidet ≥2 ECHTE (disjunkte) Spots ->
    nur Gewässername" — Traversen über mehrere Spots bleiben ohne Spot.
    """
    from . import models
    rep: dict = {"orphans_merged": [], "orphans_deleted": [], "overlaps_merged": [],
                 "needs_review": [], "sessions_reassigned": [], "sessions_still_without_spot": 0,
                 "applied": apply}
    # --- 0. Dubletten auf derselben Koordinate (Anlege-Wettlauf) ---------------------
    # Vor allem anderen, damit der Polygon-Pfad unten schon auf bereinigten Zeilen arbeitet.
    rep["dubletten"] = dubletten_zusammenfuehren(db, apply=apply)
    spots = (db.query(models.Spot)
             .filter(models.Spot.merged_into.is_(None), models.Spot.lat.isnot(None),
                     models.Spot.poly_wkt.isnot(None)).all())
    counts = {sp.id: _session_count(db, sp.id) for sp in spots}

    # --- 1./2. Überlappungen auflösen (Waisen bevorzugt als Quelle) -------------------
    done: set[int] = set()
    for sp in spots:
        if sp.id in done or sp.merged_into is not None:
            continue
        lat0 = sp.lat
        try:
            base = _wkt_to_m(sp.poly_wkt, lat0)
        except Exception:  # noqa: BLE001
            continue
        group = [sp]
        for other in spots:
            if other.id in done or other.id == sp.id or other.merged_into is not None:
                continue
            if abs((other.lat or 0) - lat0) > 0.25:
                continue
            try:
                if base.intersects(_wkt_to_m(other.poly_wkt, lat0)):
                    group.append(other)
            except Exception:  # noqa: BLE001
                continue
        if len(group) == 1:
            continue
        group.sort(key=lambda x: (-counts.get(x.id, 0), x.name is None, x.id))
        target, sources = group[0], group[1:]
        for x in group:
            done.add(x.id)
        entry = {"into": target.id, "into_name": target.name,
                 "from": [{"id": x.id, "name": x.name, "sessions": counts.get(x.id, 0)} for x in sources]}
        if not _auto_mergeable(db, group):
            # Mehrere echte Spots mit Sessions und verschiedenen Namen -> Mensch entscheidet.
            rep["needs_review"].append(entry)
            continue
        if all(counts.get(x.id, 0) == 0 for x in sources):
            rep["orphans_merged"].append(entry)
        else:
            rep["overlaps_merged"].append(entry)
        if apply:
            _merge_spot_rows(db, target, sources, lat0)
    if apply:
        db.commit()

    # --- 1b. Waisen ohne Überlappungspartner: weg damit ------------------------------
    for sp in spots:
        if sp.merged_into is not None or sp.id in done or counts.get(sp.id, 0) > 0:
            continue
        rep["orphans_deleted"].append({"id": sp.id, "name": sp.name})
        if apply:
            db.delete(sp)
    if apply:
        db.commit()

    # --- 3. Sessions ohne Spot erneut zuordnen ---------------------------------------
    rows = (db.query(models.Session)
            .join(models.AnalysisResult, models.AnalysisResult.session_id == models.Session.id)
            .filter(models.Session.deleted.isnot(True), models.Session.spot_id.is_(None),
                    models.Session.place_lat.isnot(None), models.Session.is_pumpfoil.is_(True),
                    models.AnalysisResult.num_runs > 0)
            .order_by(models.Session.id.desc()).limit(reassign_limit).all())
    for s in rows:
        if not apply:
            rep["sessions_reassigned"].append({"session": s.id, "spot": None})
            continue
        try:
            assign_one(db, s)
        except Exception as e:  # noqa: BLE001
            rep.setdefault("errors", []).append(f"session {s.id}: {e}")
            db.rollback()
            continue
        if s.spot_id:
            rep["sessions_reassigned"].append({"session": s.id, "spot": s.spot_id,
                                               "place": s.place_name})
        else:
            rep["sessions_still_without_spot"] += 1
    # --- 4. Zähler-Suffixe aufräumen -------------------------------------------------
    # Nach dem Mergen bleiben Namen wie „Bachern 2" übrig, obwohl es kein „Bachern" mehr gibt
    # (der Suffix kam von `_unique_name`, als die Dublette noch existierte). Nur einstellige
    # Zähler 2…9 anfassen — sonst würde „Bremerhavener Ruderverein v. 1889" verstümmelt.
    active = (db.query(models.Spot).filter(models.Spot.merged_into.is_(None)).all())
    taken = {(x.name or "").strip() for x in active}
    for sp in active:
        m = re.match(r"^(.+) ([2-9])$", (sp.name or "").strip())
        if not m or m.group(1) in taken:
            continue
        base = m.group(1)
        rep.setdefault("renamed", []).append({"id": sp.id, "from": sp.name, "to": base,
                                              "sessions": _session_count(db, sp.id)})
        if apply:
            rename_spot_row(db, sp, base, source=sp.name_source or "town")
        # `taken` AUCH im Trockenlauf mitfuehren, sonst zeigt er mehr an, als der Apply tut:
        # nach dem Merge wollen z. B. "Utrecht 3" UND "Utrecht 4" beide "Utrecht" heissen —
        # mit apply gewinnt der erste und der zweite bleibt, im Trockenlauf standen beide drin.
        # Namens-Eindeutigkeit ist nirgends per Constraint gesichert, die Liste hier ist der
        # einzige Schutz.
        taken.discard((sp.name or "").strip())
        taken.add(base)
    if apply and rep.get("renamed"):
        db.commit()

    # --- 5. Namenlose Spots nachbenennen ---------------------------------------------
    # Overpass ist flaky: schlug die Abfrage beim Anlegen fehl, blieb der Spot (und damit die
    # place_name aller seiner Sessions) für immer leer — es gab bisher keinen Wiederholungspfad.
    if apply:
        rep["naming"] = name_pending_spots(db)
    else:
        rep["naming"] = {"pending": (db.query(models.Spot)
                                     .filter(models.Spot.name.is_(None),
                                             models.Spot.merged_into.is_(None)).count())}

    # Gesamtzahl (unabhängig vom Limit) — damit man sieht, ob ein weiterer Lauf nötig ist.
    total_missing = (db.query(models.Session)
                     .join(models.AnalysisResult, models.AnalysisResult.session_id == models.Session.id)
                     .filter(models.Session.deleted.isnot(True), models.Session.spot_id.is_(None),
                             models.Session.place_lat.isnot(None), models.Session.is_pumpfoil.is_(True),
                             models.AnalysisResult.num_runs > 0).count())
    rep["sessions_without_spot_total"] = total_missing
    if not apply:
        rep["sessions_without_spot_candidates"] = len(rows)
    return rep


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
        if name is None and (sp.area_name or "").strip():
            # Letzter Rueckfall: die Ortslage. `name_for` verlangt Ortschaft/Venue/Gewaesser —
            # ein Bezirk oder County faellt dort durch, und der Spot bleibt fuer immer namenlos
            # (Befund 26.08.: Spot 339 "Haines Borough" seit 17.08., Spot 373 "Einfeld" seit
            # 21.08.; drei gueltige Sessions, alle ohne Ortsangabe, und auf der Karte unsichtbar).
            # Grob ist besser als leer — und der Nutzer kann den Spot ohnehin umbenennen lassen.
            name, src, water = sp.area_name.strip(), "area", water
        if name is None:
            pending += 1
            continue
        sp.name, sp.name_source, sp.water_name = _unique_name(db, name, sp.id), src, water
        (db.query(models.Session).filter(models.Session.spot_id == sp.id)
         .update({models.Session.place_name: name, models.Session.place_water: water}))
        db.commit()
        named += 1
    return {"named": named, "still_pending": pending}


def _merge_spot_rows(db, target, sources, lat0):
    """Spot-Zeilen zusammenführen: Sessions umhängen, Polygone vereinigen, Quellen als
    `merged_into` markieren. Gleiche Semantik wie der Admin-Merge, nur intern aufrufbar."""
    from . import models
    polys = [_wkt_to_m(target.poly_wkt, lat0)] if target.poly_wkt else []
    # Fehlende Angaben ZUERST vom besseren Kandidaten übernehmen (der Ziel-Spot kann namenlos
    # sein — Fall aus dem Bestand: der Spot mit 6 Sessions hatte keinen Namen, die Waise daneben
    # hiess "Gošići"). Erst danach die Sessions umhängen, sonst bekämen sie den fehlenden Namen
    # nicht mehr mit und der Spot hiesse anders als seine Sessions.
    uebernommen = False
    for sp in sources:
        if not target.name and sp.name:
            target.name, target.name_source = sp.name, sp.name_source
            uebernommen = True
        if not target.water_name and sp.water_name:
            target.water_name = sp.water_name
    if uebernommen:
        # Der Name muss auch an die EIGENEN Sessions des Ziels — sie hatten bisher keinen
        # (der Spot war namenlos) und wuerden sonst ohne Ortsangabe stehen bleiben, waehrend
        # der Spot auf der Karte einen Namen traegt. Befund: Spot 263 mit 5 Sessions ohne
        # place_name neben der Waise "Gošići".
        (db.query(models.Session).filter(models.Session.spot_id == target.id)
         .update({models.Session.place_name: target.name,
                  models.Session.place_water: target.water_name}))
    for sp in sources:
        if sp.id == target.id or sp.merged_into is not None:
            continue
        (db.query(models.Session).filter(models.Session.spot_id == sp.id)
         .update({models.Session.spot_id: target.id,
                  models.Session.place_name: target.name or models.Session.place_name,
                  models.Session.place_water: target.water_name}))
        _notes_umhaengen(db, sp.id, target.id)
        if sp.poly_wkt:
            polys.append(_wkt_to_m(sp.poly_wkt, lat0))
        sp.merged_into = target.id
    if len(polys) > 1:
        target.poly_wkt = _m_to_wkt(unary_union(polys), lat0)
    db.flush()
    return target


def _notes_umhaengen(db, quelle_id: int, ziel_id: int) -> None:
    """Spot-Beschreibungen beim Zusammenfuehren mitnehmen.

    Ohne das haengen sie an einer Spot-Zeile, die keine Sessions mehr hat, und sind unsichtbar.
    Der Haken ist die Eindeutigkeit `(user_id, spot_id)`: hat DERSELBE Nutzer beide Spots
    beschrieben — bei Dubletten auf derselben Koordinate durchaus moeglich —, kollidieren die
    Zeilen. Regel (Jan, 24.08.): es bleibt die Zeile am ZIEL-Spot stehen, ihr Text ist der
    NEUERE der beiden, und die Fotos der zuwandernden Zeile kommen hinterher, soweit das Limit
    reicht. Was darueber liegt, wird samt Datei geloescht.

    Bewusst in Kauf genommen: die Herzchen der zuwandernden Zeile verfallen — sie galten einem
    anderen Text. Die Zeile am Ziel behaelt ihre.
    """
    from . import models
    from .api.spotnotes import MAX_FOTOS_PRO_BESCHREIBUNG, _note_weg

    for n in db.query(models.SpotNote).filter_by(spot_id=quelle_id).all():
        bleibt = (db.query(models.SpotNote)
                  .filter_by(spot_id=ziel_id, user_id=n.user_id).first())
        if bleibt is None:                      # kein Konflikt -> einfach umhaengen
            n.spot_id = ziel_id
            continue
        if (n.updated_at or n.created_at) > (bleibt.updated_at or bleibt.created_at):
            bleibt.text = n.text
            bleibt.updated_at = n.updated_at
        anz = db.query(models.SpotNotePhoto).filter_by(note_id=bleibt.id).count()
        for f in (db.query(models.SpotNotePhoto).filter_by(note_id=n.id)
                  .order_by(models.SpotNotePhoto.sort, models.SpotNotePhoto.id).all()):
            if anz >= MAX_FOTOS_PRO_BESCHREIBUNG:
                break
            f.note_id = bleibt.id
            f.sort = anz
            anz += 1
        db.flush()
        _note_weg(db, n)                        # Rest-Fotos + Herzchen/Meldungen der Zuwanderin
    db.flush()


def _session_count(db, spot_id: int) -> int:
    from . import models
    return (db.query(models.Session)
            .filter(models.Session.spot_id == spot_id, models.Session.deleted.isnot(True))
            .count())


# Dubletten-Radius (2026-08-20). Befund: 65 Gruppen mit 154 der 301 aktiven Spots lagen unter
# 100 m beieinander — bis zu SIEBEN Zeilen auf derselben Koordinate ("Gošići", 0 m Abstand),
# sechs bei "Kołczewo" (17 m), vier bei "Helsinki" (50 m). Ursache ist ein Wettlauf der Worker:
# bei einem Sammel-Upload analysiert jeder uvicorn-Worker eine Session, alle sehen "hier ist noch
# kein Spot" und legen einen an. Belegt an Helsinki (vier Sessions eines Nutzers, analysiert
# zwischen 10:42:59 und 10:43:17 -> vier Spots) und Kołczewo (vier Sessions in 53 s).
# 100 m ist unkritisch gewaehlt: 50 m ergibt EXAKT dieselben 65 Gruppen, 200 m nur eine mehr —
# 39 der 65 Gruppen haben 0 m Abstand. Das sind keine dicht benachbarten echten Spots, sondern
# Dubletten auf praktisch identischer Koordinate.
DUBLETTE_M = 100.0


def abstand_m(a_lat, a_lon, b_lat, b_lon) -> float:
    """Abstand zweier Koordinaten in Metern (equirectangular, fuer <1 km voellig ausreichend)."""
    k = math.cos(math.radians((a_lat + b_lat) / 2.0))
    return math.hypot((a_lon - b_lon) * 111320.0 * k, (a_lat - b_lat) * 110540.0)


def steg_punkt(db, spot_id: int) -> tuple[float, float] | None:
    """Mittel der SESSION-Startpunkte eines Spots — der „Steg", an dem man tatsaechlich losfaehrt.

    Warum zusaetzlich zur Spot-Koordinate (Befund 24.08.): `spots.lat/lon` ist der Mittelpunkt des
    gepufferten TRACK-Polygons. Zwei Sessions vom selben Steg koennen in verschiedene Teile eines
    Sees fahren; dann liegen die Polygon-Mittelpunkte kilometerweit auseinander, obwohl es derselbe
    Spot ist. Genau so entstand „Loosdrecht" 40 m neben „Tienhoven" — Polygonmitten 2,6 km
    auseinander, Startpunkte 40 m. Die KARTE zeichnet ohnehin dieses Mittel, ein Nutzer sieht also
    zwei Marker uebereinander und nennt es zu Recht eine Dublette.
    """
    from . import models
    rows = (db.query(models.Session.place_lat, models.Session.place_lon)
            .filter(models.Session.spot_id == spot_id, models.Session.deleted.isnot(True),
                    models.Session.place_lat.isnot(None), models.Session.place_lon.isnot(None))
            .all())
    if not rows:
        return None
    return (sum(r[0] for r in rows) / len(rows), sum(r[1] for r in rows) / len(rows))


def _nah(a, b, grenze: float = DUBLETTE_M) -> bool:
    """Liegen zwei Spot-Zeilen so nah, dass es Dubletten sein muessen?"""
    if a.lat is None or a.lon is None or b.lat is None or b.lon is None:
        return False
    return abstand_m(a.lat, a.lon, b.lat, b.lon) <= grenze


def namensstamm(name: str | None) -> str:
    """Name ohne Zaehl-Suffix, klein: "Kołczewo 4" -> "kołczewo".

    Wichtig fuer die Dubletten-Erkennung: `_unique_name` haengt den Verlierern eines
    Anlege-Wettlaufs eine Nummer an — damit hatten sie "verschiedene Namen" und
    `_auto_mergeable` verweigerte genau die Zusammenfuehrung, fuer die es gedacht ist.
    Die Eindeutigkeits-Nummerierung hebelte also die Dubletten-Erkennung aus.
    """
    # NUR Zaehler, die `_unique_name` erzeugen kann (2…49) — sonst wuerde
    # "Bremerhavener Ruderverein v. 1889" zu "… v." verstuemmelt.
    return re.sub(r"\s+([2-9]|[1-4][0-9])$", "", (name or "").strip()).casefold()


def _auto_mergeable(db, group) -> bool:
    """Darf diese Gruppe überlappender Spots automatisch verschmolzen werden?

    JA, wenn höchstens EINER aktive Sessions hat — dann sind die anderen Waisen/Dubletten
    (typisch: Worker-Rennen beim Anlegen). NEIN, wenn mehrere echte Spots mit Sessions und
    UNTERSCHIEDLICHEN Namen zusammenstoßen: dann hat vermutlich eine lange Fahrt ein Polygon
    aufgeblasen (real gesehen: „Cala Longa" ↔ „Tizzano" auf Korsika). Solche Fälle sind eine
    inhaltliche Entscheidung und gehören in den Admin-Review, nicht in die Automatik.
    """
    populated = [sp for sp in group if _session_count(db, sp.id) > 0]
    if len(populated) <= 1:
        return True
    names = {(sp.name or "").strip().lower() for sp in populated if sp.name}
    return len(names) <= 1


def _dedupe_hits(db, hits, lat0):
    """Mehrere Treffer, die sich UNTEREINANDER überlappen, sind kein „≥2 Spots"-Fall, sondern
    EIN fälschlich gespaltener Spot (z. B. durch ein Worker-Rennen beim Anlegen entstanden).
    Solche Treffer werden hier zusammengeführt; echte, voneinander getrennte Spots bleiben
    getrennt (Jans Regel „Traverse über mehrere Spots -> nur Gewässer" bleibt gültig).
    Rückgabe: die verbleibenden, paarweise disjunkten Spot-Zeilen."""
    if len(hits) < 2:
        return hits
    polys = {sp.id: _wkt_to_m(sp.poly_wkt, lat0) for sp in hits}
    groups: list[list] = []
    for sp in hits:
        for grp in groups:
            if any(polys[sp.id].intersects(polys[o.id]) for o in grp):
                grp.append(sp)
                break
        else:
            groups.append([sp])
    out = []
    for grp in groups:
        if len(grp) == 1 or not _auto_mergeable(db, grp):
            out += grp          # echte, verschieden benannte Spots: unverändert lassen
            continue
        # Ziel = meiste Sessions, bei Gleichstand der benannte, sonst der ältere.
        grp.sort(key=lambda sp: (-_session_count(db, sp.id), sp.name is None, sp.id))
        out.append(_merge_spot_rows(db, grp[0], grp[1:], lat0))
    return out


def _sperre_koordinate(db, punkt) -> None:
    """Transaktions-Sperre auf ein ~1-km-Koordinatenraster (nur Postgres).

    Verhindert, dass zwei Worker fuer denselben Ort gleichzeitig einen Spot anlegen. Die Sperre
    faellt mit dem Commit/Rollback der Transaktion von allein. Auf anderen Datenbanken (SQLite im
    Dev) ist sie ein No-Op — dort schuetzt die Naehe-Pruefung danach.
    """
    try:
        if db.bind is None or db.bind.dialect.name != "postgresql":
            return
    except Exception:  # noqa: BLE001
        return
    from sqlalchemy import text
    schluessel = (int(round(punkt[0] * 100)) << 20) ^ int(round(punkt[1] * 100))
    # 64-Bit-signed halten (pg_advisory_xact_lock nimmt bigint).
    schluessel = schluessel % (2 ** 62)
    try:
        db.execute(text("select pg_advisory_xact_lock(:k)"), {"k": schluessel})
    except Exception:  # noqa: BLE001
        pass          # Sperre ist Beschleuniger, nicht Bedingung — Riegel 2 traegt allein.


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
    # Waisen aussortieren: Spots ohne aktive Session sind Müll (entstehen z. B., wenn zwei
    # Worker parallel für dieselbe Session einen Spot anlegen — der Verlierer bleibt leer
    # zurück). Sie würden hier sonst als zweiter „Treffer" jede Zuordnung blockieren.
    orphans = [sp for sp in hits if _session_count(db, sp.id) == 0]
    if orphans and len(orphans) < len(hits):
        hits = [sp for sp in hits if sp not in orphans]
    hits = _dedupe_hits(db, hits, lat0)
    if len(hits) == 1:
        sp = hits[0]
        merged = unary_union([_wkt_to_m(sp.poly_wkt, lat0), new_m])
        sp.poly_wkt = _m_to_wkt(merged, lat0)
        s.spot_id = sp.id
        if sp.name:
            s.place_name = sp.name
        s.place_water = sp.water_name
    elif len(hits) >= 2:
        # ≥2 ECHTE (disjunkte) Spots: der Startpunkt entscheidet (Jan) — wer hier losfährt,
        # foilt an DIESEM Spot, auch wenn die Fahrt bis zum Nachbarspot reicht.
        from shapely.geometry import Point as _Point
        start_m = _Point(_project([g.start], lat0)[0])
        home = None
        for sp in hits:
            if _wkt_to_m(sp.poly_wkt, lat0).contains(start_m):
                home = sp
                break
        if home is None:
            # Start liegt in keinem Spot -> echte Traverse: nur Gewässername, kein Spot.
            _, _, w = name_for(*g.start)
            s.spot_id = None
            if w:
                s.place_name = w; s.place_water = w
        else:
            # Nur das Polygon des Heimat-Spots wächst mit — sonst würde die lange Fahrt die
            # Nachbarspots weiter zusammenkleben (genau so entstand „Cala Longa" ↔ „Tizzano").
            s.spot_id = home.id
            if home.name:
                s.place_name = home.name
            s.place_water = home.water_name
    else:                          # neuer Spot
        # --- Anlege-Wettlauf verhindern (2026-08-20) --------------------------------------
        # Bei einem Sammel-Upload analysieren mehrere uvicorn-Worker gleichzeitig je eine
        # Session desselben Sees. Alle sehen "hier ist noch kein Spot" und legen einen an —
        # so entstanden 154 der 301 aktiven Spots als Dubletten unter 100 m (belegt: vier
        # Helsinki-Spots aus vier Sessions, die zwischen 10:42:59 und 10:43:17 analysiert
        # wurden). Zwei Riegel dagegen:
        #   1) eine Postgres-Sperre auf die gerundete Koordinate (~1 km Raster) — der zweite
        #      Worker wartet, statt parallel anzulegen. Nur Postgres; ohne Sperre (SQLite-Dev)
        #      bleibt Riegel 2.
        #   2) NACH der Sperre noch einmal nachsehen: existiert inzwischen ein Spot naeher als
        #      DUBLETTE_M, wird er benutzt statt eines neuen. Das ist der eigentliche Schutz,
        #      denn er greift auch, wenn die Sperre nicht zieht.
        _sperre_koordinate(db, g.start)
        nahe = (db.query(models.Spot)
                .filter(models.Spot.merged_into.is_(None), models.Spot.lat.isnot(None),
                        models.Spot.lat.between(lat0 - 0.01, lat0 + 0.01))
                .all())
        nahe = [x for x in nahe
                if abstand_m(x.lat, x.lon, g.start[0], g.start[1]) <= DUBLETTE_M]
        if nahe:
            nahe.sort(key=lambda x: (-_session_count(db, x.id), x.name is None, x.id))
            sp = nahe[0]
            if sp.poly_wkt:
                sp.poly_wkt = _m_to_wkt(unary_union([_wkt_to_m(sp.poly_wkt, lat0), new_m]), lat0)
            else:
                sp.poly_wkt = _m_to_wkt(new_m, lat0)
            s.spot_id = sp.id
            if sp.name:
                s.place_name = sp.name
            s.place_water = sp.water_name
        else:
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
