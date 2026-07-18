"""Community: Feed, Rekorde, Bestenlisten, Spots, Likes/Votes.

Sichtbar sind nur „community-eligible" Sessions: präzise erkannt (detection=model),
Pumpfoilen (is_pumpfoil), nicht gelöscht/versteckt, Besitzer nicht gesperrt.
Aggregate laufen über denormalisierte Spalten (AnalysisResult.best_*/num_runs/
detection) -> reines SQL, keine Full-Scans/JSON-Parsing.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Float, Time, cast, func, literal, or_
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from .. import models
from ..accounts import is_new_account
from ..db import get_db
from ..media import thumb_url as _thumb
from ..naming import owner_label_sql
from ..weather import spot_water_temp, spot_weather
from .deps import current_user, require_social

router = APIRouter(prefix="/api/community", tags=["community"])
# Historisch getrennt (Spot-Lese-Endpunkte). Inzwischen sind BEIDE Router ungegatet — Age-Gate sperrt
# nur Chat + Schreiben (Like/Vote via require_social an den POSTs). Bleibt als eigener Router bestehen.
spot_router = APIRouter(prefix="/api/community", tags=["community"])

PERIODS = {"today": 1, "10d": 10, "30d": 30, "365d": 365, "all": None}
METRICS = ("distance", "duration", "speed", "runs", "glide",
           "session_distance", "session_time", "session_pumps", "max_hr", "early_bird", "night_owl")
VOTE_KINDS = ("fake", "inappropriate")

AR = models.AnalysisResult
S = models.Session
U = models.User
NAME = owner_label_sql(U)  # display_name mit Fallback "User #<id>"


def _spot_cond(spot: str):
    """Filter für den spot-Param: numerisch -> spot_id (neue Clients/PWA), sonst
    place_name (Rückwärtskompat für released Apps). Namen sind eindeutig -> korrekt."""
    return S.spot_id == int(spot) if str(spot).isdigit() else S.place_name == spot

# Rekord-Kennzahl -> (Wert-Spalte, Lauf-Index-Spalte | None)
# Max-Puls steckt (nur) in metrics_json -> JSONB-Extraktion; Tabelle ist klein, kein Index nötig.
_MAX_HR = cast(func.nullif(func.jsonb_extract_path_text(cast(AR.metrics_json, JSONB), "max_hr"), ""), Float)
# Tageszeit in SONNENZEIT (Längengrad-Offset lon/15 h statt fester Zeitzone — fair über alle
# Spots von Finnland bis Kalifornien). Wert = Sekunden seit Mitternacht.
def _time_of_day(col):
    return func.date_part(
        "epoch",
        cast(func.timezone("UTC", col)
             + func.make_interval(0, 0, 0, 0, 0, 0, func.coalesce(S.place_lon, 10.0) * 240.0), Time),
    )


_TIME_OF_DAY = _time_of_day(S.started_at)
# Night Owl zählt das Session-ENDE als Start-Tageszeit + Dauer — läuft eine Session über
# Mitternacht, ergibt das >24 h (z. B. 27:04 = 03:04 am Folgetag) und gewinnt damit korrekt
# gegen jedes 23:xx-Ende; sie zählt über started_at weiter zum Vortag. Anzeige rechnet mod 24 h.
# Kaputte ended_at (vor Start / >24 h danach, vgl. merge._end) werden auf [0, 24 h] geklemmt.
_TIME_OF_DAY_END = _time_of_day(S.started_at) + func.greatest(
    0.0, func.least(86400.0, func.coalesce(func.extract("epoch", S.ended_at - S.started_at), 0.0)))

REC_COL = {
    "distance": (AR.best_distance_m, AR.best_distance_idx),
    "duration": (AR.best_duration_s, AR.best_duration_idx),
    "speed": (AR.best_speed_mps, AR.best_speed_idx),
    "glide": (AR.best_glide_s, AR.best_glide_idx),
    "runs": (AR.num_runs, None),
    "session_distance": (AR.foiling_distance_m, None),   # weiteste On-Foil-Distanz einer Session
    "session_time": (AR.foiling_time_s, None),           # meiste On-Foil-Zeit einer Session
    "session_pumps": (AR.pump_count, None),              # meiste Pumps einer Session
    "max_hr": (_MAX_HR, None),                           # höchster Puls
    "early_bird": (_TIME_OF_DAY, None),                  # früheste Session (Sonnenzeit, MIN)
    "night_owl": (_TIME_OF_DAY_END, None),               # spätestes Session-ENDE (Sonnenzeit, MAX)
}
# Rekorde, bei denen der KLEINSTE Wert gewinnt.
REC_ASC = {"early_bird"}
BRIEF_COLS = (AR.foiling_distance_m, AR.max_speed_mps, AR.num_runs,
              S.id, S.started_at, NAME, S.place_name, U.avatar_url, S.caption, AR.track_preview,
              S.foil_id, U.created_at, S.device_id, S.ended_at, S.youtube_url)


def _cutoff(period: str) -> datetime | None:
    days = PERIODS.get(period)
    if days is None:
        return None
    now = datetime.now(timezone.utc)
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    return now - timedelta(days=days)


def _community(query, viewer_id: int | None = None, accel_only: bool = True):
    """Joins + Filter für community-sichtbare Sessions. query selektiert beliebige Spalten.

    Versteckte Konten (hidden, App-Store-Tester) werden für alle ANDEREN ausgeblendet;
    der Besitzer selbst (viewer_id) sieht seine Inhalte weiter.

    accel_only=True (Default): nur präzise Accel-/Modell-Läufe. False: auch GPS-only-Läufe."""
    q = (
        query.select_from(AR)
        .join(S, AR.session_id == S.id)
        .join(U, S.user_id == U.id)
        .filter(S.deleted.isnot(True), S.flagged.isnot(True), U.blocked.isnot(True),
                or_(U.hidden.isnot(True), U.id == viewer_id),
                S.is_pumpfoil.is_(True))
    )
    if accel_only:
        q = q.filter(AR.detection == "model")
    else:
        # Auch GPS-only, aber nur wenn On-Foil erkannt wurde (mind. ein Lauf) —
        # reine GPS-Fahrten ohne Foiling sollen Rekorde/Spots nicht verwässern.
        q = q.filter(or_(AR.detection == "model", AR.num_runs > 0))
    return q


def _brief(fdist, max_speed, num_runs, sid, ts, uname, place, avatar, caption=None, track_preview=None,
           foil_id=None, author_created_at=None, device_id=None, ended=None, youtube=None) -> dict:
    return {
        "session_id": sid,
        "started_at": ts.isoformat() if ts else None,
        "ended_at": ended.isoformat() if ended else None,
        "youtube_url": youtube or None,
        "name": uname,
        "author_new": is_new_account(author_created_at),
        "avatar_url": avatar,
        "spot": place or None,
        "caption": caption or None,
        "track_preview": track_preview or None,
        "runs": int(num_runs or 0),
        "foiling_km": round((fdist or 0) / 1000.0, 2),
        "max_speed_mps": max_speed,
        "foil_id": foil_id,
        "foil": None,  # in _attach_social aufgelöst (nur wenn foil_id gesetzt)
        "device_id": device_id,
        "device_label": None,  # in _attach_social aufgelöst (Uhr-Bezeichnung)
    }


# ----------------------------------------------------------------- Feed/Spots ----
@router.get("/sessions")
def community_sessions(
    limit: int = 20, offset: int = 0,
    name: str | None = Query(None), spot: str | None = Query(None), accel_only: bool = True,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Feed: community-sichtbare Sessions, neueste zuerst, echte SQL-Paginierung.
    Optional gefiltert nach Anzeigename (Teiltreffer) und/oder Spot."""
    q = _community(db.query(*BRIEF_COLS), user.id, accel_only)
    if name:
        q = q.filter(func.lower(U.display_name).like(f"%{name.lower()}%"))
    if spot:
        q = q.filter(_spot_cond(spot))
    rows = q.order_by(S.started_at.desc()).offset(max(offset, 0)).limit(min(max(limit, 1), 100)).all()
    return _attach_social(db, user, [_brief(*r) for r in rows])


