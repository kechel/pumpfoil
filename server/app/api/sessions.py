"""Sessions auflisten/anzeigen + Rohdaten + Labels (für Web-Auswertung)."""
from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import timedelta, timezone

import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, storage
from ..analysis import maybe_auto_trim, run_analysis
from ..db import get_db
from ..fitimport import parse_fit_bytes
from ..ml.features import bandpass_fft, magnitude_g
from ..schemas import AnalysisOut, LabelIn, LabelOut, RawDataOut, SessionMetaIn, SessionOut, TrimIn
from .deps import current_user

MAX_FIT_BYTES = 25 * 1024 * 1024  # 25 MB


def _ms(ms: int) -> timedelta:
    return timedelta(milliseconds=ms)


def _fit_bytes_from_upload(data: bytes, filename: str | None) -> bytes:
    """Akzeptiert eine .fit-Datei ODER ein .zip (wie Garmin „Export Original" liefert)
    und gibt die FIT-Bytes zurück."""
    is_zip = data[:2] == b"PK" or (filename or "").lower().endswith(".zip")
    if not is_zip:
        return data
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid ZIP file")
    fits = [n for n in zf.namelist() if n.lower().endswith(".fit")]
    if not fits:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No .fit file inside ZIP")
    return zf.read(fits[0])

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

_VALID_LABELS = {"pump", "glide", "not_foiling"}


def _analysis_out(result: models.AnalysisResult | None, slim: bool = False) -> AnalysisOut | None:
    """slim=True lässt die großen JSON-Blobs (Track/Segmente/Accel-Fenster) weg —
    für die Listenansicht, die nur Kennzahlen braucht."""
    if result is None:
        return None
    return AnalysisOut(
        algo_version=result.algo_version,
        total_distance_m=result.total_distance_m,
        foiling_distance_m=result.foiling_distance_m,
        foiling_time_s=result.foiling_time_s,
        max_speed_mps=result.max_speed_mps,
        pump_count=result.pump_count,
        avg_cadence_hz=result.avg_cadence_hz,
        metrics=json.loads(result.metrics_json) if result.metrics_json else None,
        track_geojson=None if slim else (json.loads(result.track_geojson) if result.track_geojson else None),
        segments=None if slim else (json.loads(result.segments_json) if result.segments_json else None),
        accel_windows=None if slim else (
            json.loads(result.accel_windows_json) if result.accel_windows_json else None
        ),
    )


def _session_out(s: models.Session, with_analysis: bool, slim: bool = False, owned: bool = True,
                 owner_name: str | None = None, owner_avatar_url: str | None = None) -> SessionOut:
    return SessionOut(
        id=s.id,
        session_uuid=s.session_uuid,
        sport=s.sport,
        started_at=s.started_at,
        ended_at=s.ended_at,
        status=s.status,
        trim_start_ms=s.trim_start_ms,
        trim_end_ms=s.trim_end_ms,
        owned=owned,
        owner_name=owner_name,
        owner_avatar_url=owner_avatar_url,
        place_name=s.place_name or None,
        caption=s.caption or None,
        youtube_url=s.youtube_url or None,
        track_preview=(s.result.track_preview if s.result else None),
        analysis=_analysis_out(s.result, slim=slim) if with_analysis else None,
    )


