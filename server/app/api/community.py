"""Community: Feed, Rekorde, Bestenlisten, Spots, Likes/Votes.

Sichtbar sind nur „community-eligible" Sessions: präzise erkannt (detection=model),
Pumpfoilen (is_pumpfoil), nicht gelöscht/versteckt, Besitzer nicht gesperrt.
Aggregate laufen über denormalisierte Spalten (AnalysisResult.best_*/num_runs/
detection) -> reines SQL, keine Full-Scans/JSON-Parsing.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import Float, cast, func, literal, or_, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from .. import models
from ..accounts import is_new_account
from ..db import get_db
from ..media import thumb_url as _thumb
from ..naming import owner_label_sql
from ..tzlookup import tz_name, tz_of
from ..videos import client_wants_all_videos, filter_videos
from ..weather import spot_water_temp, spot_weather
from .deps import current_user, require_social

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/community", tags=["community"])
# Historisch getrennt (Spot-Lese-Endpunkte). Inzwischen sind BEIDE Router ungegatet — Age-Gate sperrt
# nur Chat + Schreiben (Like/Vote via require_social an den POSTs). Bleibt als eigener Router bestehen.
spot_router = APIRouter(prefix="/api/community", tags=["community"])

PERIODS = {"today": 1, "10d": 10, "30d": 30, "365d": 365, "all": None}
METRICS = ("distance", "duration", "speed", "runs", "glide",
           "session_distance", "session_time", "session_pumps", "max_hr", "early_bird", "night_owl",
           # Einziger Rekord, der einem NUTZER gehört statt einer Session: Summe der Carves > 180°
           # im Zeitraum (s. _carve_record).
           "carves180")
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
}
# Zeit-Rekorde (Early Bird / Night Owl) laufen NICHT über REC_COL, sondern Python-seitig
# über die echte Spot-Zeitzone (inkl. Sommerzeit) — siehe _time_record().
TIME_METRICS = ("early_bird", "night_owl")
BRIEF_COLS = (AR.foiling_distance_m, AR.max_speed_mps, AR.num_runs,
              S.id, S.started_at, NAME, S.place_name, U.avatar_url, S.caption, AR.track_preview,
              S.foil_id, U.created_at, S.device_id, S.ended_at, S.youtube_url,
              # Restliches Setup + Besitzer, in _attach_social zu Labels aufgeloest (Batch).
              S.stab_id, S.board_id, S.mast_len_cm, S.user_id, S.sport_class,
              # place_lat/place_lon MUESSEN die letzten beiden bleiben: sessions-grouped greift
              # positionsbasiert darauf zu (r[nb-2], r[nb-1]).
              S.place_lat, S.place_lon)


def _cutoff(period: str) -> datetime | None:
    days = PERIODS.get(period)
    if days is None:
        return None
    now = datetime.now(timezone.utc)
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    return now - timedelta(days=days)


def _community(query, viewer_id: int | None = None, accel_only: bool = True,
               sport: str = "pumpfoil"):
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
                # NUR fertige Sessions: recording/live (In-Progress bzw. gps_only-Vorabanalyse aus
                # der Detail-Ansicht) NIE in Community/Rekorde — auch wenn is_pumpfoil schon gesetzt.
                S.status.notin_(("recording", "live")),
                S.is_pumpfoil.is_(True),
                # Menschliche Klassifikation (docs/sport-classification.md): unklassifizierte
                # Sessions (zwei Melder, noch nicht zugeordnet) erscheinen in KEINER Kategorie,
                # andere Sportarten und Datenmüll nicht in den Pumpfoil-Auswertungen.
                S.needs_classification.isnot(True),
                # Sportart: für „pumpfoil" zählen auch Altbestände mit NULL mit (die Spalte kam erst
                # 2026-07-27); für jede ANDERE Sportart muss sie ausdrücklich gesetzt sein, sonst
                # rutschten unklassifizierte Sessions in fremde Rekorde.
                # sport="all" = KEINE Einschränkung auf die Sportart. Das ist die Liste „was ist neu"
                # (Sessions-Seite): dort sollen alle Aufnahmen auftauchen, egal welcher Sport. Die
                # sportgetrennten Ansichten und alle Rekorde/Bestenlisten fragen weiterhin EINE
                # Sportart ab — hier faellt also nur die Sport-Bedingung weg, alle anderen Filter
                # (gelöscht, gemeldet, unklassifiziert, Datenmüll, laufende Aufnahme) bleiben.
                (true() if sport == "all" else
                 (or_(S.sport_class.is_(None), S.sport_class == "pumpfoil")
                  if sport == "pumpfoil" else (S.sport_class == sport))),
                or_(S.data_quality.is_(None), S.data_quality == "ok"))
    )
    if accel_only:
        q = q.filter(AR.detection == "model")
    else:
        # Auch GPS-only, aber nur wenn On-Foil erkannt wurde (mind. ein Lauf) —
        # reine GPS-Fahrten ohne Foiling sollen Rekorde/Spots nicht verwässern.
        q = q.filter(or_(AR.detection == "model", AR.num_runs > 0))
    return q


def _brief(fdist, max_speed, num_runs, sid, ts, uname, place, avatar, caption=None, track_preview=None,
           foil_id=None, author_created_at=None, device_id=None, ended=None, youtube=None,
           stab_id=None, board_id=None, mast_len_cm=None, owner_id=None, sport_class=None,
           lat=None, lon=None) -> dict:
    return {
        "session_id": sid,
        "started_at": ts.isoformat() if ts else None,
        "ended_at": ended.isoformat() if ended else None,
        "tz": tz_name(lat, lon),   # Uhrzeiten in Spot-Ortszeit anzeigen
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
        # Setup der Session; None-Werte heissen "nicht gesetzt" -> dann greift der Standard des
        # BESITZERS, den _attach_social nachlaedt. Ergebnis steht in "setup" (None = nichts da).
        "stab_id": stab_id, "board_id": board_id, "mast_len_cm": mast_len_cm, "owner_id": owner_id,
        # Sportart der Session — die Liste "was ist neu" zeigt alle Sportarten, die Karte
        # kennzeichnet daher, wenn es KEIN Pumpfoilen war. None/pumpfoil = kein Hinweis.
        "sport_class": sport_class,
        "setup": None,
        "video_url": None,     # erstes Video jeder Plattform (nur anzeige-fähige Clients, _attach_first_video)
    }


def _attach_first_video(db: Session, items: list[dict], request: Request) -> list[dict]:
    """Setzt item['video_url'] = erstes Video (JEDE Plattform) der Session — nur für anzeige-
    fähige Clients (Web/App>=Min). YouTube liegt ohnehin im youtube_url-Spiegel; das hier
    liefert dem Listen-Indikator auch IG/TikTok. Batch, kein N+1."""
    if not items or not client_wants_all_videos(request):
        return items
    ids = [it["session_id"] for it in items]
    first: dict[int, str] = {}
    for sid, vurl in (db.query(models.SessionVideo.session_id, models.SessionVideo.youtube_url)
                      .filter(models.SessionVideo.session_id.in_(ids), models.SessionVideo.blocked.isnot(True))
                      .order_by(models.SessionVideo.id).all()):
        first.setdefault(sid, vurl)
    for it in items:
        it["video_url"] = first.get(it["session_id"])
    return items


# ----------------------------------------------------------------- Feed/Spots ----
@router.get("/sessions")
def community_sessions(
    request: Request,
    limit: int = 20, offset: int = 0,
    name: str | None = Query(None), spot: str | None = Query(None), accel_only: bool = True,
    sport: str = "pumpfoil",
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Feed: community-sichtbare Sessions, neueste zuerst, echte SQL-Paginierung.
    Optional gefiltert nach Anzeigename (Teiltreffer) und/oder Spot."""
    q = _community(db.query(*BRIEF_COLS), user.id, accel_only, sport)
    if name:
        q = q.filter(func.lower(U.display_name).like(f"%{name.lower()}%"))
    if spot:
        q = q.filter(_spot_cond(spot))
    rows = q.order_by(S.started_at.desc()).offset(max(offset, 0)).limit(min(max(limit, 1), 100)).all()
    return _attach_first_video(db, _attach_social(db, user, [_brief(*r) for r in rows]), request)