@spot_router.get("/spot-sessions")
def spot_sessions(
    spot: str, limit: int = 50, offset: int = 0, accel_only: bool = True,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        _community(db.query(*BRIEF_COLS), user.id, accel_only).filter(_spot_cond(spot))
        .order_by(S.started_at.desc())
        .offset(max(offset, 0)).limit(min(max(limit, 1), 100)).all()
    )
    return _attach_social(db, user, [_brief(*r) for r in rows])


# --------------------------------------------------------------------- Records ----
def _record_entry(db: Session, metric: str, cut: datetime | None, spot: str | None = None, viewer_id: int | None = None, accel_only: bool = True) -> dict:
    valcol, idxcol = REC_COL[metric]
    idx_sel = idxcol if idxcol is not None else literal(None)
    q = _community(db.query(valcol, idx_sel, S.id, S.started_at, NAME, S.place_name, U.avatar_url, AR.track_preview), viewer_id, accel_only)
    q = q.filter(valcol > 0)
    if cut is not None:
        q = q.filter(S.started_at >= cut)
    if spot is not None:
        q = q.filter(_spot_cond(spot))
    row = q.order_by(valcol.asc() if metric in REC_ASC else valcol.desc()).first()
    if row is None:
        return {"session_id": None, "value": 0.0, "started_at": None, "run_idx": None, "name": None, "avatar_url": None, "spot": None, "track_preview": None}
    val, idx, sid, ts, name, place, avatar, preview = row
    return {
        "session_id": sid, "value": round(float(val), 2),
        "started_at": ts.isoformat() if ts else None, "run_idx": idx,
        "name": name, "avatar_url": avatar, "spot": place or None, "track_preview": preview or None,
    }