def _owned(db, user, session_id) -> models.Session:
    s = db.get(models.Session, session_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return s


def _readable(db, session_id) -> models.Session:
    """Lesezugriff für jeden eingeloggten Nutzer (Community-Ansicht, read-only)."""
    s = db.get(models.Session, session_id)
    if s is None or s.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return s


# FIT-Sport-Strings, die als Wassersport gelten (für water_only-Bulk-Import).
_WATER_SPORTS = {
    "surfing", "windsurfing", "kitesurfing", "wakeboarding", "wakesurfing",
    "sailing", "stand_up_paddleboarding", "paddling", "rowing", "kayaking",
    "open_water", "water_skiing", "foiling", "pumpfoil",
}


@router.post("/upload-fit")
async def upload_fit(
    file: UploadFile = File(...),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
    min_start: str | None = None,
    water_only: bool = False,
):
    """Vorhandene Garmin-FIT-Datei importieren: GPS+Puss parsen, als Session anlegen,
    Rohdaten speichern und analysieren. (Beschleunigung ist in Standard-FITs nicht enthalten.)

    Bulk-Import-Filter (optional): min_start='YYYY-MM-DD' überspringt ältere, water_only=true
    überspringt Nicht-Wassersport. Übersprungen -> {"skipped": grund} statt Session."""
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file")
    if len(data) > MAX_FIT_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large")

    fit_data = _fit_bytes_from_upload(data, file.filename)

    try:
        parsed = parse_fit_bytes(fit_data)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    samples = parsed["gps_samples"]
    started_at = parsed["started_at"]
    if not samples or started_at is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No GPS records found in FIT")

    # Bulk-Filter VOR der Dup-Prüfung -> Skip-Entscheidung unabhängig vom Import-Stand.
    sport = parsed["sport"]
    if min_start:
        from datetime import datetime as _dt
        try:
            cut = _dt.fromisoformat(min_start)
        except ValueError:
            cut = None
        if cut and started_at.replace(tzinfo=None) < cut.replace(tzinfo=None):
            return {"skipped": "before_cutoff", "sport": sport, "started_at": started_at.isoformat()}
    if water_only and sport not in _WATER_SPORTS:
        return {"skipped": "not_water", "sport": sport, "started_at": started_at.isoformat()}

    # Duplikat-Erkennung: gleicher Hash ODER gleiche Startzeit (ms-genau, pro Nutzer
    # eindeutig je Aktivität) -> bestehende Session zurück. started_at macht den
    # FIT-Import idempotent, auch wenn content_hash mal nicht passt.
    import hashlib

    content_hash = hashlib.sha256(fit_data).hexdigest()
    existing = (
        db.query(models.Session)
        .filter(
            models.Session.user_id == user.id,
            (models.Session.content_hash == content_hash)
            | (models.Session.started_at == started_at),
        )
        .first()
    )
    if existing is not None:
        if existing.deleted:  # bewusst gelöschte Aktivität nicht wieder importieren
            return {"skipped": "deleted", "sport": sport, "started_at": started_at.isoformat()}
        return _session_out(existing, with_analysis=True)

    accel_bytes = parsed["accel_bytes"]
    accel_hz = parsed["accel_hz"] or 25
    session_uuid = "fit-" + uuid.uuid4().hex
    last_ms = samples[-1][0]
    s = models.Session(
        session_uuid=session_uuid,
        user_id=user.id,
        content_hash=content_hash,
        sport=parsed["sport"],
        started_at=started_at,
        ended_at=started_at + _ms(last_ms),
        gps_hz=1,
        accel_hz=accel_hz,
        status="complete",
        total_chunks=1,
    )
    db.add(s)
    db.commit()
    db.refresh(s)

    storage.write_meta(session_uuid, {
        "session_uuid": session_uuid,
        "started_at": started_at,
        "sport": parsed["sport"],
        "gps_hz": 1,
        "accel_hz": accel_hz,
        "accel_scale": s.accel_scale,
        "source": "fit-upload",
    })
    storage.save_gps_chunk(session_uuid, 0, samples)
    if accel_bytes:
        storage.save_accel_raw(session_uuid, 0, accel_bytes)
    # foil_status als optionale Ground-Truth mitspeichern (für späteres Retraining).
    foil = parsed.get("foil_status") or []
    if any(v is not None for v in foil):
        storage.save_foil_status(session_uuid, foil)

    run_analysis(db, s)
    if maybe_auto_trim(db, s):  # Heimfahrt o.ä. vor/nach der Session wegschneiden
        run_analysis(db, s)
    db.refresh(s)
    from ..notify import notify_session_analyzed
    notify_session_analyzed(db, s)
    return _session_out(s, with_analysis=True)


def _month_bounds(month: str):
    """'YYYY-MM' -> (start, exclusive_end) als datetime (DB-agnostisch)."""
    from datetime import datetime

    y, m = (int(x) for x in month.split("-")[:2])
    start = datetime(y, m, 1)
    end = datetime(y + 1, 1, 1) if m == 12 else datetime(y, m + 1, 1)
    return start, end


@router.get("", response_model=list[SessionOut])
def list_sessions(
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
    limit: int | None = None,
    offset: int = 0,
    month: str | None = None,
    filter: str = "pump",
) -> list[SessionOut]:
    """Ohne limit: alle (für Gesamt-Stats/Nachbarnavigation). Mit limit/offset:
    seitenweise (Infinite-Scroll). Optionaler Monatsfilter 'YYYY-MM'.
    filter='pump' (Default): nur Pumpfoilen; 'other': nur Aussortierte (kein Pumpfoil)."""
    # slim-Liste: result eager mitladen, aber die großen TEXT-Blobs (Track/Segmente/
    # Accel) NICHT — sonst zieht jeder Listeneintrag den ganzen GPS-Track aus der DB.
    q = db.query(models.Session).options(
        joinedload(models.Session.result).defer(models.AnalysisResult.track_geojson)
        .defer(models.AnalysisResult.segments_json)
        .defer(models.AnalysisResult.accel_windows_json)
    ).filter(models.Session.user_id == user.id, models.Session.deleted.isnot(True))
    q = q.filter(models.Session.is_pumpfoil.is_(True) if filter != "other"
                 else models.Session.is_pumpfoil.isnot(True))
    if month:
        try:
            start, end = _month_bounds(month)
            q = q.filter(models.Session.started_at >= start, models.Session.started_at < end)
        except (ValueError, IndexError):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "month must be YYYY-MM")
    q = q.order_by(models.Session.started_at.desc())
    if offset:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    rows = q.all()
    outs = [_session_out(s, with_analysis=True, slim=True) for s in rows]
    # Vorschaubilder (neuestes Foto je Session) in einem Rutsch nachladen (kein N+1).
    ids = [s.id for s in rows]
    if ids:
        thumb: dict[int, str] = {}
        count: dict[int, int] = {}
        for sid, url in (
            db.query(models.SessionPhoto.session_id, models.SessionPhoto.url)
            .filter(models.SessionPhoto.session_id.in_(ids), models.SessionPhoto.blocked.isnot(True))
            .order_by(models.SessionPhoto.id.desc()).all()
        ):
            count[sid] = count.get(sid, 0) + 1
            thumb.setdefault(sid, url)  # erstes = neuestes (id desc)
        likes = dict(
            db.query(models.SessionLike.session_id, func.count())
            .filter(models.SessionLike.session_id.in_(ids)).group_by(models.SessionLike.session_id).all()
        )
        mine = {sid for (sid,) in db.query(models.SessionLike.session_id)
                .filter(models.SessionLike.session_id.in_(ids), models.SessionLike.user_id == user.id).all()}
        for o in outs:
            o.thumb_url = thumb.get(o.id)
            o.photo_count = count.get(o.id, 0)
            o.like_count = int(likes.get(o.id, 0))
            o.liked = o.id in mine
    return outs