@spot_router.get("/spot-sessions")
def spot_sessions(
    request: Request,
    spot: str, limit: int = 50, offset: int = 0, accel_only: bool = True,
    sport: str = "pumpfoil",
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        _community(db.query(*BRIEF_COLS), user.id, accel_only, sport).filter(_spot_cond(spot))
        .order_by(S.started_at.desc())
        .offset(max(offset, 0)).limit(min(max(limit, 1), 100)).all()
    )
    return _attach_first_video(db, _attach_social(db, user, [_brief(*r) for r in rows]), request)


# Extra-Spalten fürs Tages-Gruppen-Aggregat (Σ On-Foil-Zeit + Σ Pumps): _brief liefert die
# nicht mit, darum hinten anhängen und beim Entpacken abschneiden.
GROUP_EXTRA = (S.user_id, AR.foiling_time_s, AR.pump_count)
# Sicherheits-Obergrenze fürs Voll-Scannen beim Gruppieren (Python-seitig, s.u.).
_GROUP_SCAN_CAP = 6000


def _local_date(ts, lat, lon) -> str:
    """Kalendertag der Session in SPOT-Ortszeit (Gruppen-Schlüssel). '' wenn ts fehlt."""
    if ts is None:
        return ""
    return ts.astimezone(tz_of(lat, lon)).date().isoformat()


