"""Sessions zusammenfuehren (Weg A): Rohdaten (GPS+Accel) chronologisch aneinander-
haengen und neu analysieren -> EINE Session mit aggregierten Stats/Laeufen. Zwischen
den Teilen eine kuenstliche Luecke (> GAP_SPLIT_S) -> Laeufe bleiben getrennt. Quellen
werden archiviert (deleted=True, merged_into=Ziel-id), also nicht hart geloescht.
"""
from __future__ import annotations

import math
import uuid as _uuid

import numpy as np
from sqlalchemy.orm import Session as DbSession

from . import models, storage
from .analysis import run_analysis

GAP_MS = 20_000          # Luecke zwischen Teilen (ms) -> Dropout -> Lauf-Trennung
AUTO_MAX_GAP_S = 3600    # Auto-Merge: max. Abstand Ende->Start zweier Teile (1 h)
MAX_GROUP_DIST_KM = 25.0  # Teile muessen am selben Ort sein (sonst kein sinnvoller Merge)


def _latlon(s):
    """Startort einer Session (Spot-Koordinaten des Geocoders). None = unbekannt."""
    if s.place_lat is not None and s.place_lon is not None:
        return (s.place_lat, s.place_lon)
    return None


def _dist_km(a, b) -> float:
    """Haversine (km). Unbekannte Koordinaten -> 0 (nicht blockieren)."""
    if not a or not b:
        return 0.0
    (la1, lo1), (la2, lo2) = a, b
    p1, p2 = math.radians(la1), math.radians(la2)
    dp, dl = math.radians(la2 - la1), math.radians(lo2 - lo1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0 * math.asin(min(1.0, math.sqrt(h)))


def _same_spot(a, b) -> bool:
    """Gleicher Spot? Verschiedene benannte Spots -> nie. Sonst per Koordinaten-
    Naehe (Haversine <= MAX_GROUP_DIST_KM; unbekannte Koordinaten -> erlaubt)."""
    na, nb = (a.place_name or "").strip().lower(), (b.place_name or "").strip().lower()
    if na and nb and na != nb:
        return False
    return _dist_km(_latlon(a), _latlon(b)) <= MAX_GROUP_DIST_KM


def _eligible(s) -> bool:
    """Mergebar ist eine Session nur, wenn sie nicht geloescht/bereits zusammengefuehrt,
    nicht aussortiert (is_pumpfoil) ist UND eine On-Foil-Erkennung hat (num_runs>0)."""
    if s.deleted or s.merged_into is not None:
        return False
    if not s.is_pumpfoil:
        return False
    r = s.result
    return bool(r and (r.num_runs or 0) > 0)


def can_merge(sessions: list[models.Session]) -> tuple[bool, str]:
    if len(sessions) < 2:
        return False, "min. 2 Sessions"
    if len({s.user_id for s in sessions}) > 1:
        return False, "verschiedene Nutzer"
    for s in sessions:
        if s.deleted or s.merged_into is not None:
            return False, "geloeschte/zusammengefuehrte Session"
        if not s.is_pumpfoil:
            return False, "aussortierte Session (kein Pumpfoilen)"
        r = s.result
        if not (r and (r.num_runs or 0) > 0):
            return False, "keine On-Foil-Erkennung"
    # Nur Sessions DERSELBEN Uhr zusammenführen (gleiche device_id). Verhindert das Verschmelzen
    # paralleler Aufnahmen verschiedener Uhren (z. B. Dual-Watch-Experiment) — auch wenn die Raten
    # zufällig gleich wären. None (z. B. importierte Sessions) gilt als eigene Gruppe.
    if len({s.device_id for s in sessions}) > 1:
        return False, "verschiedene Uhren/Geraete"
    if len({s.accel_hz for s in sessions}) > 1 or len({s.accel_scale for s in sessions}) > 1 \
            or len({s.gps_hz for s in sessions}) > 1:
        return False, "unterschiedliche Geraete-Raten"
    if any(not _same_spot(a, b) for a in sessions for b in sessions):
        return False, "Sessions an verschiedenen Spots"
    # Nur Sessions DESSELBEN Tages zusammenführen (wie Web/mergeableIds) — verhindert das
    # versehentliche Verschmelzen unabhängiger Sessions verschiedener Tage.
    days = {s.started_at.astimezone().date() for s in sessions if s.started_at is not None}
    if len(days) > 1:
        return False, "Sessions von verschiedenen Tagen"
    return True, ""


def _trimmed(session) -> tuple[list, np.ndarray]:
    """GPS+Accel einer Session auf ihren Trim zugeschnitten, GPS auf 0 rebased."""
    gps = storage.load_gps(session.session_uuid)
    accel = storage.load_accel(session.session_uuid)
    lo = session.trim_start_ms if session.trim_start_ms is not None else 0
    hi = session.trim_end_ms if session.trim_end_ms is not None else (gps[-1][0] if gps else 0)
    gps = [[p[0] - lo] + list(p[1:]) for p in gps if lo <= p[0] <= hi]
    if accel is not None and accel.shape[0]:
        a0 = max(int(round(lo / 1000.0 * session.accel_hz)), 0)
        a1 = min(int(round(hi / 1000.0 * session.accel_hz)), accel.shape[0])
        accel = accel[a0:a1] if a1 > a0 else accel[0:0]
    return gps, accel


def merge_sessions(db: DbSession, sessions: list[models.Session]) -> models.Session:
    ok, why = can_merge(sessions)
    if not ok:
        raise ValueError(why)
    from datetime import timedelta
    sessions = sorted(sessions, key=lambda s: s.started_at)
    first, last = sessions[0], sessions[-1]
    hz = first.accel_hz

    # Frühestes Anfangs- + spätestes Enddatum über ALLE Quellen (Wall-Clock, nicht die
    # kombinierte lückenbehaftete GPS-Spur). Ende je Quelle mit GPS-Fallback.
    def _src_end(src):
        if src.ended_at is not None:
            return src.ended_at
        if src.started_at is not None:
            lm = storage.gps_last_ms(src.session_uuid)
            if lm:
                return src.started_at + timedelta(milliseconds=lm)
        return None
    starts = [x.started_at for x in sessions if x.started_at is not None]
    ends = [e for e in (_src_end(x) for x in sessions) if e is not None]
    first_start = min(starts) if starts else first.started_at
    last_end = max(ends) if ends else None

    combined_gps: list = []
    accel_parts: list[tuple[int, np.ndarray]] = []
    off_ms = 0
    for s in sessions:
        g, a = _trimmed(s)
        if not g:
            continue
        for row in g:
            combined_gps.append([row[0] + off_ms] + list(row[1:]))
        accel_parts.append((int(round(off_ms / 1000.0 * hz)), a))
        off_ms += int(g[-1][0]) + GAP_MS

    total = max((st + (a.shape[0] if a is not None else 0) for st, a in accel_parts), default=0)
    combined_accel = np.zeros((total, 3), dtype="<i2")
    for st, a in accel_parts:
        if a is not None and a.shape[0]:
            combined_accel[st:st + a.shape[0]] = a

    new_uuid = "merge-" + _uuid.uuid4().hex
    storage.ensure_session_dir(new_uuid)
    storage.save_gps_chunk(new_uuid, 0, combined_gps)
    storage.save_accel_raw(new_uuid, 0, combined_accel.tobytes())

    ns = models.Session(
        session_uuid=new_uuid, user_id=first.user_id, device_id=first.device_id,
        sport=first.sport, started_at=first_start, ended_at=last_end,
        gps_hz=first.gps_hz, accel_hz=hz, accel_scale=first.accel_scale, status="analyzed",
        place_name=first.place_name, place_water=first.place_water,
        place_lat=first.place_lat, place_lon=first.place_lon,
        foil_id=first.foil_id, is_pumpfoil=first.is_pumpfoil,
        mod_ok=any(x.mod_ok for x in sessions),
        youtube_url=next((x.youtube_url for x in sessions if x.youtube_url), None),
    )
    db.add(ns)
    db.flush()
    # Fotos uebernehmen (mit Herkunft fuers Auflösen); Quellen archivieren.
    for s in sessions:
        db.query(models.SessionPhoto).filter_by(session_id=s.id).update(
            {models.SessionPhoto.session_id: ns.id,
             models.SessionPhoto.merged_from_session_id: s.id})
        s.deleted = True
        s.merged_into = ns.id
    db.flush()
    run_analysis(db, ns)
    db.commit()
    return ns


def _end(session) -> "datetime":
    """Effektives Ende = Start + letzter GPS-Zeitstempel (ended_at ist bei Importen leer).
    Kaputtes ended_at (vor Start oder weit hinter dem GPS-Ende) wird ignoriert."""
    from datetime import timedelta
    gps = storage.load_gps(session.session_uuid)
    gps_end = session.started_at + timedelta(milliseconds=(gps[-1][0] if gps else 0))
    if session.ended_at:
        if session.ended_at < session.started_at:
            return gps_end
        if gps and session.ended_at > gps_end + timedelta(hours=1):
            return gps_end
        return session.ended_at
    return gps_end


def unmerge_session(db: DbSession, merged: models.Session) -> list[models.Session]:
    """Zusammenfuehrung aufloesen: Quell-Sessions wiederherstellen (deleted=False,
    merged_into=None), Fotos an ihre Ursprungs-Session zurueck, gemergte Session +
    Analyse + Rohdaten entfernen. -> wiederhergestellte Quellen."""
    import shutil
    sources = (db.query(models.Session)
               .filter(models.Session.merged_into == merged.id).all())
    if not sources:
        raise ValueError("keine Zusammenfuehrung")
    for s in sources:
        s.deleted = False
        s.merged_into = None
    for p in db.query(models.SessionPhoto).filter_by(session_id=merged.id).all():
        p.session_id = p.merged_from_session_id or sources[0].id
        p.merged_from_session_id = None
    db.query(models.AnalysisResult).filter_by(session_id=merged.id).delete()
    db.query(models.Label).filter_by(session_id=merged.id).delete()
    db.query(models.SessionLike).filter_by(session_id=merged.id).delete()
    db.query(models.SessionVote).filter_by(session_id=merged.id).delete()
    try:
        d = storage.session_dir(merged.session_uuid)
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
    except ValueError:
        pass
    db.delete(merged)
    db.commit()
    return sources


def merge_suggestions(db: DbSession, user_id: int) -> list[list[models.Session]]:
    """Gruppen eigener Sessions, die zusammengehoeren koennten: aufeinanderfolgend,
    Luecke Ende<->Start <= 1 h, gleiche Accel-Rate. Nur Vorschlaege (kein Auto-Merge).
    Neueste Gruppe zuerst."""
    from sqlalchemy.orm import joinedload
    ss = (db.query(models.Session)
          .options(joinedload(models.Session.result))
          .filter(models.Session.user_id == user_id,
                  models.Session.deleted.is_(False),
                  models.Session.merged_into.is_(None),
                  models.Session.is_pumpfoil.is_(True))
          .order_by(models.Session.started_at).all())
    ss = [s for s in ss if _eligible(s)]   # nur On-Foil-erkannte, nicht aussortiert/geloescht
    groups: list[list[models.Session]] = []
    chain: list[models.Session] = []
    for s in ss:
        if not chain:
            chain = [s]; continue
        gap = (s.started_at - _end(chain[-1])).total_seconds()
        if 0 <= gap <= AUTO_MAX_GAP_S and s.device_id == chain[-1].device_id \
                and s.accel_hz == chain[-1].accel_hz and _same_spot(s, chain[-1]):
            chain.append(s)
        else:
            if len(chain) >= 2:
                groups.append(chain)
            chain = [s]
    if len(chain) >= 2:
        groups.append(chain)
    groups.reverse()
    return groups