def compute_overall_stats(db: Session, user_id: int, accel_only: bool = True) -> dict:
    """Gesamt-Kennzahlen + Rekorde eines Nutzers (für Self-Stats UND Admin-Nutzer-Stats)."""
    # Nur benötigte Spalten — KEIN track_geojson/accel_windows_json (große TEXT-Spalten).
    rows = (
        db.query(
            models.AnalysisResult.foiling_distance_m, models.AnalysisResult.foiling_time_s,
            models.AnalysisResult.pump_count, models.AnalysisResult.metrics_json,
            models.AnalysisResult.segments_json,
            models.Session.id, models.Session.started_at,
        )
        .join(models.Session, models.AnalysisResult.session_id == models.Session.id)
        .filter(models.Session.user_id == user_id, models.Session.deleted.isnot(True))
        .all()
    )
    tot_dist = tot_time = tot_pumps = tot_runs = 0.0
    n_sessions = 0  # nur Pumpfoil-Sessions zählen
    rec = {k: {"session_id": None, "value": 0.0, "started_at": None, "run_idx": None} for k in ("distance", "duration", "speed", "runs", "glide")}

    def upd(key, value, sid, ts, run_idx=None):
        if value is not None and value > rec[key]["value"]:
            rec[key] = {"session_id": sid, "value": value, "started_at": ts, "run_idx": run_idx}

    for fdist, ftime, pumps, mj, sj, sid, ts in rows:
        metrics = {}
        if mj:
            try:
                metrics = json.loads(mj)
            except ValueError:
                metrics = {}
        # Nur Pumpfoilen zählt — angetriebenes/Nicht-Foil ignorieren.
        if not metrics.get("is_pumpfoil"):
            continue
        n_sessions += 1
        tot_dist += fdist or 0.0
        tot_time += ftime or 0.0
        tot_pumps += pumps or 0
        n_runs = metrics.get("num_segments") or 0
        tot_runs += n_runs
        # Rekorde optional nur aus Sessions mit Accel-Daten (präzise Erkennung).
        if accel_only and metrics.get("detection") != "model":
            continue
        # Rekorde JE LAUF (max. einzelnes Segment) und nur ON-FOIL — NICHT der
        # Session-Maxspeed (der enthielt Nicht-Foiling wie z. B. die Auto-Heimfahrt).
        bd = bdu = bs = bg = (0.0, None)  # (Wert, Lauf-Index) je Rekord
        if sj:
            try:
                for j, seg in enumerate(json.loads(sj)):
                    d = seg.get("distance_m") or 0.0
                    du = seg.get("duration_s") or 0.0
                    sp = seg.get("max_speed_mps") or 0.0
                    gl = seg.get("longest_glide_s") or 0.0
                    if d > bd[0]: bd = (d, j)
                    if du > bdu[0]: bdu = (du, j)
                    if sp > bs[0]: bs = (sp, j)
                    if gl > bg[0]: bg = (gl, j)
            except ValueError:
                pass
        upd("distance", bd[0], sid, ts, bd[1])
        upd("duration", bdu[0], sid, ts, bdu[1])
        upd("speed", bs[0], sid, ts, bs[1])
        upd("runs", float(n_runs), sid, ts)
        upd("glide", bg[0], sid, ts, bg[1])

    return {
        "count": n_sessions,
        "foiling_km": round(tot_dist / 1000.0, 1),
        "foiling_min": round(tot_time / 60.0, 1),
        "pumps": int(tot_pumps),
        "runs_total": int(tot_runs),
        "records": rec,
    }