@router.get("/sessions-grouped")
def sessions_grouped(
    request: Request,
    limit: int = 20, offset: int = 0,
    name: str | None = Query(None), spot: str | None = Query(None), accel_only: bool = True,
    sport: str = "pumpfoil",
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Feed/Spot mit TAGES-GRUPPIERUNG (rein anzeige-seitig, ändert keine Daten/Rekorde):
    Sessions eines Nutzers am selben Kalendertag (Spot-Ortszeit) + selben Spot werden zu EINER
    Gruppe gebündelt. Paginierung erfolgt in GRUPPEN (limit/offset = Gruppen).

    Sortierung: nach der jeweils spätesten Session der Gruppe absteigend — ergibt „neuester Tag
    oben, darin Nutzer-Cluster nach letzter Session" (weil started_at desc gescannt wird, ist die
    Einfüge-Reihenfolge bereits genau diese). Einzel-Session-Gruppen (count=1) rendert der Client
    als normale Kachel mit Direkt-Link; ab count≥2 als aufklappbares Akkordeon."""
    q = _community(db.query(*BRIEF_COLS, *GROUP_EXTRA), user.id, accel_only, sport)
    if name:
        q = q.filter(func.lower(U.display_name).like(f"%{name.lower()}%"))
    if spot:
        q = q.filter(_spot_cond(spot))
    rows = q.order_by(S.started_at.desc()).limit(_GROUP_SCAN_CAP + 1).all()
    truncated = len(rows) > _GROUP_SCAN_CAP
    if truncated:
        rows = rows[:_GROUP_SCAN_CAP]
        log.warning("sessions-grouped: Scan-Cap %d erreicht (name=%r spot=%r) — älteste Gruppen fehlen evtl.",
                    _GROUP_SCAN_CAP, name, spot)

    nb = len(BRIEF_COLS)
    groups: dict[tuple, dict] = {}
    for r in rows:
        brief = _brief(*r[:nb])
        uid, ftime, pumps = r[nb], r[nb + 1], r[nb + 2]
        ts = r[4]                      # S.started_at (Position in BRIEF_COLS)
        lat, lon = r[nb - 2], r[nb - 1]  # place_lat, place_lon (letzte zwei BRIEF_COLS)
        # Schlüssel = (Nutzer, Kalendertag in Ortszeit) — bewusst OHNE Spot: alle Sessions eines
        # Nutzers an einem Tag ergeben EINE Zeile, auch über mehrere Spots hinweg (Jans Vorgabe).
        key = (uid, _local_date(ts, lat, lon))
        g = groups.get(key)
        if g is None:
            g = {
                "kind": "group", "user_id": uid, "name": brief["name"],
                "avatar_url": brief["avatar_url"], "author_new": brief["author_new"],
                "date": key[1], "spot": None, "tz": brief["tz"],
                "count": 0, "foiling_km": 0.0, "foiling_time_s": 0.0,
                "pump_count": 0, "max_speed_mps": None, "track_previews": [],
                "_spots": [], "sessions": [],
            }
            groups[key] = g
        g["sessions"].append(brief)
        if brief["spot"] and brief["spot"] not in g["_spots"]:
            g["_spots"].append(brief["spot"])
        g["count"] += 1
        g["foiling_km"] = round(g["foiling_km"] + (brief["foiling_km"] or 0), 2)
        g["foiling_time_s"] += float(ftime or 0)
        g["pump_count"] += int(pumps or 0)
        if brief["max_speed_mps"] is not None:
            g["max_speed_mps"] = max(g["max_speed_mps"] or 0, brief["max_speed_mps"])

    page = list(groups.values())[max(offset, 0): max(offset, 0) + min(max(limit, 1), 100)]
    # Spot-Label finalisieren: ein Spot -> Name; mehrere -> mit „ · " verkettet; keiner -> None.
    for g in page:
        spots = g.pop("_spots", [])
        g["spot"] = spots[0] if len(spots) == 1 else (" · ".join(spots) if spots else None)
    # Social/Video nur für die tatsächlich ausgelieferten Sessions dieser Seite anheften.
    flat = [s for g in page for s in g["sessions"]]
    _attach_first_video(db, _attach_social(db, user, flat), request)
    _attach_group_preview(db, page)
    return page


def _attach_group_preview(db: Session, groups: list[dict]) -> None:
    """Setzt g['track_previews'] für Mehrfach-Gruppen = Kombi-Minimap(s) der Läufe.

    EINE Karte je Spot der Gruppe (jeweils für sich normalisiert). Bei einem Spot (Normalfall)
    also genau eine Karte; bei mehreren Spots eine pro Spot — sonst würden weit auseinander-
    liegende Spots in einem gemeinsamen Rahmen zu unsichtbaren Klecksen kollabieren.
    Quelle: gespeichertes track_geojson + segments_json je Session (kein GPS-Datei-Load)."""
    import json as _json
    from ..analysis.preview import build_multi_track_preview

    multi = [g for g in groups if g["count"] >= 2]
    if not multi:
        return
    ids = [s["session_id"] for g in multi for s in g["sessions"]]
    geo: dict[int, tuple] = {}
    for sid, tgj, segs in (db.query(AR.session_id, AR.track_geojson, AR.segments_json)
                           .filter(AR.session_id.in_(ids)).all()):
        coords = None
        if tgj:
            try:
                coords = (_json.loads(tgj) or {}).get("geometry", {}).get("coordinates")
            except ValueError:
                coords = None
        segments = None
        if segs:
            try:
                segments = _json.loads(segs)
            except ValueError:
                segments = None
        geo[sid] = (coords, segments)
    for g in multi:
        # Sessions nach Spot bündeln (Reihenfolge des ersten Auftretens beibehalten).
        by_spot: dict[str, list] = {}
        for s in g["sessions"]:
            by_spot.setdefault(s["spot"] or "", []).append(s)
        previews = []
        for sess in by_spot.values():
            pairs = [geo.get(s["session_id"], (None, None)) for s in sess]
            p = build_multi_track_preview([q for q in pairs if q[0] and q[1]])
            if p:
                previews.append(p)
        g["track_previews"] = previews


# --------------------------------------------------------------------- Records ----
_EMPTY_REC = {"session_id": None, "value": 0.0, "started_at": None, "run_idx": None,
              "name": None, "avatar_url": None, "spot": None, "track_preview": None, "tz": None}


def _record_entry(db: Session, metric: str, cut: datetime | None, spot: str | None = None, viewer_id: int | None = None, accel_only: bool = True, sport: str = "pumpfoil", cache: dict | None = None) -> dict:
    if metric in TIME_METRICS:
        return _time_record(db, metric, cut, spot=spot, viewer_id=viewer_id, accel_only=accel_only, sport=sport, cache=cache)
    if metric == "carves180":
        return _carve_record(db, cut, spot=spot, viewer_id=viewer_id, accel_only=accel_only, sport=sport, cache=cache)
    valcol, idxcol = REC_COL[metric]
    idx_sel = idxcol if idxcol is not None else literal(None)
    q = _community(db.query(valcol, idx_sel, S.id, S.started_at, NAME, S.place_name, U.avatar_url, AR.track_preview,
                            S.place_lat, S.place_lon), viewer_id, accel_only, sport)
    q = q.filter(valcol > 0)
    if cut is not None:
        q = q.filter(S.started_at >= cut)
    if spot is not None:
        q = q.filter(_spot_cond(spot))
    row = q.order_by(valcol.desc()).first()
    if row is None:
        return dict(_EMPTY_REC)
    val, idx, sid, ts, name, place, avatar, preview, lat, lon = row
    return {
        "session_id": sid, "value": round(float(val), 2),
        "started_at": ts.isoformat() if ts else None, "run_idx": idx,
        "name": name, "avatar_url": avatar, "spot": place or None, "track_preview": preview or None,
        "tz": tz_name(lat, lon),
    }


def _time_rows(db: Session, spot: str | None, viewer_id: int | None, accel_only: bool, sport: str,
               cache: dict | None) -> list[tuple]:
    """Basisdaten fuer Early Bird / Night Owl: je Community-Session EINE Zeile mit den beiden
    Sekundenwerten seit lokaler Mitternacht, fertig gerechnet.

    Hier lag die Bremse des Rekord-Endpunkts (Jans Messung 18.08.: 747 ms): `_time_record` zog
    fuer JEDE Session den kompletten `segments_json`-Blob und dekodierte ihn in Python -- und das
    zehnmal, weil zwei Zeit-Metriken ueber fuenf Zeitraeume je einzeln liefen. Nachgemessen mit
    cProfile: 3520 `json.loads` = 197 ms, ein Drittel des ganzen Endpunkts, plus zehnmal dieselbe
    schwere Abfrage (12,9 ms/Stk). Der Zeitraum aendert an den Sekundenwerten nichts, nur an der
    Auswahl -- also einmal alles laden und je Zeitraum in Python filtern (Schluessel `cache`).
    """
    key = ("time_rows", spot, viewer_id, accel_only, sport)
    if cache is not None and key in cache:
        return cache[key]
    q = _community(db.query(S.id, S.started_at, S.trim_start_ms, S.place_lat, S.place_lon,
                            NAME, S.place_name, U.avatar_url, AR.track_preview,
                            AR.segments_json), viewer_id, accel_only, sport)
    if spot is not None:
        q = q.filter(_spot_cond(spot))
    rows: list[tuple] = []
    for sid, st, trim0, lat, lon, name, place, avatar, preview, segs_json in q.all():
        if st is None or not segs_json:
            continue
        try:
            segs = json.loads(segs_json)
        except (ValueError, TypeError):
            continue
        if not segs:
            continue
        # Segment-Zeiten sind auf den Trim-Beginn re-based -> Offset zurueckrechnen.
        off_ms = (trim0 or 0)
        first_ms = min(float(x.get("t_start_ms") or 0) for x in segs)
        last_ms = max(float(x.get("t_end_ms") or 0) for x in segs)
        tz = tz_of(lat, lon)
        start_loc = (st + timedelta(milliseconds=off_ms + first_ms)).astimezone(tz)
        mitternacht = start_loc.replace(hour=0, minute=0, second=0, microsecond=0)
        end_loc = (st + timedelta(milliseconds=off_ms + last_ms)).astimezone(tz)
        rows.append((
            st, sid, name, place, avatar, preview, tz_name(lat, lon),
            (start_loc - mitternacht).total_seconds(),
            # Night Owl ueber Mitternacht bleibt >24 h (27:04 schlaegt 23:30, zaehlt zum Vortag).
            min(max((end_loc - mitternacht).total_seconds(), 0.0), 2 * 86400.0),
        ))
    if cache is not None:
        cache[key] = rows
    return rows


def _time_record(db: Session, metric: str, cut: datetime | None, spot: str | None = None, viewer_id: int | None = None, accel_only: bool = True, sport: str = "pumpfoil", cache: dict | None = None) -> dict:
    """Early Bird / Night Owl in echter Spot-ORTSZEIT (inkl. Sommerzeit), Python-seitig.

    Wert = Sekunden seit lokaler Mitternacht des Starts. Gerechnet wird auf den LAUF-Zeiten
    (erster Lauf-Start bzw. letztes Lauf-Ende), NICHT auf started_at/ended_at der Aufnahme:
    die Rohzeiten enthalten Anfahrt/Heimweg und ignorieren Trim, ausgeschlossene Fenster und
    die Fremdkraft-Abtrennung — #1328 stand als "Nachteule" da, weil die Aufnahme bis in die
    Nacht lief, obwohl der letzte echte Lauf Stunden frueher endete (Befund Jan, 03.08.).
    Sessions ohne Laeufe halten keinen Zeit-Rekord. Die Sekundenwerte kommen aus _time_rows().

    Gleichstand behaelt die ERSTE Zeile (strikter Vergleich) -- dieselbe Reihenfolge wie vorher,
    weil _time_rows die Zeilen in Abfragereihenfolge sammelt und hier nur gefiltert wird.
    """
    best: tuple | None = None
    for st, sid, name, place, avatar, preview, tzn, eb_val, no_val in _time_rows(
            db, spot, viewer_id, accel_only, sport, cache):
        if cut is not None and st < cut:
            continue
        val = eb_val if metric == "early_bird" else no_val
        better = best is None or (val < best[0] if metric == "early_bird" else val > best[0])
        if better:
            best = (val, sid, st, name, place, avatar, preview, tzn)
    if best is None:
        return dict(_EMPTY_REC)
    val, sid, ts, name, place, avatar, preview, tzn = best
    return {
        "session_id": sid, "value": round(val, 2),
        "started_at": ts.isoformat() if ts else None, "run_idx": None,
        "name": name, "avatar_url": avatar, "spot": place or None, "track_preview": preview or None,
        "tz": tzn,
    }


def _fill_carve_cache(db: Session) -> None:
    """Fehlende `AnalysisResult.carve_*` einmalig nachrechnen — Voraussetzung für den Carve-Rekord.

    Der Cache wurde bisher NUR gefüllt, wenn der Besitzer seine eigene Startseite öffnete
    (`/carve-stats`). Für einen Community-Rekord reicht das nicht: er zählte sonst nur die Nutzer,
    die zufällig eingeloggt waren, und läge systematisch zu niedrig. Gemessen 16.08.: 628 von 1453
    community-sichtbaren Sessions ohne Cache, Nachrechnen 2,3 s für alle 628 (3,6 ms/Session).
    Danach bleibt nur der Zuwachs — `run_analysis` setzt den Cache bei Reanalyse/Trim auf NULL.

    Absichtlich NICHT nach Sportart/Zeitraum gefiltert: der Cache gehört zur Session, nicht zur
    Abfrage, sonst rechnet jede Filterkombination ihren eigenen Teil nach.
    """
    rows = (db.query(S.session_uuid, S.trim_start_ms, S.trim_end_ms, AR)
            .join(AR, AR.session_id == S.id)
            .filter(AR.carve_s.is_(None), S.deleted.isnot(True), S.flagged.isnot(True))
            .all())
    if not rows:
        return
    dirty = False
    for uuid, tstart, tend, ar in rows:
        counts = _count_carves(uuid, tstart, tend, ar.segments_json)
        if counts is None:
            continue
        ar.carve_s, ar.carve_m, ar.carve_l = counts
        dirty = True
    if dirty:
        db.commit()


def _carve_record(db: Session, cut: datetime | None, spot: str | None = None, viewer_id: int | None = None,
                  accel_only: bool = True, sport: str = "pumpfoil", cache: dict | None = None) -> dict:
    """Meiste Carves über 180° im Zeitraum — je NUTZER, nicht je Session (Jans Vorgabe 16.08.).

    „Über 180°" = die gespeicherten Kategorien m (180–360°) + l (>360°); s (90–180°) bleibt draußen.
    Anders als alle übrigen Rekorde ist das eine Summe über den Zeitraum und hängt an keiner
    einzelnen Session — deshalb ohne `session_id`, Datum, Spot und Streckenvorschau. Die Kachel
    zeigt nur Zahl und Nutzer; ohne `session_id` verlinkt sie auch nicht.
    """
    # Einmal je Request statt einmal je Zeitraum: der Cache gehoert zur Session, nicht zur Abfrage,
    # und der Aufruf ist idempotent. Er lief bisher fuenfmal pro Rekord-Seite und stellte viermal
    # nur dieselbe Frage „fehlt noch was?" — gemessen 5x 5,5 ms.
    if cache is None or "carve_cache" not in cache:
        _fill_carve_cache(db)
        if cache is not None:
            cache["carve_cache"] = True
    total = func.coalesce(func.sum(AR.carve_m + AR.carve_l), 0)
    q = _community(db.query(NAME, U.avatar_url, total), viewer_id, accel_only, sport)
    q = q.filter(AR.carve_m.isnot(None))
    if cut is not None:
        q = q.filter(S.started_at >= cut)
    if spot is not None:
        q = q.filter(_spot_cond(spot))
    row = q.group_by(U.id, U.display_name, U.avatar_url).order_by(total.desc()).first()
    if row is None or not row[2]:
        return dict(_EMPTY_REC)
    name, avatar, val = row
    return {**_EMPTY_REC, "value": float(int(val)), "name": name, "avatar_url": avatar}


@router.get("/sports")
def community_sports(
    accel_only: bool = False, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Sportarten, für die es überhaupt etwas zu zeigen gibt: mindestens EIN Lauf, all time
    (Jans Vorgabe — „nur die mit mind. einem lauf all time in der selectbox mit anzeigen").

    Ohne diese Einschränkung stünden neun Kategorien in der Auswahl, von denen acht leer sind.
    Gezählt wird über denselben Community-Filter wie die Rekorde, damit die Auswahl nicht Sportarten
    anbietet, deren Sessions gar nicht sichtbar sind (versteckte Konten, unklassifiziert, Datenmüll).
    """
    # Stillgelegte Kategorien mitzaehlen: sonst verschwinden deren Altbestaende aus jeder
    # Kategorie-Ansicht, sobald eine Kategorie umbenannt/aufgeteilt wird (05.08.: wake ->
    # wakethief/towed/surf_wave). Sie stehen weiter zur Auswahl, solange es dort Laeufe gibt.
    from .sessions import SPORTS, SPORTS_LEGACY
    out = []
    for sp in (*SPORTS, *SPORTS_LEGACY):
        n = (_community(db.query(func.coalesce(func.sum(AR.num_runs), 0)), user.id, accel_only, sp)
             .scalar() or 0)
        if int(n) > 0:
            out.append({"sport": sp, "runs": int(n)})
    return out


