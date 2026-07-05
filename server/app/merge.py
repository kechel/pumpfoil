"""Sessions zusammenfuehren (Weg A): Rohdaten (GPS+Accel) chronologisch aneinander-
haengen und neu analysieren -> EINE Session mit aggregierten Stats/Laeufen. Zwischen
den Teilen eine kuenstliche Luecke (> GAP_SPLIT_S) -> Laeufe bleiben getrennt. Quellen
werden archiviert (deleted=True, merged_into=Ziel-id), also nicht hart geloescht.
"""
from __future__ import annotations

import uuid as _uuid

import numpy as np
from sqlalchemy.orm import Session as DbSession

from . import models, storage
from .analysis import run_analysis

GAP_MS = 20_000          # Luecke zwischen Teilen (ms) -> Dropout -> Lauf-Trennung
AUTO_MAX_GAP_S = 3600    # Auto-Merge: max. Abstand Ende->Start zweier Teile (1 h)


def can_merge(sessions: list[models.Session]) -> tuple[bool, str]:
    if len(sessions) < 2:
        return False, "min. 2 Sessions"
    if len({s.user_id for s in sessions}) > 1:
        return False, "verschiedene Nutzer"
    if len({s.accel_hz for s in sessions}) > 1 or len({s.accel_scale for s in sessions}) > 1 \
            or len({s.gps_hz for s in sessions}) > 1:
        return False, "unterschiedliche Geraete-Raten"
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
    sessions = sorted(sessions, key=lambda s: s.started_at)
    first, last = sessions[0], sessions[-1]
    hz = first.accel_hz

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
        sport=first.sport, started_at=first.started_at, ended_at=last.ended_at,
        gps_hz=first.gps_hz, accel_hz=hz, accel_scale=first.accel_scale, status="analyzed",
        place_name=first.place_name, place_lat=first.place_lat, place_lon=first.place_lon,
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
    """Effektives Ende = Start + letzter GPS-Zeitstempel (ended_at ist bei Importen leer)."""
    from datetime import timedelta
    if session.ended_at:
        return session.ended_at
    gps = storage.load_gps(session.session_uuid)
    return session.started_at + timedelta(milliseconds=(gps[-1][0] if gps else 0))


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
    ss = (db.query(models.Session)
          .filter(models.Session.user_id == user_id,
                  models.Session.deleted.is_(False),
                  models.Session.merged_into.is_(None))
          .order_by(models.Session.started_at).all())
    groups: list[list[models.Session]] = []
    chain: list[models.Session] = []
    for s in ss:
        if not chain:
            chain = [s]; continue
        gap = (s.started_at - _end(chain[-1])).total_seconds()
        if 0 <= gap <= AUTO_MAX_GAP_S and s.accel_hz == chain[-1].accel_hz:
            chain.append(s)
        else:
            if len(chain) >= 2:
                groups.append(chain)
            chain = [s]
    if len(chain) >= 2:
        groups.append(chain)
    groups.reverse()
    return groups