@router.get("/stats")
def overall_stats(
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
    accel_only: bool = True,
) -> dict:
    return compute_overall_stats(db, user.id, accel_only)


@router.get("/history")
def history(
    user: models.User = Depends(current_user), db: Session = Depends(get_db)
) -> list[dict]:
    """Pro Session (chronologisch) der jeweils beste Lauf je Kennzahl — Grundlage
    für die Verlauf-Kurven (kumulierter Bestwert / 30-Tage-Fenster). Nur Sessions
    mit Beschleunigungsdaten (präzise)."""
    rows = (
        db.query(
            models.AnalysisResult.metrics_json, models.AnalysisResult.segments_json,
            models.AnalysisResult.foiling_distance_m, models.AnalysisResult.pump_count,
            models.Session.id, models.Session.started_at,
        )
        .join(models.Session, models.AnalysisResult.session_id == models.Session.id)
        .filter(models.Session.user_id == user.id, models.Session.deleted.isnot(True))
        .order_by(models.Session.started_at.asc())
        .all()
    )
    out = []
    for mj, sj, fdist, pumpcnt, sid, ts in rows:
        if ts is None:
            continue
        metrics = {}
        if mj:
            try:
                metrics = json.loads(mj)
            except ValueError:
                metrics = {}
        # Verlauf = nur Pumpfoilen (muskelgetrieben). Angetriebenes/Nicht-Foil raus.
        if not metrics.get("is_pumpfoil"):
            continue
        # je Kennzahl Bestwert + Index des ausschlaggebenden Laufs (zum Verlinken).
        best = {"distance": (0.0, None), "duration": (0.0, None), "speed": (0.0, None), "glide": (0.0, None)}
        seg_keys = {"distance": "distance_m", "duration": "duration_s", "speed": "max_speed_mps", "glide": "longest_glide_s"}
        if sj:
            try:
                for j, seg in enumerate(json.loads(sj)):
                    for k, sk in seg_keys.items():
                        v = seg.get(sk) or 0.0
                        if v > best[k][0]:
                            best[k] = (v, j)
            except ValueError:
                pass
        out.append({
            "session_id": sid,
            "started_at": ts.isoformat(),
            "distance": round(best["distance"][0], 1),
            "duration": round(best["duration"][0], 1),
            "speed": round(best["speed"][0], 2),
            "glide": round(best["glide"][0], 2),
            "pump_hz": metrics.get("max_pump_hz"),
            "avg_pump_hz": metrics.get("avg_pump_hz"),
            "avg_speed": round(metrics["avg_speed_mps"], 2) if metrics.get("avg_speed_mps") is not None else None,
            "pumps": int(pumpcnt or 0),
            "runs": int(metrics.get("num_segments") or 0),
            "foiling_km": round((fdist or 0.0) / 1000.0, 2),
            "run_idx": {k: best[k][1] for k in seg_keys},
        })
    return out