@router.get("/records")
def community_records(accel_only: bool = True, _user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return {p: {m: _record_entry(db, m, _cutoff(p), viewer_id=_user.id, accel_only=accel_only) for m in METRICS} for p in PERIODS}


@spot_router.get("/spot-records")
def spot_records(
    spot: str, period: str = "all", accel_only: bool = True,
    _user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    cut = _cutoff(period)
    return {m: _record_entry(db, m, cut, spot=spot, viewer_id=_user.id, accel_only=accel_only) for m in METRICS}


# ------------------------------------------------------------------- Leaders ----
@router.get("/leaders")
def leaders(period: str = "all", accel_only: bool = True, _user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    cut = _cutoff(period)
    q = _community(db.query(
        NAME, U.avatar_url,
        func.count(S.id), func.coalesce(func.sum(AR.num_runs), 0),
        func.count(func.distinct(func.nullif(S.place_name, ""))),
        func.coalesce(func.sum(AR.pump_count), 0),
    ), _user.id, accel_only)
    if cut is not None:
        q = q.filter(S.started_at >= cut)
    rows = q.group_by(U.id, U.display_name, U.avatar_url).all()
    flat = [{"name": name or "—", "avatar_url": av, "sessions": int(ns), "runs": int(nr or 0),
             "spots": int(nsp or 0), "pumps": int(np or 0)}
            for name, av, ns, nr, nsp, np in rows]
    top = lambda key: [x for x in sorted(flat, key=lambda y: y[key], reverse=True) if x[key] > 0][:10]  # noqa: E731
    return {"sessions": top("sessions"), "runs": top("runs"), "spots": top("spots"), "pumps": top("pumps")}


# ----------------------------------------------------------- Neueste Medien ----
@router.get("/latest-photos")
def latest_photos(
    limit: int = 5, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Neueste Community-Medien (Fotos UND verlinkte Videos), neueste zuerst.
    Pro Session höchstens ein Foto- und ein Video-Eintrag. Inkl. Like-/Melde-Status."""
    P = models.SessionPhoto
    lim = min(max(limit, 1), 20)
    items: list[dict] = []
    _vis = (S.deleted.isnot(True), S.flagged.isnot(True), U.blocked.isnot(True),
            or_(U.hidden.isnot(True), U.id == user.id), S.is_pumpfoil.is_(True))

    # Fotos: je Session das neueste, nach Upload-Zeit.
    prows = (
        db.query(P.id, P.url, P.created_at, P.session_id, S.started_at, NAME, U.avatar_url, S.place_name, S.caption)
        .select_from(P).join(S, P.session_id == S.id).join(U, S.user_id == U.id)
        .filter(P.blocked.isnot(True), *_vis)
        .order_by(P.id.desc()).limit(80).all()
    )
    seenp: set[int] = set()
    for pid, url, cts, sid, sts, name, avatar, place, caption in prows:
        if sid in seenp:
            continue
        seenp.add(sid)
        items.append({"kind": "photo", "_ts": cts or sts, "photo_id": pid, "url": url,
                      "thumb_url": _thumb(url), "youtube_url": None,
                      "session_id": sid, "started_at": sts.isoformat() if sts else None, "name": name,
                      "avatar_url": avatar, "spot": place or None, "caption": caption or None})

    # Videos: je Session das neueste verlinkte YouTube-Video, nach Verlink-Zeit.
    V = models.SessionVideo
    vrows = (
        db.query(V.youtube_url, V.created_at, V.session_id, S.started_at, NAME, U.avatar_url, S.place_name, S.caption)
        .select_from(V).join(S, V.session_id == S.id).join(U, S.user_id == U.id)
        .filter(V.blocked.isnot(True), *_vis)
        .order_by(V.id.desc()).limit(80).all()
    )
    seenv: set[int] = set()
    for yturl, cts, sid, sts, name, avatar, place, caption in vrows:
        if sid in seenv:
            continue
        seenv.add(sid)
        items.append({"kind": "video", "_ts": cts or sts, "url": None, "youtube_url": yturl,
                      "session_id": sid, "started_at": sts.isoformat() if sts else None, "name": name,
                      "avatar_url": avatar, "spot": place or None, "caption": caption or None})

    _floor = datetime.min.replace(tzinfo=timezone.utc)
    items.sort(key=lambda x: x["_ts"] or _floor, reverse=True)
    out = items[:lim]
    for x in out:
        x.pop("_ts", None)
    ids = [o["session_id"] for o in out]
    if ids:
        likes = dict(
            db.query(models.SessionLike.session_id, func.count())
            .filter(models.SessionLike.session_id.in_(ids)).group_by(models.SessionLike.session_id).all()
        )
        mine = {sid for (sid,) in db.query(models.SessionLike.session_id)
                .filter(models.SessionLike.session_id.in_(ids), models.SessionLike.user_id == user.id).all()}
        myrep = {sid for (sid,) in db.query(models.SessionVote.session_id)
                 .filter(models.SessionVote.session_id.in_(ids), models.SessionVote.kind == "inappropriate",
                         models.SessionVote.user_id == user.id).all()}
        for o in out:
            sid = o["session_id"]
            o["like_count"] = int(likes.get(sid, 0))
            o["liked"] = sid in mine
            o["my_inappropriate"] = sid in myrep
    return out


@spot_router.get("/spots")
def spots(accel_only: bool = True, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    has_place = (S.place_name.isnot(None), S.place_name != "")
    qual = sorted({p for (p,) in _community(db.query(S.place_name), user.id, accel_only).filter(*has_place).distinct().all()})
    mine_rows = (
        _community(db.query(S.place_name), user.id, accel_only).filter(S.user_id == user.id, *has_place)
        .order_by(S.started_at.desc()).all()
    )
    qualset = set(qual)
    mine: list[str] = []
    for (p,) in mine_rows:
        if p in qualset and p not in mine:
            mine.append(p)
        if len(mine) >= 3:
            break
    return {"mine": mine, "all": qual}


@spot_router.get("/spot-map")
def spot_map(accel_only: bool = True, _user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Spots mit repräsentativen Koordinaten (Mittel) + Session-Zahl — für die Karte."""
    rows = (
        _community(db.query(S.place_name, func.avg(S.place_lat), func.avg(S.place_lon), func.count(),
                            func.max(S.spot_id)), _user.id, accel_only)
        .filter(S.place_name.isnot(None), S.place_name != "", S.place_lat.isnot(None))
        .group_by(S.place_name).all()
    )
    return [
        {"spot": name, "spot_id": sid, "lat": float(lat), "lon": float(lon), "sessions": int(n)}
        for name, lat, lon, n, sid in rows if lat is not None and lon is not None
    ]


# Spot-Wetter/Pegel: je Spot 1 h gemeinsam für ALLE Nutzer gecacht (schont die freien
# APIs + schnelle Anzeige). In-Memory reicht für den Einzelprozess (wie ratelimit.py).
_WX_TTL = 3600.0
_wx_lock = threading.Lock()
_wx_cache: dict[str, tuple[float, dict]] = {}


@spot_router.get("/spot/weather")
def spot_weather_endpoint(
    spot: str, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Wetter (heute/morgen/übermorgen + aktuell) und nächster Pegel für einen Spot.
    Koordinaten = Mittel der community-sichtbaren Sessions an diesem Spot."""
    from ..spots import canon_spot_name
    name = canon_spot_name(db, spot)   # id ODER Name -> kanonischer Name (Cache/Wassertemp teilen)
    now = time.monotonic()
    with _wx_lock:
        hit = _wx_cache.get(name)
        if hit and now - hit[0] < _WX_TTL:
            return hit[1]
    # Koordinaten aus ALLEN Sessions am Spot (Ort ist nicht community-sensitiv) —
    # auch GPS-only/eigene zählen, damit das Widget überall greift.
    row = (
        db.query(func.avg(S.place_lat), func.avg(S.place_lon))
        .filter(_spot_cond(spot), S.place_lat.isnot(None), S.deleted.isnot(True)).first()
    )
    if not row or row[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Spot ohne Koordinaten")
    data = spot_weather(float(row[0]), float(row[1]))
    # Spotspezifische Wassertemperatur (z. B. Illmensee/db0wv) — None, wenn keine Quelle.
    data["water"] = spot_water_temp(name)
    with _wx_lock:
        _wx_cache[name] = (now, data)
    return data


_stats_lock = threading.Lock()
_stats_cache: tuple[float, dict] | None = None
_STATS_TTL = 300.0  # 5 min


@router.get("/stats")
def community_stats(
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Community-Kennzahlen für den Willkommens-Banner: Foiler (Nutzer mit ≥1
    sichtbaren Session), Spots (distinct place_name), Sessions gesamt. Inkl.
    GPS-only-Läufe (accel_only=False), gecacht (5 min), damit's billig bleibt."""
    global _stats_cache
    now = time.monotonic()
    with _stats_lock:
        if _stats_cache and now - _stats_cache[0] < _STATS_TTL:
            return _stats_cache[1]
    # Foiler = ALLE registrierten Nutzer (inkl. Testaccounts) — die Zahl wirkt sonst zu klein.
    # Spots/Sessions bleiben community-sichtbar (accel_only=False, versteckte Konten raus).
    foilers = db.query(func.count(U.id)).scalar()
    row = _community(
        db.query(
            func.count(func.distinct(func.nullif(S.place_name, ""))),
            func.count(func.distinct(S.id)),
            func.coalesce(func.sum(AR.pump_count), 0),
        ),
        viewer_id=None, accel_only=False,
    ).first()
    data = {"foilers": int(foilers or 0), "spots": int(row[0] or 0),
            "sessions": int(row[1] or 0), "pumps": int(row[2] or 0)}
    with _stats_lock:
        _stats_cache = (now, data)
    return data


@router.get("/foil-stats")
def foil_stats(_user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Community-Aggregat je Foil (nur Sessions mit explizit gewähltem Foil)."""
    rows = (
        _community(db.query(
            S.foil_id,
            func.count(func.distinct(S.id)),
            func.count(func.distinct(S.user_id)),
            func.sum(AR.foiling_distance_m),
            func.sum(AR.foiling_time_s),
            func.sum(AR.pump_count),
            func.max(AR.best_distance_m),
            func.avg(AR.avg_cadence_hz),
        ), _user.id).filter(S.foil_id.isnot(None))
        .group_by(S.foil_id).all()
    )
    if not rows:
        return []
    fmap = {f.id: f for f in db.query(models.Foil).filter(models.Foil.id.in_([r[0] for r in rows])).all()}
    out = []
    for fid, n_sess, n_users, sum_dist, sum_time, sum_pumps, best_dist, avg_hz in rows:
        f = fmap.get(fid)
        if not f:
            continue
        dist = float(sum_dist) if sum_dist else 0.0
        time = float(sum_time) if sum_time else 0.0
        pumps = float(sum_pumps) if sum_pumps else 0.0
        out.append({
            "foil_id": fid, "brand": f.brand, "model": f.model, "size": f.size,
            "aspect_ratio": round((f.span_cm ** 2) / f.area_cm2, 2) if f.area_cm2 else None,
            "sessions": int(n_sess), "users": int(n_users),
            # Aussagekräftig fürs Foil: Ø-Speed (Distanz/Zeit) + Meter pro Pump.
            "avg_speed_kmh": round(dist / time * 3.6, 1) if time > 0 else None,
            "meters_per_pump": round(dist / pumps, 1) if pumps > 0 else None,
            "best_distance_m": round(float(best_dist)) if best_dist else None,
            "avg_pump_hz": round(float(avg_hz), 2) if avg_hz else None,
        })
    out.sort(key=lambda x: x["sessions"], reverse=True)
    return out


@router.get("/watch-stats")
def watch_stats(_user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Community-Aggregat je Uhr-Modell (device_tokens.label). Nur Sessions mit gepaartem Gerät."""
    DT = models.DeviceToken
    rows = (
        _community(db.query(
            DT.label,
            func.count(func.distinct(S.id)),
            func.count(func.distinct(S.user_id)),
            func.sum(AR.foiling_distance_m),
            func.sum(AR.foiling_time_s),
            func.sum(AR.pump_count),
            func.max(AR.best_distance_m),
            func.max(AR.best_speed_mps),
            func.avg(AR.avg_cadence_hz),
        ), _user.id).join(DT, S.device_id == DT.id)
        .filter(S.device_id.isnot(None), DT.label.isnot(None))
        .group_by(DT.label).all()
    )
    # Modelle über den ersten Teil vor "/" zusammenfassen (lange partNumber-Gruppen).
    agg: dict[str, dict] = {}
    for label, n_sess, n_users, sum_dist, sum_time, sum_pumps, best_dist, best_spd, avg_hz in rows:
        key = (label or "").split("/")[0].strip() or "—"
        a = agg.setdefault(key, {"watch": key, "sessions": 0, "users": 0, "dist": 0.0, "time": 0.0,
                                 "pumps": 0.0, "best_dist": 0.0, "best_spd": 0.0, "hz": []})
        a["sessions"] += int(n_sess or 0)
        a["users"] += int(n_users or 0)   # grobe Summe je label-Variante (selten >1 Variante/Modell)
        a["dist"] += float(sum_dist or 0.0)
        a["time"] += float(sum_time or 0.0)
        a["pumps"] += float(sum_pumps or 0.0)
        a["best_dist"] = max(a["best_dist"], float(best_dist or 0.0))
        a["best_spd"] = max(a["best_spd"], float(best_spd or 0.0))
        if avg_hz:
            a["hz"].append(float(avg_hz))
    out = [{
        "watch": a["watch"], "sessions": a["sessions"], "users": a["users"],
        "foiling_km": round(a["dist"] / 1000.0, 1),
        "avg_speed_kmh": round(a["dist"] / a["time"] * 3.6, 1) if a["time"] > 0 else None,
        "best_distance_m": round(a["best_dist"]) if a["best_dist"] else None,
        "best_speed_kmh": round(a["best_spd"] * 3.6, 1) if a["best_spd"] else None,
        "avg_pump_hz": round(sum(a["hz"]) / len(a["hz"]), 2) if a["hz"] else None,
    } for a in agg.values()]
    out.sort(key=lambda x: x["sessions"], reverse=True)
    return out


# ------------------------------------------------------------------ Top-Liked ----
@router.get("/top-liked")
def top_liked(
    period: str = "all", limit: int = 3,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    likes_sq = (
        db.query(models.SessionLike.session_id, func.count().label("n"))
        .group_by(models.SessionLike.session_id).subquery()
    )
    q = _community(db.query(*BRIEF_COLS, likes_sq.c.n), user.id).join(likes_sq, likes_sq.c.session_id == S.id)
    cut = _cutoff(period)
    if cut is not None:
        q = q.filter(S.started_at >= cut)
    rows = q.order_by(likes_sq.c.n.desc(), S.started_at.desc()).limit(min(max(limit, 1), 20)).all()
    return _attach_social(db, user, [_brief(*r[:len(BRIEF_COLS)]) for r in rows])


# ------------------------------------------------------------ Likes / Votes ----
def _attach_social(db: Session, user: models.User, briefs: list[dict]) -> list[dict]:
    """Reichert Briefs in einem Rutsch mit Likes/Foto-Infos an (kein N+1)."""
    ids = [b["session_id"] for b in briefs]
    if not ids:
        return briefs
    likes = dict(
        db.query(models.SessionLike.session_id, func.count())
        .filter(models.SessionLike.session_id.in_(ids)).group_by(models.SessionLike.session_id).all()
    )
    mine = {
        sid for (sid,) in db.query(models.SessionLike.session_id)
        .filter(models.SessionLike.session_id.in_(ids), models.SessionLike.user_id == user.id).all()
    }
    pc: dict[int, int] = {}
    thumb: dict[int, str] = {}
    for sid, url in (
        db.query(models.SessionPhoto.session_id, models.SessionPhoto.url)
        .filter(models.SessionPhoto.session_id.in_(ids), models.SessionPhoto.blocked.isnot(True))
        .order_by(models.SessionPhoto.id).all()
    ):
        pc[sid] = pc.get(sid, 0) + 1
        thumb.setdefault(sid, _thumb(url))
    # Explizit gewählte Foils im Batch auflösen.
    fids = {b.get("foil_id") for b in briefs if b.get("foil_id")}
    fmap = {}
    if fids:
        fmap = {f.id: {"id": f.id, "brand": f.brand, "model": f.model, "size": f.size}
                for f in db.query(models.Foil).filter(models.Foil.id.in_(fids)).all()}
    # Uhr-/Geräte-Bezeichnung im Batch (nur erster Teil vor "/").
    dids = {b.get("device_id") for b in briefs if b.get("device_id")}
    dmap = dict(db.query(models.DeviceToken.id, models.DeviceToken.label)
                .filter(models.DeviceToken.id.in_(dids)).all()) if dids else {}
    for b in briefs:
        sid = b["session_id"]
        b["like_count"] = int(likes.get(sid, 0))
        b["liked"] = sid in mine
        b["photo_count"] = pc.get(sid, 0)
        b["thumb_url"] = thumb.get(sid)
        b["foil"] = fmap.get(b.get("foil_id"))
        lbl = dmap.get(b.get("device_id"))
        b["device_label"] = lbl.split("/")[0].strip() if lbl else None
    return briefs


def _like_state(db: Session, sid: int, user: models.User) -> dict:
    count = db.query(func.count()).select_from(models.SessionLike).filter_by(session_id=sid).scalar()
    liked = db.query(models.SessionLike).filter_by(session_id=sid, user_id=user.id).first() is not None
    return {"like_count": int(count or 0), "liked": liked}


def _vote_counts(db: Session, sid: int, user: models.User) -> dict:
    out: dict = {}
    for kind in VOTE_KINDS:
        out[f"{kind}_count"] = int(
            db.query(func.count()).select_from(models.SessionVote).filter_by(session_id=sid, kind=kind).scalar() or 0)
        out[f"my_{kind}"] = db.query(models.SessionVote).filter_by(session_id=sid, kind=kind, user_id=user.id).first() is not None
    return out


@router.post("/sessions/{session_id}/like")
def toggle_like(session_id: int, user: models.User = Depends(require_social), db: Session = Depends(get_db)) -> dict:
    if db.get(models.Session, session_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    sess = db.get(models.Session, session_id)
    row = db.query(models.SessionLike).filter_by(user_id=user.id, session_id=session_id).first()
    if row:
        db.delete(row)
    else:
        db.add(models.SessionLike(user_id=user.id, session_id=session_id))
    db.commit()
    # Owner bei NEUEM Like (nicht eigenem) benachrichtigen – falls aktiviert.
    if row is None and sess is not None and sess.user_id != user.id:
        from ..push import send_push, wants
        if wants(db, sess.user_id, "like"):
            send_push(db, sess.user_id, "Pumpfoil",
                      f"{user.display_name or 'Jemand'} gefällt deine Session ❤️",
                      f"/sessions/{session_id}")
    return _like_state(db, session_id, user)


@router.post("/sessions/{session_id}/vote")
def toggle_vote(
    session_id: int, kind: str = Query(...),
    user: models.User = Depends(require_social), db: Session = Depends(get_db),
) -> dict:
    if kind not in VOTE_KINDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "kind must be fake|inappropriate")
    sess = db.get(models.Session, session_id)
    if sess is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    row = db.query(models.SessionVote).filter_by(user_id=user.id, session_id=session_id, kind=kind).first()
    added = row is None
    if row:
        db.delete(row)
    else:
        db.add(models.SessionVote(user_id=user.id, session_id=session_id, kind=kind))
    # Nur eine NEUE "unangemessen"-Meldung blendet aus; Rücknahme blendet NIE auto. wieder
    # ein; "fake" beeinflusst die Sichtbarkeit nicht. mod_ok schützt vor Auto-Verstecken.
    if kind == "inappropriate" and added and not sess.mod_ok:
        sess.flagged = True
    db.commit()
    return _vote_counts(db, session_id, user)


@router.get("/sessions/{session_id}/social")
def session_social(session_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if db.get(models.Session, session_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    photos = (
        db.query(models.SessionPhoto.id, models.SessionPhoto.url)
        .filter_by(session_id=session_id, blocked=False).order_by(models.SessionPhoto.id).all()
    )
    videos = (
        db.query(models.SessionVideo.id, models.SessionVideo.youtube_url)
        .filter_by(session_id=session_id, blocked=False).order_by(models.SessionVideo.id).all()
    )
    return {
        **_like_state(db, session_id, user),
        **_vote_counts(db, session_id, user),
        "photos": [{"id": pid, "url": url, "thumb_url": _thumb(url)} for pid, url in photos],
        "videos": [{"id": vid, "youtube_url": vurl} for vid, vurl in videos],
    }