@router.get("/records")
def community_records(accel_only: bool = True, sport: str = "pumpfoil", _user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    # EIN Cache fuer den ganzen Request: die Zeit-Metriken teilen sich damit ihre Basisdaten
    # ueber alle fuenf Zeitraeume (s. _time_rows).
    cache: dict = {}
    return {p: {m: _record_entry(db, m, _cutoff(p), viewer_id=_user.id, accel_only=accel_only, sport=sport, cache=cache) for m in METRICS} for p in PERIODS}


@router.get("/start-success")
def start_success(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """PERSÖNLICH: Start-Erfolgsquote je Zeitfenster, ausgerichtet an den TATSÄCHLICH aufgezeichneten
    Läufen: **Erfolg = ein Startversuch, der es als echter Lauf in die Session geschafft hat.**
    total = Zahl der Startversuche (attempts-Preset, start_attempts_json: lockere Erkennung ab ~8 km/h,
    keine Landgänge, erfasst auch kurze Fehlstarts); success = Zahl der kanonischen Läufe (segments_json,
    deckt sich mit dem, was der Nutzer in der Session sieht), gedeckelt auf total. So z. B. 3 Läufe von
    6 Versuchen = 3/6 (nicht 5/6). Fallback ohne attempts-Daten: attempts = Läufe (-> 100 %). Keine
    DB-Writes, beeinflusst keine anderen Stats."""
    import json as _json
    cuts = {p: _cutoff(p) for p in PERIODS}
    agg = {p: [0, 0] for p in PERIODS}   # [total_attempts, success_runs]
    rows = (db.query(S.started_at, AR.start_attempts_json, AR.segments_json)
            .join(AR, AR.session_id == S.id)
            .filter(S.user_id == user.id, S.deleted.isnot(True)).all())
    for started_at, attempts_json, segs_json in rows:
        try:
            n_run = len(_json.loads(segs_json) or []) if segs_json else 0
            n_att = len(_json.loads(attempts_json) or []) if attempts_json else n_run  # Fallback: = Läufe
        except Exception:
            continue
        if n_att <= 0:
            continue
        n_succ = n_run if n_run < n_att else n_att   # Erfolg = echte Läufe (auf Versuche gedeckelt)
        sa = started_at
        if sa is not None and sa.tzinfo is None:
            sa = sa.replace(tzinfo=timezone.utc)
        for p, cut in cuts.items():
            if cut is None or (sa is not None and sa >= cut):
                agg[p][0] += n_att
                agg[p][1] += n_succ
    windows = {}
    for p in PERIODS:
        tot, succ = agg[p]
        windows[p] = {"total": tot, "success": succ, "failed": tot - succ,
                      "rate": round(100 * succ / tot) if tot else None}
    # threshold_m nur noch für Client-Kompat (die neue Quote ist lauf-/versuchszahlbasiert, nicht
    # distanzschwellenbasiert). Kann später aus der UI raus.
    return {"threshold_m": 0, "windows": windows}


def _count_carves(uuid: str, tstart, tend, segs_json) -> tuple[int, int, int] | None:
    """Carves einer Session je Kategorie (s=90–180°, m=180–360°, l=>360°) aus GPS zählen.
    Gleiche Erkennung wie /sessions/{id}/carves (getrimmt + Segment-gebunden + Speed-Gate 2,2 m/s).

    `(0, 0, 0)` = sicher keine Carves, `None` = nicht ermittelbar (nicht cachebar). Der Unterschied
    zählt: OHNE SEGMENTE gibt es definitionsgemäß keine Carves — die Erkennung läuft ausschließlich
    innerhalb der Läufe. Das ist kein fehlender Wert, sondern eine 0, und sie gehört in den Cache.
    Gemessen 16.08. über den Bestand: von 628 ungecachten Community-Sessions sind 337 genau dieser
    Fall (0 Segmente), 291 zählbar, KEINE mit fehlendem GPS. Gäbe man dafür None zurück, würden
    diese 337 bei jedem Aufruf neu geprüft und blieben ewig ungecacht."""
    import json as _json
    import numpy as np
    from .. import storage
    from .sessions import _turn_events, _hav_m
    if not segs_json:
        return (0, 0, 0)
    try:
        segs = _json.loads(segs_json)
    except Exception:
        return None
    if not segs:
        return (0, 0, 0)
    try:
        gps = storage.load_gps(uuid)
    except Exception:
        return None
    lo = tstart if tstart is not None else (gps[0][0] if gps else 0)
    hi = tend if tend is not None else (gps[-1][0] if gps else 0)
    gps = [r for r in gps if lo <= r[0] <= hi]
    if len(gps) < 4:
        return None
    lat = np.array([r[1] for r in gps]); lon = np.array([r[2] for r in gps])
    t = np.array([r[0] for r in gps], dtype=float)
    nlast = len(gps) - 1

    def mps(a, b):
        dt = (t[b] - t[a]) / 1000.0
        return sum(_hav_m(lat, lon, x, x + 1) for x in range(a, b)) / dt if dt > 0 else 0.0
    sc = mc = lc = 0
    for sg in segs:
        r0 = max(0, sg["i_start"]); r1 = min(sg["i_end"], nlast)
        if r1 - r0 < 2:
            continue
        for c0, c1, rot in _turn_events(lat, lon, r0, r1):
            if mps(c0, c1) < 2.2:
                continue
            m = abs(rot)
            if m < 180:
                sc += 1
            elif m < 360:
                mc += 1
            else:
                lc += 1
    return sc, mc, lc


@router.get("/carve-stats")
def carve_stats(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """PERSÖNLICH: Carve-Anzahl je Grad-Kategorie (s=90–180°, m=180–360°, l=>360°) je Zeitfenster.
    Die drei Zahlen je Session werden gecacht (AnalysisResult.carve_*), NULL = einmalig aus GPS
    berechnet + gespeichert (Kategorien sind fix, kein User-Setting). run_analysis/Trim setzt den
    Cache zurück. Nicht in Community-Rekorde."""
    cuts = {p: _cutoff(p) for p in PERIODS}
    agg = {p: [0, 0, 0] for p in PERIODS}
    rows = (db.query(S.started_at, S.session_uuid, S.trim_start_ms, S.trim_end_ms,
                     AR.segments_json, AR)
            .join(AR, AR.session_id == S.id)
            .filter(S.user_id == user.id, S.deleted.isnot(True)).all())
    dirty = False
    for started_at, uuid, tstart, tend, segs_json, ar in rows:
        if ar.carve_s is None:
            counts = _count_carves(uuid, tstart, tend, segs_json)
            if counts is None:
                continue
            ar.carve_s, ar.carve_m, ar.carve_l = counts
            dirty = True
        sc, mc, lc = ar.carve_s, ar.carve_m, ar.carve_l
        if sc + mc + lc == 0:
            continue
        sa = started_at
        if sa is not None and sa.tzinfo is None:
            sa = sa.replace(tzinfo=timezone.utc)
        for p, cut in cuts.items():
            if cut is None or (sa is not None and sa >= cut):
                agg[p][0] += sc; agg[p][1] += mc; agg[p][2] += lc
    if dirty:
        db.commit()
    return {"windows": {p: {"s": agg[p][0], "m": agg[p][1], "l": agg[p][2]} for p in PERIODS}}


@spot_router.get("/spot-records")
def spot_records(
    spot: str, period: str = "all", accel_only: bool = True, sport: str = "pumpfoil",
    _user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    cut = _cutoff(period)
    cache: dict = {}   # s. _time_rows: Early Bird + Night Owl teilen sich die Basisdaten
    return {m: _record_entry(db, m, cut, spot=spot, viewer_id=_user.id, accel_only=accel_only, sport=sport, cache=cache)
            for m in METRICS}


# ------------------------------------------------------------------- Leaders ----
@router.get("/leaders")
def leaders(period: str = "all", accel_only: bool = True, sport: str = "pumpfoil", _user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    cut = _cutoff(period)
    q = _community(db.query(
        NAME, U.avatar_url,
        func.count(S.id), func.coalesce(func.sum(AR.num_runs), 0),
        func.count(func.distinct(func.nullif(S.place_name, ""))),
        func.coalesce(func.sum(AR.pump_count), 0),
    ), _user.id, accel_only, sport)
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
        db.query(P.id, P.url, P.created_at, P.session_id, S.started_at, NAME, U.avatar_url, S.place_name, S.caption,
                 S.place_lat, S.place_lon)
        .select_from(P).join(S, P.session_id == S.id).join(U, S.user_id == U.id)
        .filter(P.blocked.isnot(True), *_vis)
        .order_by(P.id.desc()).limit(80).all()
    )
    seenp: set[int] = set()
    for pid, url, cts, sid, sts, name, avatar, place, caption, lat, lon in prows:
        if sid in seenp:
            continue
        seenp.add(sid)
        items.append({"kind": "photo", "_ts": cts or sts, "photo_id": pid, "url": url,
                      "thumb_url": _thumb(url), "youtube_url": None,
                      "session_id": sid, "started_at": sts.isoformat() if sts else None, "name": name,
                      "avatar_url": avatar, "spot": place or None, "caption": caption or None,
                      "tz": tz_name(lat, lon)})

    # Videos: je Session das neueste verlinkte YouTube-Video, nach Verlink-Zeit.
    V = models.SessionVideo
    vrows = (
        db.query(V.youtube_url, V.created_at, V.session_id, S.started_at, NAME, U.avatar_url, S.place_name, S.caption,
                 S.place_lat, S.place_lon)
        .select_from(V).join(S, V.session_id == S.id).join(U, S.user_id == U.id)
        # Nur YouTube im „Neueste Medien"-Feed: nur die haben ein einbettbares Vorschaubild
        # (img.youtube.com). Instagram/TikTok werden auf der Session verlinkt, aber nicht als
        # Feed-Kachel gezeigt (kein Thumbnail ohne Dritt-Skript). *_vis + blocked wie gehabt.
        .filter(V.blocked.isnot(True), V.youtube_url.op("~*")("youtube|youtu\\.be"), *_vis)
        .order_by(V.id.desc()).limit(80).all()
    )
    seenv: set[int] = set()
    for yturl, cts, sid, sts, name, avatar, place, caption, lat, lon in vrows:
        if sid in seenv:
            continue
        seenv.add(sid)
        items.append({"kind": "video", "_ts": cts or sts, "url": None, "youtube_url": yturl,
                      "session_id": sid, "started_at": sts.isoformat() if sts else None, "name": name,
                      "avatar_url": avatar, "spot": place or None, "caption": caption or None,
                      "tz": tz_name(lat, lon)})

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
def spots(accel_only: bool = True, sport: str = "pumpfoil", user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    has_place = (S.place_name.isnot(None), S.place_name != "")
    qual = sorted({p for (p,) in _community(db.query(S.place_name), user.id, accel_only, sport).filter(*has_place).distinct().all()})
    mine_rows = (
        _community(db.query(S.place_name), user.id, accel_only, sport).filter(S.user_id == user.id, *has_place)
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
def spot_map(accel_only: bool = True, sport: str = "all",
             _user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Spots mit repräsentativen Koordinaten (Mittel) + Session-Zahl — für die Karte.

    Gruppiert nach **spot_id**, nicht nach `place_name` (2026-08-20). Vorher lieferte die Karte
    Namens-Gruppen und als Ziel `max(spot_id)` — Etikett und Klickziel meinten damit
    verschiedene Mengen: gemessen gingen bei 19 von 174 Markern Tooltip-Zahl und Klick-Ergebnis
    auseinander. Krassester Fall: eine einzelne Session, deren `place_name` nach einem Rename
    "Kaukajärvi 3" hiess, erschien als EIGENER Marker (Tooltip 1), fuehrte beim Klick aber in den
    Spot "Kaukajärvi" mit 52 Sessions. Der Name eines Spots ist jetzt der Name der Spot-Zeile,
    und der Klick filtert auf dieselbe id.

    Sessions ohne `spot_id` (Altbestand/nicht zugeordnet) behalten eine Namens-Gruppe; ihr Klick
    filtert dann auf `place_name` — dafuer versteht `_spot_cond` beide Formen.
    """
    # `sport="all"` als Default (2026-08-20): alle drei Clients navigieren vom Marker in die
    # Sessions-Liste mit sport=all, die Karte zaehlte aber nur Pumpfoil -> die Tooltip-Zahl war
    # bei sechs Markern kleiner als das, was der Klick zeigte (Bönigen 7 gegen 13). Die Karte ist
    # ausdruecklich Uebersicht ueber alle Aufnahmen, nicht nach Sportart getrennt.
    mit_id = (
        _community(db.query(S.spot_id, func.avg(S.place_lat), func.avg(S.place_lon), func.count()),
                   _user.id, accel_only, sport)
        .filter(S.spot_id.isnot(None), S.place_lat.isnot(None))
        .group_by(S.spot_id).all()
    )
    ohne_id = (
        _community(db.query(S.place_name, func.avg(S.place_lat), func.avg(S.place_lon), func.count()),
                   _user.id, accel_only, sport)
        .filter(S.spot_id.is_(None), S.place_name.isnot(None), S.place_name != "",
                S.place_lat.isnot(None))
        .group_by(S.place_name).all()
    )
    # Name UND Gewaesser: viele Spots heissen nach der Ortschaft und bekommen bei mehreren
    # Stellen am selben Ort einen Zaehler („Berlin 3", „Berlin 4"). Im Dropdown sind die nicht
    # auseinanderzuhalten — mit dem Gewaesser als zweiter Zeile schon (Jan, 24.08.).
    stamm = {sid: (nm, wa) for sid, nm, wa in db.query(
        models.Spot.id, models.Spot.name, models.Spot.water_name)
        .filter(models.Spot.id.in_([sid for sid, *_ in mit_id])).all()} if mit_id else {}
    namen = {sid: v[0] for sid, v in stamm.items()}
    out = [
        {"spot": namen.get(sid) or "", "spot_id": sid, "water": (stamm.get(sid) or (None, None))[1],
         "lat": float(lat), "lon": float(lon), "sessions": int(n)}
        for sid, lat, lon, n in mit_id if lat is not None and lon is not None and namen.get(sid)
    ]
    out += [
        {"spot": name, "spot_id": None, "water": None,
         "lat": float(lat), "lon": float(lon), "sessions": int(n)}
        for name, lat, lon, n in ohne_id if lat is not None and lon is not None
    ]
    # Anzahl der SICHTBAREN Spot-Beschreibungen je Spot mitgeben — daraus baut die Oberflaeche
    # den Filter „nur mit Beschreibung". Absichtlich hier und nicht als Extra-Abfrage je Marker:
    # die Karte laedt einmal, ein Aufruf je Spot waeren ueber 160.
    notes = dict(db.query(models.SpotNote.spot_id, func.count(models.SpotNote.id))
                 .filter(models.SpotNote.hidden.is_(False))
                 .group_by(models.SpotNote.spot_id).all())
    for eintrag in out:
        eintrag["notes"] = int(notes.get(eintrag["spot_id"], 0)) if eintrag["spot_id"] else 0
    return out


@spot_router.get("/spot-compare")
def spot_compare(period: str = "all", accel_only: bool = False,
                 _user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Kennzahlen JE SPOT (für den Spot-Vergleich unter der Karte). Aggregate: Sessions, Läufe,
    Pumps, unterschiedliche Foiler, Foil-Distanz, On-Foil-Zeit. Einzel-Rekorde (von EINER Session/
    einem Lauf gewonnen -> inkl. Rekordhalter): weitester Lauf + Topspeed. Zeitfenster wie die
    Community-Rekorde. accel_only=False (Default) = inkl. GPS-only, passend zur Spot-Karte."""
    cut = _cutoff(period)
    # Aggregate je Spot.
    aq = _community(db.query(
        S.place_name, func.max(S.spot_id),
        func.count(S.id),
        func.coalesce(func.sum(AR.num_runs), 0),
        func.coalesce(func.sum(AR.pump_count), 0),
        func.count(func.distinct(S.user_id)),
        func.coalesce(func.sum(AR.foiling_distance_m), 0.0),
        func.coalesce(func.sum(AR.foiling_time_s), 0.0),
    ), _user.id, accel_only).filter(S.place_name.isnot(None), S.place_name != "")
    if cut is not None:
        aq = aq.filter(S.started_at >= cut)
    agg = {
        name: {
            "spot": name, "spot_id": sid,
            "sessions": int(nses or 0), "runs": int(nruns or 0), "pumps": int(npumps or 0),
            "foilers": int(nfoilers or 0),
            "foiling_km": round((fdist or 0.0) / 1000.0, 1),
            "onfoil_s": int(onfoil or 0),
        }
        for (name, sid, nses, nruns, npumps, nfoilers, fdist, onfoil) in aq.group_by(S.place_name).all()
    }

    # Rekordhalter je Spot (DISTINCT ON place_name -> die Session/der Lauf mit dem Höchstwert).
    def _holders(valcol, idxcol):
        hq = _community(db.query(
            S.place_name, valcol, idxcol, S.id, S.started_at, NAME, S.place_lat, S.place_lon,
        ), _user.id, accel_only).filter(S.place_name.isnot(None), S.place_name != "", valcol > 0)
        if cut is not None:
            hq = hq.filter(S.started_at >= cut)
        hq = hq.distinct(S.place_name).order_by(S.place_name, valcol.desc())
        return {r[0]: r for r in hq.all()}

    lr = _holders(AR.best_distance_m, AR.best_distance_idx)
    ts = _holders(AR.best_speed_mps, AR.best_speed_idx)

    def _rec(store, name, to_val):
        r = store.get(name)
        if not r:
            return None
        _n, val, idx, sid, started, uname, lat, lon = r
        return {
            "value": to_val(val), "session_id": sid, "run_idx": idx,
            "name": uname, "started_at": started.isoformat() if started else None,
            "tz": tz_name(lat, lon),
        }

    for name, a in agg.items():
        a["longest_run"] = _rec(lr, name, lambda v: round(v))
        a["top_speed"] = _rec(ts, name, lambda v: round(v * 3.6, 1))
    return {"spots": list(agg.values())}


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
    # Restliches Setup (Stab/Mast/Board) im Batch. Anders als bei den eigenen Sessions gehoeren die
    # Sessions hier VERSCHIEDENEN Nutzern -> die Standards kommen aus mehreren settings_json, also
    # eine Abfrage ueber die Besitzer und dann zwei ueber Stabs/Boards. Kein N+1.
    oids = {b.get("owner_id") for b in briefs if b.get("owner_id")}
    defaults: dict[int, dict] = {}
    if oids:
        for uid, sj in db.query(models.User.id, models.User.settings_json).filter(
                models.User.id.in_(oids)).all():
            try:
                defaults[uid] = (json.loads(sj) or {}) if sj else {}
            except ValueError:
                defaults[uid] = {}

    def _eff(b: dict, key: str):
        """Wert der Session, sonst Standard des Besitzers."""
        v = b.get(key)
        return v if v is not None else (defaults.get(b.get("owner_id")) or {}).get(key)

    sids2 = {_eff(b, "stab_id") for b in briefs}
    bids2 = {_eff(b, "board_id") for b in briefs}
    smap = {x.id: x for x in db.query(models.Stab).filter(
        models.Stab.id.in_([int(i) for i in sids2 if i])).all()} if any(sids2) else {}
    bmap = {x.id: x for x in db.query(models.Board).filter(
        models.Board.id.in_([int(i) for i in bids2 if i])).all()} if any(bids2) else {}
    for b in briefs:
        setup: dict = {}
        sid2 = _eff(b, "stab_id")
        st = smap.get(int(sid2)) if sid2 else None
        if st is not None:
            setup["stab"] = {"id": st.id, "brand": st.brand, "model": st.model, "size": st.size}
        mast = _eff(b, "mast_len_cm")
        if mast:
            setup["mast_len_cm"] = int(mast)
        bid2 = _eff(b, "board_id")
        bo = bmap.get(int(bid2)) if bid2 else None
        if bo is not None:
            setup["board"] = {"id": bo.id, "name": bo.name}
        b["setup"] = setup or None

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
def session_social(session_id: int, request: Request, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
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
        # IG/TikTok nur an anzeige-fähige Clients (Web/App>=Min) — sonst nur YouTube.
        "videos": filter_videos([{"id": vid, "youtube_url": vurl} for vid, vurl in videos], request),
    }