@router.get("/months")
def list_months(
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
    filter: str = "pump",
) -> list[dict]:
    """Verfügbare Monate (YYYY-MM) mit Anzahl, neueste zuerst — für den Filter."""
    rows = (
        db.query(models.Session.started_at)
        .filter(models.Session.user_id == user.id, models.Session.deleted.isnot(True),
                models.Session.is_pumpfoil.is_(True) if filter != "other"
                else models.Session.is_pumpfoil.isnot(True))
        .all()
    )
    counts: dict[str, int] = {}
    for (ts,) in rows:
        if ts is None:
            continue
        key = f"{ts.year:04d}-{ts.month:02d}"
        counts[key] = counts.get(key, 0) + 1
    return [{"month": k, "count": counts[k]} for k in sorted(counts, reverse=True)]


@router.get("/{session_id}", response_model=SessionOut)
def get_session(
    session_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    # Admin darf alles sehen (auch gelöschte) — sonst kann er Wiederherstellung nicht beurteilen.
    if user.is_admin:
        s = db.get(models.Session, session_id)
        if s is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    else:
        s = _readable(db, session_id)
    # Gewässer-Name einmalig per OSM auflösen und cachen ("" = nachgeschlagen, nichts).
    if s.place_name is None:
        import numpy as _np

        from ..places import lookup_water_name

        gps = storage.load_gps(s.session_uuid)
        if gps:
            lat = float(_np.median([g[1] for g in gps]))
            lon = float(_np.median([g[2] for g in gps]))
            s.place_name = lookup_water_name(lat, lon) or ""
            s.place_lat = lat
            s.place_lon = lon
            db.commit()
    return _session_out(
        s, with_analysis=True, owned=(s.user_id == user.id),
        owner_name=s.user.display_name if s.user else None,
        owner_avatar_url=s.user.avatar_url if s.user else None,
    )


@router.get("/{session_id}/neighbors")
def session_neighbors(
    session_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Vorherige/nächste EIGENE Pumpfoil-Session (nach Startzeit) — für die Detail-
    Navigation, ohne die ganze Liste zu laden."""
    s = db.get(models.Session, session_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    base = db.query(models.Session.id).filter(
        models.Session.user_id == user.id,
        models.Session.deleted.isnot(True),
        models.Session.is_pumpfoil.is_(True),
    )
    older = base.filter(models.Session.started_at < s.started_at).order_by(models.Session.started_at.desc()).first()
    newer = base.filter(models.Session.started_at > s.started_at).order_by(models.Session.started_at.asc()).first()
    return {"older": older[0] if older else None, "newer": newer[0] if newer else None}


@router.delete("/{session_id}")
def delete_session(
    session_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Soft-Delete der eigenen Session: überall ausgeblendet, aber der Tombstone
    (content_hash/started_at) bleibt -> ein erneuter FIT-Import legt sie nicht wieder an."""
    s = _owned(db, user, session_id)
    s.deleted = True
    db.commit()
    return {"ok": True, "deleted": True}


@router.post("/{session_id}/reanalyze", response_model=SessionOut)
def reanalyze(
    session_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    """Analyse mit der aktuellen Algorithmus-Version neu rechnen (nach Tuning)."""
    s = _owned(db, user, session_id)
    run_analysis(db, s)
    db.refresh(s)
    return _session_out(s, with_analysis=True)


@router.patch("/{session_id}/trim", response_model=SessionOut)
def set_trim(
    session_id: int,
    body: TrimIn,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    """Session zuschneiden (ms ab Start). null/null hebt den Zuschnitt auf. Danach
    wird neu analysiert -> alle Kennzahlen beziehen sich nur auf den gewählten Teil."""
    s = _owned(db, user, session_id)
    a, b = body.trim_start_ms, body.trim_end_ms
    if a is not None and a < 0:
        a = 0
    if a is not None and b is not None and b <= a:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "trim_end_ms must be > trim_start_ms")
    s.trim_start_ms = a
    s.trim_end_ms = b
    db.commit()
    run_analysis(db, s)
    db.refresh(s)
    return _session_out(s, with_analysis=True)


CAPTION_MAX = 30
_YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}


def _clean_youtube(raw: str | None) -> str | None:
    """Leer -> None. Sonst muss es eine YouTube-URL sein (https erzwungen)."""
    from urllib.parse import urlparse

    url = (raw or "").strip()
    if not url:
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    host = (urlparse(url).hostname or "").lower()
    if host not in _YT_HOSTS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nur YouTube-Links erlaubt")
    return "https://" + url.split("://", 1)[1]


@router.patch("/{session_id}/meta", response_model=SessionOut)
def set_meta(
    session_id: int,
    body: SessionMetaIn,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    """Eigene Beschriftung (max 30 Zeichen) + optionale YouTube-URL setzen (nur Besitzer).
    Nur mitgeschickte Felder werden geändert; "" leert das jeweilige Feld."""
    s = _owned(db, user, session_id)
    if body.caption is not None:
        cap = body.caption.strip()
        if len(cap) > CAPTION_MAX:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Beschriftung max. {CAPTION_MAX} Zeichen")
        s.caption = cap or None
    if body.youtube_url is not None:
        from datetime import datetime
        newyt = _clean_youtube(body.youtube_url)
        if newyt and newyt != s.youtube_url:
            s.youtube_added_at = datetime.now(timezone.utc)
        s.youtube_url = newyt
    db.commit()
    db.refresh(s)
    return _session_out(
        s, with_analysis=True,
        owner_name=s.user.display_name if s.user else None,
        owner_avatar_url=s.user.avatar_url if s.user else None,
    )


@router.get("/{session_id}/raw", response_model=RawDataOut)
def get_raw(
    session_id: int,
    accel_downsample: int = 4,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> RawDataOut:
    """Rohdaten für die Labeling-/Chart-Ansicht (kolumnar, kompakt).

    GPS bleibt voll (1 Hz). Accel wird als Magnitude (+ bandpass-gefiltert fürs
    Sichtbarmachen des Pump-Rhythmus) ausgegeben und um accel_downsample reduziert,
    damit der Chart-Payload klein bleibt.
    """
    s = _owned(db, user, session_id)  # Rohdaten nur fürs eigene Labeling (nicht Community)
    gps = storage.load_gps(s.session_uuid)
    gps_t = [int(r[0]) for r in gps]
    gps_speed = [float(r[3]) if len(r) > 3 and r[3] is not None else None for r in gps]
    gps_lat = [round(float(r[1]), 6) if len(r) > 2 and r[1] is not None else None for r in gps]
    gps_lon = [round(float(r[2]), 6) if len(r) > 2 and r[2] is not None else None for r in gps]

    accel = storage.load_accel(s.session_uuid)
    ds = max(int(accel_downsample), 1)
    accel_t: list[int] = []
    accel_mag: list[float] = []
    accel_band: list[float] = []
    fs_eff = float(s.accel_hz) / ds
    if accel.shape[0] > 0:
        mag = magnitude_g(accel, s.accel_scale)
        band = bandpass_fft(mag, float(s.accel_hz), 0.3, 3.0)
        idx = np.arange(0, mag.size, ds)
        accel_t = [int(round(i / float(s.accel_hz) * 1000)) for i in idx]
        accel_mag = [round(float(v), 4) for v in mag[idx]]
        accel_band = [round(float(v), 4) for v in band[idx]]

    return RawDataOut(
        gps_t_ms=gps_t,
        gps_speed_mps=gps_speed,
        gps_lat=gps_lat,
        gps_lon=gps_lon,
        accel_hz_effective=round(fs_eff, 3),
        accel_t_ms=accel_t,
        accel_mag_g=accel_mag,
        accel_band_g=accel_band,
    )


@router.get("/{session_id}/labels", response_model=list[LabelOut])
def list_labels(
    session_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[LabelOut]:
    _owned(db, user, session_id)
    rows = db.query(models.Label).filter_by(session_id=session_id).all()
    return [
        LabelOut(id=r.id, t_start_ms=r.t_start_ms, t_end_ms=r.t_end_ms, label=r.label)
        for r in rows
    ]


@router.post("/{session_id}/labels", response_model=LabelOut)
def add_label(
    session_id: int,
    body: LabelIn,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> LabelOut:
    _owned(db, user, session_id)
    if body.label not in _VALID_LABELS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"label must be one of {_VALID_LABELS}")
    if body.t_end_ms <= body.t_start_ms:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "t_end_ms must be > t_start_ms")
    lbl = models.Label(
        session_id=session_id,
        t_start_ms=body.t_start_ms,
        t_end_ms=body.t_end_ms,
        label=body.label,
    )
    db.add(lbl)
    db.commit()
    db.refresh(lbl)
    return LabelOut(id=lbl.id, t_start_ms=lbl.t_start_ms, t_end_ms=lbl.t_end_ms, label=lbl.label)


@router.delete("/{session_id}/labels/{label_id}")
def delete_label(
    session_id: int,
    label_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    _owned(db, user, session_id)
    lbl = db.get(models.Label, label_id)
    if lbl is None or lbl.session_id != session_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Label not found")
    db.delete(lbl)
    db.commit()
    return {"ok": True}


# --- Fotos (nur Besitzer hochladen/löschen; lesen darf jeder via Community-Social). ---
MAX_PHOTOS_PER_SESSION = 12


@router.get("/{session_id}/photos")
def list_photos(
    session_id: int,
    _user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    _readable(db, session_id)
    rows = (
        db.query(models.SessionPhoto)
        .filter_by(session_id=session_id, blocked=False).order_by(models.SessionPhoto.id).all()
    )
    return [{"id": p.id, "url": p.url} for p in rows]


@router.post("/{session_id}/photos")
async def upload_photo(
    session_id: int,
    file: UploadFile = File(...),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    _owned(db, user, session_id)
    n = db.query(models.SessionPhoto).filter_by(session_id=session_id).count()
    if n >= MAX_PHOTOS_PER_SESSION:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Max. {MAX_PHOTOS_PER_SESSION} Fotos")
    from ..media import ImageError, save_image

    raw = await file.read()
    try:
        url = save_image(raw, subdir="photos", max_dim=1600)
    except ImageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    photo = models.SessionPhoto(session_id=session_id, user_id=user.id, url=url)
    db.add(photo)
    db.commit()
    return {"id": photo.id, "url": photo.url}


@router.delete("/{session_id}/photos/{photo_id}")
def delete_photo(
    session_id: int,
    photo_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    _owned(db, user, session_id)
    photo = db.get(models.SessionPhoto, photo_id)
    if photo is None or photo.session_id != session_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    from ..media import delete_media

    delete_media(photo.url)
    db.delete(photo)
    db.commit()
    return {"ok": True}
