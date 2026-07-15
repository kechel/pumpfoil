"""Sessions auflisten/anzeigen + Rohdaten + Labels (für Web-Auswertung)."""
from __future__ import annotations

import io
import json
import secrets
import uuid
import zipfile
from datetime import timedelta, timezone

import numpy as np
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import Integer, cast, func, not_, or_
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session, joinedload, object_session

from .. import media, models, storage
from ..analysis import maybe_auto_trim, run_analysis
from ..db import get_db
from ..fitimport import parse_fit_bytes
from ..naming import owner_label
from ..ml.features import bandpass_fft, magnitude_g
from ..schemas import AnalysisOut, LabelIn, LabelOut, PumpTruthIn, RawDataOut, SessionMetaIn, SessionOut, TrimIn
from .deps import current_user, require_social

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
# Öffentlicher (auth-freier) Router — nur der Token-Share-Endpoint. In main.py OHNE Auth eingebunden.
public_router = APIRouter(prefix="/api/public", tags=["public"])

_VALID_LABELS = {"pump", "glide", "not_foiling"}


def _analysis_out(result: models.AnalysisResult | None, slim: bool = False, sens: str = "normal") -> AnalysisOut | None:
    """slim=True lässt die großen JSON-Blobs (Track/Segmente/Accel-Fenster) weg — für die
    Listenansicht. sens != "normal" (nur für den Besitzer): überlagert Foiling-Zeit/-Distanz und
    v. a. die einzelnen LÄUFE (Segmente) mit der gecachten Preset-Auswertung aus sensitivity_json,
    falls vorhanden. Community liest immer die kanonischen (Standard-)Spalten -> unberührt."""
    if result is None:
        return None
    p = None
    if sens != "normal" and result.sensitivity_json:
        try:
            p = (json.loads(result.sensitivity_json) or {}).get(sens)
        except ValueError:
            p = None
    ft = p["foiling_time_s"] if p else result.foiling_time_s
    fd = p["foiling_distance_m"] if p else result.foiling_distance_m
    metrics = json.loads(result.metrics_json) if result.metrics_json else None
    if p and metrics is not None and p.get("num_runs") is not None:
        metrics = {**metrics, "num_segments": p["num_runs"]}
    segments = None
    if not slim:
        segments = p["segments"] if p else (json.loads(result.segments_json) if result.segments_json else None)
    return AnalysisOut(
        algo_version=result.algo_version,
        total_distance_m=result.total_distance_m,
        foiling_distance_m=fd,
        foiling_time_s=ft,
        max_speed_mps=result.max_speed_mps,
        pump_count=result.pump_count,
        avg_cadence_hz=result.avg_cadence_hz,
        metrics=metrics,
        track_geojson=None if slim else (json.loads(result.track_geojson) if result.track_geojson else None),
        segments=segments,
        accel_windows=None if slim else (
            json.loads(result.accel_windows_json) if result.accel_windows_json else None
        ),
    )


def _list_ended_at(s: models.Session):
    """Endzeit für die Anzeige: viele (chunk-hochgeladene) Sessions haben kein ended_at.
    Aus dem letzten GPS-Zeitstempel ableiten (billig, nur letzter Chunk; nicht persistiert)."""
    if s.ended_at is not None or s.started_at is None:
        return s.ended_at
    # Gemergte Session: Ende = Wall-Clock-Ende der LETZTEN Quell-Session — NICHT die
    # kombinierte GPS-Spur (die künstliche Lücken zwischen den Teilen enthält).
    if (s.session_uuid or "").startswith("merge-"):
        db = object_session(s)
        if db is not None:
            ends = []
            for src in db.query(models.Session).filter(models.Session.merged_into == s.id).all():
                if src.ended_at is not None:
                    ends.append(src.ended_at)
                elif src.started_at is not None:
                    lm = storage.gps_last_ms(src.session_uuid)
                    if lm:
                        ends.append(src.started_at + timedelta(milliseconds=lm))
            if ends:
                return max(ends)
    last_ms = storage.gps_last_ms(s.session_uuid)
    return s.started_at + timedelta(milliseconds=last_ms) if last_ms else None


def _session_out(s: models.Session, with_analysis: bool, slim: bool = False, owned: bool = True,
                 owner_name: str | None = None, owner_avatar_url: str | None = None,
                 sens: str | None = None) -> SessionOut:
    return SessionOut(
        id=s.id,
        session_uuid=s.session_uuid,
        sport=s.sport,
        started_at=s.started_at,
        ended_at=_list_ended_at(s),
        status=s.status,
        trim_start_ms=s.trim_start_ms,
        trim_end_ms=s.trim_end_ms,
        data_version=int((getattr(s, "updated_at", None) or s.created_at).timestamp())
                     if (getattr(s, "updated_at", None) or s.created_at) else None,
        owned=owned,
        owner_name=owner_name,
        owner_avatar_url=owner_avatar_url,
        place_name=s.place_name or None,
        place_water=s.place_water or None,
        spot_id=s.spot_id,
        caption=s.caption or None,
        youtube_url=s.youtube_url or None,
        track_preview=(s.result.track_preview if s.result else None),
        foil_id=s.foil_id,
        # Persönlicher Preset-Overlay in ALLEN eigenen Ansichten (Liste + Detail): Läufe/Foil-Zeit/
        # -Distanz aus dem gecachten Preset. `sens` wird vom Aufrufer durchgereicht (Liste: direkt
        # aus dem Nutzer -> kein N+1); sonst aus s.user (Detail-Einzelaufruf). Community = "normal".
        analysis=_analysis_out(
            s.result, slim=slim,
            sens=((sens if sens is not None else (s.user.foil_sensitivity or "normal") if (owned and s.user) else "normal")
                  if (with_analysis and owned) else "normal"),
        ) if with_analysis else None,
    )


def _user_default_foil_id(user: models.User | None) -> int | None:
    """Standard-Foil aus den Nutzer-Einstellungen (settings_json.foil_id)."""
    if user and user.settings_json:
        try:
            return (json.loads(user.settings_json) or {}).get("foil_id")
        except ValueError:
            return None
    return None


def _resolve_foil(db: Session, s: models.Session) -> dict | None:
    """Foil für die Anzeige: explizites Session-Foil, sonst Standard-Foil des Besitzers."""
    fid = s.foil_id
    if fid is None and s.user and s.user.settings_json:
        try:
            fid = (json.loads(s.user.settings_json) or {}).get("foil_id")
        except ValueError:
            fid = None
    if not fid:
        return None
    f = db.get(models.Foil, fid)
    if f is None:
        return None
    ar = round((f.span_cm ** 2) / f.area_cm2, 2) if f.area_cm2 else None
    return {
        "id": f.id, "brand": f.brand, "model": f.model, "size": f.size,
        "span_cm": f.span_cm, "area_cm2": f.area_cm2, "thickness_mm": f.thickness_mm,
        "thickness_estimated": bool(f.thickness_estimated),
        "aspect_ratio": ar, "is_default": s.foil_id is None,
    }


def _apply_pump_filter(q, user, filter: str):
    """Filtert eine Session-Query auf Pumpfoil ('pump') bzw. Aussortierte ('other').
    Für Nutzer mit persönlicher Empfindlichkeit entscheidet sein gecachtes Preset
    (sensitivity_json[preset].num_runs > 0), sonst das globale is_pumpfoil. Fügt bei Bedarf
    einen Outer-Join auf AnalysisResult hinzu (Aufrufer darf danach KEIN zweites Mal joinen)."""
    sens = (user.foil_sensitivity or "normal")
    if sens != "normal":
        q = q.outerjoin(models.AnalysisResult, models.AnalysisResult.session_id == models.Session.id)
        preset_runs = func.coalesce(cast(func.jsonb_extract_path_text(
            cast(models.AnalysisResult.sensitivity_json, JSONB), sens, "num_runs"), Integer), 0)
        is_pump = or_(models.Session.is_pumpfoil.is_(True), preset_runs > 0)
        return q.filter(is_pump if filter != "other" else not_(is_pump)), True
    return q.filter(models.Session.is_pumpfoil.is_(True) if filter != "other"
                    else models.Session.is_pumpfoil.isnot(True)), False


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


def import_parsed_session(db, user, raw: bytes, parsed: dict, *, src_label: str, uuid_prefix: str):
    """Geparsten Track (aus FIT/TCX/GPX) als Session anlegen: Dup-Check (Hash ODER Startzeit,
    pro Nutzer, idempotent) -> Session + Rohdaten -> analysieren. Wiederverwendet von /upload-fit
    UND vom Polar-Import. Rückgabe: Session (neu oder bestehend) oder None (bewusst gelöscht)."""
    import hashlib

    samples = parsed["gps_samples"]
    started_at = parsed["started_at"]
    content_hash = hashlib.sha256(raw).hexdigest()
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
        return None if existing.deleted else existing

    accel_bytes = parsed["accel_bytes"]
    accel_hz = parsed["accel_hz"] or 25
    session_uuid = uuid_prefix + uuid.uuid4().hex
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
        foil_id=_user_default_foil_id(user),   # Standard-Foil fest zuordnen
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
        "source": src_label,
    })
    storage.save_gps_chunk(session_uuid, 0, samples)
    if accel_bytes:
        storage.save_accel_raw(session_uuid, 0, accel_bytes)
    foil = parsed.get("foil_status") or []
    if any(v is not None for v in foil):
        storage.save_foil_status(session_uuid, foil)

    run_analysis(db, s)
    if maybe_auto_trim(db, s):  # Heimfahrt o.ä. vor/nach der Session wegschneiden
        run_analysis(db, s)
    db.refresh(s)
    from ..notify import notify_session_analyzed
    notify_session_analyzed(db, s)
    return s


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

    # Format erkennen: TCX/GPX (XML) vs. FIT/ZIP.
    name = (file.filename or "").lower()
    head = data.lstrip()[:5].lower()
    is_xml = name.endswith((".tcx", ".gpx")) or head.startswith(b"<?xml") or head.startswith(b"<")
    try:
        if is_xml:
            from ..tcximport import parse_track_bytes
            parsed = parse_track_bytes(data, file.filename)
            raw = data
            src_label = "gpx-upload" if name.endswith(".gpx") else "tcx-upload"
            uuid_prefix = "imp-"
        else:
            raw = _fit_bytes_from_upload(data, file.filename)
            parsed = parse_fit_bytes(raw)
            src_label = "fit-upload"
            uuid_prefix = "fit-"
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

    s = import_parsed_session(db, user, raw, parsed, src_label=src_label, uuid_prefix=uuid_prefix)
    if s is None:  # bewusst gelöschte Aktivität nicht wieder importieren
        return {"skipped": "deleted", "sport": sport, "started_at": started_at.isoformat()}
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
    accel_only: bool = False,
) -> list[SessionOut]:
    """Ohne limit: alle (für Gesamt-Stats/Nachbarnavigation). Mit limit/offset:
    seitenweise (Infinite-Scroll). Optionaler Monatsfilter 'YYYY-MM'.
    filter='pump' (Default): nur Pumpfoilen; 'other': nur Aussortierte (kein Pumpfoil).
    accel_only=True: nur Sessions mit präzisem Accel-/Modell-Lauf (sonst auch GPS-only)."""
    # slim-Liste: result eager mitladen, aber die großen TEXT-Blobs (Track/Segmente/
    # Accel) NICHT — sonst zieht jeder Listeneintrag den ganzen GPS-Track aus der DB.
    q = db.query(models.Session).options(
        joinedload(models.Session.result).defer(models.AnalysisResult.track_geojson)
        .defer(models.AnalysisResult.segments_json)
        .defer(models.AnalysisResult.accel_windows_json)
    ).filter(models.Session.user_id == user.id, models.Session.deleted.isnot(True))
    # Persönliche Empfindlichkeit: für den Besitzer entscheidet sein Preset (gecacht in
    # sensitivity_json), ob eine Session als Pumpfoil zählt — nicht nur das globale is_pumpfoil.
    # So taucht z. B. eine Session, die erst mit „attempts" Läufe zeigt, auch in seiner Pump-Liste
    # auf. Global is_pumpfoil bleibt für Community/Rekorde.
    sens = (user.foil_sensitivity or "normal")
    if accel_only or sens != "normal":
        q = q.outerjoin(models.AnalysisResult, models.AnalysisResult.session_id == models.Session.id)
    if sens != "normal":
        preset_runs = func.coalesce(cast(func.jsonb_extract_path_text(
            cast(models.AnalysisResult.sensitivity_json, JSONB), sens, "num_runs"), Integer), 0)
        is_pump = or_(models.Session.is_pumpfoil.is_(True), preset_runs > 0)
        q = q.filter(is_pump if filter != "other" else not_(is_pump))
    else:
        q = q.filter(models.Session.is_pumpfoil.is_(True) if filter != "other"
                     else models.Session.is_pumpfoil.isnot(True))
    if accel_only:
        q = q.filter(models.AnalysisResult.detection == "model")
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
    outs = [_session_out(s, with_analysis=True, slim=True, sens=sens) for s in rows]
    # Eigene Sessions: Besitzer = der anfragende Nutzer -> owner_name/-avatar mitgeben, damit
    # die Apps in Liste + Detail das Profilbild (bzw. Initialen-Kreis) zeigen (wie PWA).
    for o in outs:
        o.owner_name = owner_label(user.display_name, user.id)
        o.owner_avatar_url = user.avatar_url
    # Explizit gewähltes Foil je Session (nur foil_id gesetzt) im Batch — kein N+1.
    fids = {s.foil_id for s in rows if s.foil_id}
    if fids:
        fmap = {f.id: f for f in db.query(models.Foil).filter(models.Foil.id.in_(fids)).all()}
        for o in outs:
            f = fmap.get(o.foil_id) if o.foil_id else None
            if f:
                o.foil = {"id": f.id, "brand": f.brand, "model": f.model, "size": f.size,
                          "aspect_ratio": round((f.span_cm ** 2) / f.area_cm2, 2) if f.area_cm2 else None}
    # Uhr-/Geräte-Bezeichnung je Session im Batch (kein N+1); nur erster Teil vor "/".
    dids = {s.device_id for s in rows if s.device_id}
    if dids:
        dmap = dict(db.query(models.DeviceToken.id, models.DeviceToken.label)
                    .filter(models.DeviceToken.id.in_(dids)).all())
        for o, s in zip(outs, rows):
            lbl = dmap.get(s.device_id) if s.device_id else None
            if lbl:
                o.device_label = lbl.split("/")[0].strip()
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
            thumb.setdefault(sid, media.thumb_url(url))  # erstes = neuestes (id desc); kleines Thumb
        likes = dict(
            db.query(models.SessionLike.session_id, func.count())
            .filter(models.SessionLike.session_id.in_(ids)).group_by(models.SessionLike.session_id).all()
        )
        mine = {sid for (sid,) in db.query(models.SessionLike.session_id)
                .filter(models.SessionLike.session_id.in_(ids), models.SessionLike.user_id == user.id).all()}
        # Offene (ausgehende) Übertragungen dieser Sessions -> Empfängername fürs „Übertragung"-Badge.
        xfer: dict[int, str] = {}
        for sid, name in (
            db.query(models.SessionTransfer.session_id, models.User.display_name)
            .join(models.User, models.User.id == models.SessionTransfer.to_user_id)
            .filter(models.SessionTransfer.session_id.in_(ids),
                    models.SessionTransfer.from_user_id == user.id,
                    models.SessionTransfer.status == "pending").all()
        ):
            xfer[sid] = name or "?"
        for o in outs:
            o.thumb_url = thumb.get(o.id)
            o.photo_count = count.get(o.id, 0)
            o.like_count = int(likes.get(o.id, 0))
            o.liked = o.id in mine
            o.transfer_to = xfer.get(o.id)
    return outs


def compute_overall_stats(db: Session, user_id: int, accel_only: bool = True, sens: str = "normal") -> dict:
    """Gesamt-Kennzahlen + Rekorde eines Nutzers (für Self-Stats UND Admin-Nutzer-Stats).
    sens != "normal" (nur Self-Stats des Besitzers): Foiling/Läufe/Segmente aus dem gecachten
    Preset (sensitivity_json). Admin/Community rufen mit "normal" -> Standard (unberührt)."""
    # Nur benötigte Spalten — KEIN track_geojson/accel_windows_json (große TEXT-Spalten).
    rows = (
        db.query(
            models.AnalysisResult.foiling_distance_m, models.AnalysisResult.foiling_time_s,
            models.AnalysisResult.pump_count, models.AnalysisResult.metrics_json,
            models.AnalysisResult.segments_json, models.AnalysisResult.sensitivity_json,
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

    for fdist, ftime, pumps, mj, sj, senj, sid, ts in rows:
        metrics = {}
        if mj:
            try:
                metrics = json.loads(mj)
            except ValueError:
                metrics = {}
        # Persönliches Preset (falls gesetzt + gecacht): überlagert Foiling/Läufe/Segmente.
        preset = None
        if sens != "normal" and senj:
            try:
                preset = (json.loads(senj) or {}).get(sens)
            except ValueError:
                preset = None
        if preset:
            fdist = preset.get("foiling_distance_m", fdist)
            ftime = preset.get("foiling_time_s", ftime)
            sj = json.dumps(preset.get("segments") or [])
            is_pump = (preset.get("num_runs") or 0) > 0
            n_runs = preset.get("num_runs") or 0
        else:
            is_pump = bool(metrics.get("is_pumpfoil"))
            n_runs = metrics.get("num_segments") or 0
        # Nur Pumpfoilen zählt — angetriebenes/Nicht-Foil ignorieren.
        if not is_pump:
            continue
        n_sessions += 1
        tot_dist += fdist or 0.0
        tot_time += ftime or 0.0
        tot_pumps += pumps or 0
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
    return compute_overall_stats(db, user.id, accel_only, sens=(user.foil_sensitivity or "normal"))


@router.get("/has-accel")
def has_accel(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Hat der Nutzer mind. einen präzisen Accel-/Modell-Lauf? -> steuert den UI-Default
    des accel|alle-Umschalters (accel, wenn Accel-Daten vorhanden; sonst alle)."""
    row = (
        db.query(models.AnalysisResult.id)
        .join(models.Session, models.AnalysisResult.session_id == models.Session.id)
        .filter(models.Session.user_id == user.id, models.Session.deleted.isnot(True),
                models.AnalysisResult.detection == "model")
        .first()
    )
    return {"has_accel": row is not None}


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
    q = db.query(models.Session.started_at).filter(
        models.Session.user_id == user.id, models.Session.deleted.isnot(True))
    q, _ = _apply_pump_filter(q, user, filter)
    rows = q.all()
    counts: dict[str, int] = {}
    for (ts,) in rows:
        if ts is None:
            continue
        key = f"{ts.year:04d}-{ts.month:02d}"
        counts[key] = counts.get(key, 0) + 1
    return [{"month": k, "count": counts[k]} for k in sorted(counts, reverse=True)]


# --- Spot-Entwicklung (Verlauf): eigene Spots + Bulk-Tracks für die Karten-Animation ---
# WICHTIG: vor der /{session_id}-Route definieren, sonst matcht "my-spots"/"spot-tracks"
# als session_id (int) -> 422.
@router.get("/my-spots")
def my_spots(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Alle Gewässer/Spots des Nutzers (ALLE Sessions, auch GPS-only), neueste zuerst."""
    from datetime import datetime
    rows = (
        db.query(models.Session.place_name, func.count(), func.max(models.Session.started_at),
                 func.max(models.Session.spot_id))
        .filter(models.Session.user_id == user.id, models.Session.deleted.isnot(True),
                models.Session.place_name.isnot(None), models.Session.place_name != "")
        .group_by(models.Session.place_name).all()
    )
    rows.sort(key=lambda r: r[2] or datetime.min, reverse=True)
    return [{"spot": p, "count": int(n), "spot_id": sid} for p, n, _, sid in rows]


SPOT_TRACK_MAX_PTS = 150   # je Session herunterrechnen -> Bulk-Payload bleibt klein


@router.get("/spot-tracks")
def spot_tracks(spot: str, user: models.User = Depends(current_user),
                db: Session = Depends(get_db)) -> list[dict]:
    """Alle eigenen Sessions an einem Spot (chronologisch), je als komplette Spur
    [[lat,lon,speed_mps]] (3s-Speed aus track_geojson, heruntergerechnet). Bulk-Load für die
    Verlaufs-Animation — fixer Ausschnitt, keine Optionen; inkl. GPS-only-Sessions."""
    rows = (
        db.query(models.AnalysisResult.track_geojson, models.AnalysisResult.foiling_distance_m,
                 models.Session.id, models.Session.started_at)
        .join(models.Session, models.AnalysisResult.session_id == models.Session.id)
        .filter(models.Session.user_id == user.id, models.Session.deleted.isnot(True),
                (models.Session.spot_id == int(spot)) if str(spot).isdigit()
                else (models.Session.place_name == spot))
        .order_by(models.Session.started_at.asc()).all()
    )
    out = []
    for gj_json, fdist, sid, ts in rows:
        if not gj_json:
            continue
        try:
            gj = json.loads(gj_json)
        except ValueError:
            continue
        coords = (gj.get("geometry") or {}).get("coordinates") or []
        props = gj.get("properties") or {}
        speeds = (props.get("speeds") or {}).get("3") or props.get("speeds_mps") or []
        if len(coords) < 2:
            continue
        stride = max(1, -(-len(coords) // SPOT_TRACK_MAX_PTS))  # ceil-Division
        track = []
        for i in range(0, len(coords), stride):
            c = coords[i]
            sp = speeds[i] if i < len(speeds) else None
            track.append([round(c[1], 6), round(c[0], 6),
                          round(float(sp), 2) if sp is not None else None])
        out.append({
            "session_id": sid, "started_at": ts.isoformat() if ts else None,
            "foiling_km": round((fdist or 0.0) / 1000.0, 2), "track": track,
        })
    return out


def _geocode_place(session_id: int) -> None:
    """Gewässer-Name per OSM (Overpass) auflösen + cachen — als BACKGROUND-Task, damit der
    Session-Endpoint NICHT auf Overpass wartet (is_in kann Sekunden dauern). Eigene DB-Session.
    Punkt = Start des ersten Foiling-Laufs (nah am Ufer/Steg, sicher auf Wasser); Median-Fallback."""
    import numpy as _np

    from ..db import SessionLocal
    from ..spots import assign_one

    db = SessionLocal()
    try:
        s = db.get(models.Session, session_id)
        if s is None or s.place_name is not None:
            return
        gps = storage.load_gps(s.session_uuid)
        if not gps:
            return
        # Repraesentativpunkt (Start des ersten Foiling-Laufs, nah am Ufer) fuer place_lat/lon.
        pt = None
        ar = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
        if ar and ar.segments_json:
            try:
                segs = json.loads(ar.segments_json)
                i0 = segs[0].get("i_start") if segs else None
                if i0 is not None and 0 <= i0 < len(gps):
                    pt = (float(gps[i0][1]), float(gps[i0][2]))
            except ValueError:
                pass
        if pt is None:
            pt = (float(_np.median([g[1] for g in gps])), float(_np.median([g[2] for g in gps])))
        s.place_lat, s.place_lon = pt
        db.commit()
        # Spot-Zuordnung (Track-Ueberlappung) setzt place_name/place_water/spot_id.
        assign_one(db, s)
        if s.place_name:
            _autojoin_spot_chat(db, s.user_id, s.place_name)
    finally:
        db.close()


def _autojoin_spot_chat(db: Session, user_id: int, place_name: str) -> None:
    """Neue Session an einem Spot -> Ersteller automatisch in den Spot-Chat aufnehmen — aber NUR,
    wenn er dort noch nie war (kein ChatRoomState). Wer bewusst verlassen hat (left=True) bleibt
    draußen. last_read_id=0 -> die bestehende Unterhaltung erscheint als ungelesen (Badge)."""
    scope = f"spot:{place_name}"
    exists = db.query(models.ChatRoomState.id).filter_by(user_id=user_id, scope=scope).first()
    if exists is None:
        # push=True: Spot-Chat gleich abonnieren (Benachrichtigungen), bis der Nutzer es abstellt.
        db.add(models.ChatRoomState(user_id=user_id, scope=scope, left=False, last_read_id=0, push=True))
        db.commit()


@router.post("/merge")
def merge_own_sessions(
    body: dict,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Mehrere EIGENE Sessions zu einer zusammenfuehren (Rohdaten + Reanalyse).
    Quellen werden archiviert (reversibel). body = {session_ids: [..]}."""
    from .. import merge
    ids = body.get("session_ids") or []
    ss = [db.get(models.Session, int(i)) for i in ids if isinstance(i, (int, float, str)) and str(i).isdigit()]
    ss = [s for s in ss if s and s.user_id == user.id and not s.deleted]
    if len(ss) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mindestens 2 eigene Sessions waehlen")
    ok, why = merge.can_merge(ss)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, why)
    ns = merge.merge_sessions(db, ss)
    return {"id": ns.id}


@router.post("/{session_id}/unmerge")
def unmerge_session_endpoint(
    session_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Zusammenfuehrung wieder aufloesen: Quell-Sessions zurueckholen, gemergte entfernen."""
    from .. import merge
    s = _owned(db, user, session_id)
    try:
        sources = merge.unmerge_session(db, s)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"ids": [x.id for x in sources]}


@router.get("/merge-suggestions")
def merge_suggestions_endpoint(
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Vorschlag NUR fuer HEUTIGE eigene Sessions, die zusammengehoeren koennten
    (aufeinanderfolgend, <=1 h Luecke). Aeltere gehen manuell ueber Vergleichen."""
    from datetime import datetime
    from .. import merge
    today = datetime.now().astimezone().date()
    out = []
    for g in merge.merge_suggestions(db, user.id):
        if max(g, key=lambda s: s.started_at).started_at.astimezone().date() != today:
            continue
        g = sorted(g, key=lambda s: s.started_at)
        out.append({
            "ids": [s.id for s in g],
            "count": len(g),
            "place": next((s.place_name for s in g if s.place_name), None),
            "date": g[0].started_at.astimezone().date().isoformat(),
            "sessions": [
                {"id": s.id,
                 "start": s.started_at.astimezone().isoformat(),
                 "end": merge._end(s).astimezone().isoformat()}
                for s in g
            ],
        })
    return out


@router.get("/{session_id}", response_model=SessionOut)
def get_session(
    session_id: int,
    background_tasks: BackgroundTasks,
    request: Request,
    response: Response,
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
    # Age-Gate (unter 13): fremde Sessions NUR ansehen ist erlaubt (read-only, wie Spots) — gesperrt
    # sind Feed-Navigation (community.router), Likes/Votes (Schreiben) und Chaträume (chat.router).
    # ETag/304 (PWA-Caching): Stempel aus updated_at + Like-Zustand (Likes bumpen updated_at
    # nicht, sonst wäre der Like-Count aus dem Cache veraltet). Passt If-None-Match -> 304 ohne
    # das schwere Detail (Track/Segmente/Accel/GPS) zu bauen. Browser liefert dann seine Kopie.
    like_count = int(
        db.query(func.count()).select_from(models.SessionLike).filter_by(session_id=s.id).scalar() or 0)
    liked = db.query(models.SessionLike).filter_by(session_id=s.id, user_id=user.id).first() is not None
    dv = int((s.updated_at or s.created_at).timestamp()) if (s.updated_at or s.created_at) else 0
    etag = f'W/"{dv}-{like_count}-{int(liked)}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "private, no-cache"})
    # Gewässer-Name per OSM auflösen — im HINTERGRUND (nicht blockierend). place_name is None
    # = noch nicht (oder zuletzt fehlgeschlagen). Der Task setzt den Namen; er erscheint beim
    # nächsten Laden. So kommt die Session sofort zurück (Overpass/is_in kann Sekunden dauern).
    if s.place_name is None:
        background_tasks.add_task(_geocode_place, s.id)
    out = _session_out(
        s, with_analysis=True, owned=(s.user_id == user.id),
        owner_name=owner_label(s.user.display_name, s.user.id) if s.user else None,
        owner_avatar_url=s.user.avatar_url if s.user else None,
    )
    out.foil = _resolve_foil(db, s)
    # Uhr-/Geräte-Bezeichnung der Aufnahme (nur Detailansicht — ein gezielter Lookup, kein N+1).
    if s.device_id:
        dev = db.get(models.DeviceToken, s.device_id)
        # label kann eine lange partNumber-Gruppe sein (z. B. "fēnix® 6X Pro / 6X Sapphire / …").
        # Fürs Badge nur den ersten (repräsentativen) Teil vor dem "/".
        out.device_label = dev.label.split("/")[0].strip() if dev and dev.label else None
    out.device_model = s.device_model  # Aufnahme-Gerät (Modell + OS) — nur zur Fehlersuche
    if s.user_id == user.id:
        out.share_token = s.share_token  # nur der Besitzer sieht den (ggf. gesetzten) Teilen-Token
    # Endzeit für die Anzeige: viele (chunk-hochgeladene) Sessions haben kein ended_at.
    # Aus dem letzten GPS-Zeitstempel ableiten (nur Anzeige, nicht persistiert).
    if out.ended_at is None and s.started_at is not None:
        gps = storage.load_gps(s.session_uuid)
        if gps and gps[-1] and gps[-1][0]:
            out.ended_at = s.started_at + timedelta(milliseconds=int(gps[-1][0]))
    # Like-Zustand (oben schon berechnet, in den ETag eingeflossen).
    out.like_count = like_count
    out.liked = liked
    out.merged_count = int(db.query(func.count()).select_from(models.Session)
                           .filter(models.Session.merged_into == s.id).scalar() or 0)
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, no-cache"
    return out


@router.post("/{session_id}/share")
def create_share_link(
    session_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Öffentlichen Teilen-Link für die EIGENE Session erzeugen (idempotent — bestehenden wiederverwenden).
    Jeder mit dem Link sieht die Session read-only ohne Login."""
    s = _owned(db, user, session_id)   # nur eigene Sessions (wirft 404 sonst)
    if not s.share_token:
        s.share_token = secrets.token_urlsafe(12)
        db.commit()
    return {"token": s.share_token, "path": f"/s/{s.share_token}"}


@router.delete("/{session_id}/share")
def revoke_share_link(
    session_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Teilen-Link widerrufen — der Link funktioniert danach nicht mehr."""
    s = _owned(db, user, session_id)
    s.share_token = None
    db.commit()
    return {"ok": True}


@public_router.get("/session/{token}")
def public_shared_session(token: str, db: Session = Depends(get_db)) -> dict:
    """Öffentliche, read-only Session-Ansicht über den Teilen-Token — KEIN Login.
    Liefert dieselben reichen Daten wie die Detailansicht (Track/Karte/Segmente/Puls/Pumps/Foto-URLs/
    Bezeichnung/Foil/Uhr) plus die Fotoliste. Nur die EINE Session; keine owner-only Aktionen."""
    s = (db.query(models.Session)
         .filter(models.Session.share_token == token, models.Session.deleted.isnot(True))
         .first())
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kein geteilter Link (oder widerrufen)")
    out = _session_out(
        s, with_analysis=True, owned=False,
        owner_name=owner_label(s.user.display_name, s.user.id) if s.user else None,
        owner_avatar_url=s.user.avatar_url if s.user else None,
    )
    out.foil = _resolve_foil(db, s)
    if s.device_id:
        dev = db.get(models.DeviceToken, s.device_id)
        out.device_label = dev.label.split("/")[0].strip() if dev and dev.label else None
    out.device_model = s.device_model
    if out.ended_at is None and s.started_at is not None:
        gps = storage.load_gps(s.session_uuid)
        if gps and gps[-1] and gps[-1][0]:
            out.ended_at = s.started_at + timedelta(milliseconds=int(gps[-1][0]))
    out.like_count = int(db.query(func.count()).select_from(models.SessionLike)
                         .filter_by(session_id=s.id).scalar() or 0)
    out.liked = False
    out.share_token = None   # den Token NICHT im öffentlichen Payload zurückspiegeln
    photos = [{"id": p.id, "url": p.url, "thumb_url": media.thumb_url(p.url)}
              for p in db.query(models.SessionPhoto)
              .filter_by(session_id=s.id, blocked=False).order_by(models.SessionPhoto.id).all()]
    data = out.model_dump(mode="json")
    data["photos"] = photos
    return data


@router.get("/{session_id}/share.png")
def share_card(
    session_id: int,
    color: str = "cyan",
    stats: str | None = None,
    bg: str = "navy",
    track: int = 1,
    title: str = "",
    shade: str = "light",
    highlight: int = -1,   # einzelnen Lauf hervorheben (0-basiert); <0 = alle
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Teilbare Social-Media-Card (PNG). color=cyan|speed|hr, stats=komma-Keys,
    bg=navy|transparent (transparent = nur Elemente, fuers Foto-Compositing im Client)."""
    from fastapi.responses import Response
    from .. import sharecard

    # Teilen nur der EIGENEN Sessions (Admin darf zwecks Debug auch fremde).
    s = db.get(models.Session, session_id) if user.is_admin else _owned(db, user, session_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    ar = db.query(models.AnalysisResult).filter_by(session_id=session_id).first()
    if ar is None or not ar.track_geojson:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Keine Track-Daten")
    stat_keys = [k for k in (stats.split(",") if stats else []) if k] or None
    # Wasser-Silhouette aus dem Cache (kein Netz): grid_key aus Track-Median
    rings = None
    try:
        gj = json.loads(ar.track_geojson); c = (gj.get("geometry") or {}).get("coordinates") or []
        if c:
            import numpy as _np
            la = float(_np.median([p[1] for p in c])); lo = float(_np.median([p[0] for p in c]))
            wp = db.query(models.WaterPolygon).filter_by(grid_key=f"{round(la,3)},{round(lo,3)}").first()
            rings = json.loads(wp.rings_json) if (wp and wp.rings_json) else None
    except Exception:
        rings = None
    ttl = (title or "").strip()[:40] or None
    sh = shade if shade in ("light", "dark") else "light"
    png = sharecard.render_share_png(s, ar, rings, color=color, stats=stat_keys, bg=bg,
                                     track=bool(track), title=ttl, shade=sh,
                                     highlight=highlight if highlight >= 0 else None)
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "private, max-age=300"})


@router.get("/{session_id}/neighbors")
def session_neighbors(
    session_id: int,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Vorherige/nächste EIGENE Session (nach Startzeit) — für die Detail-Navigation,
    ohne die ganze Liste zu laden. Bleibt in derselben Kategorie wie die aktuelle Session:
    aus einer aussortierten Session navigiert 'älter/neuer' zu aussortierten (nicht zu den
    erkannten Pumpfoil-Sessions) — passend zum Listen-Filter pump/other."""
    s = db.get(models.Session, session_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    same_kind = (models.Session.is_pumpfoil.is_(True) if s.is_pumpfoil
                 else models.Session.is_pumpfoil.isnot(True))
    base = db.query(models.Session.id).filter(
        models.Session.user_id == user.id,
        models.Session.deleted.isnot(True),
        same_kind,
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
@router.put("/{session_id}/trim", response_model=SessionOut)  # PUT-Alias (Android HttpURLConnection kann kein PATCH)
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
@router.put("/{session_id}/meta", response_model=SessionOut)  # PUT-Alias für Clients ohne PATCH (Android HttpURLConnection)
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
    if "foil_id" in body.model_fields_set:  # explizit gesetzt (auch null = zurücksetzen)
        fid = body.foil_id or None
        if fid is not None and db.get(models.Foil, fid) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unbekanntes Foil")
        s.foil_id = fid
    db.commit()
    db.refresh(s)
    out = _session_out(
        s, with_analysis=True,
        owner_name=owner_label(s.user.display_name, s.user.id) if s.user else None,
        owner_avatar_url=s.user.avatar_url if s.user else None,
    )
    out.foil = _resolve_foil(db, s)
    return out


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


# --- Pump-Wahrheit (Tap-to-Label): getappte echte Pump-Zeitpunkte (Owner ODER Admin) ---
def _owned_or_admin(db, user, session_id) -> models.Session:
    s = db.get(models.Session, session_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if s.user_id != user.id and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    return s


def _truth_takes(db, session_id: int, run_idx: int | None) -> list[dict]:
    """Getappte Pump-Zeiten als Take-Liste [{take, times_ms}] (für run_idx, oder run-übergreifend)."""
    q = db.query(models.PumpTruth).filter_by(session_id=session_id)
    if run_idx is not None:
        q = q.filter_by(run_idx=run_idx)
    rows = q.order_by(models.PumpTruth.take, models.PumpTruth.t_ms).all()
    by_take: dict[int, list[int]] = {}
    for r in rows:
        by_take.setdefault(r.take, []).append(r.t_ms)
    return [{"take": k, "times_ms": v} for k, v in sorted(by_take.items())]


@router.get("/{session_id}/pump-truth")
def get_pump_truth(
    session_id: int, run_idx: int | None = None,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    _owned_or_admin(db, user, session_id)
    takes = _truth_takes(db, session_id, run_idx)
    return {"run_idx": run_idx, "takes": takes,
            "next_take": (max((t["take"] for t in takes), default=0) + 1)}


@router.put("/{session_id}/pump-truth")
def put_pump_truth(
    session_id: int, body: PumpTruthIn,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Speichert einen getappten Durchlauf (Take). take=None -> als NEUER Take anhängen
    (überschreibt nichts, derselbe Lauf kann mehrfach getappt werden); take gesetzt ->
    genau diesen Take ersetzen. run_idx grenzt auf einen Lauf ein."""
    _owned_or_admin(db, user, session_id)
    base = db.query(models.PumpTruth).filter_by(session_id=session_id)
    if body.run_idx is not None:
        base = base.filter_by(run_idx=body.run_idx)
    if body.take is None:
        existing = [r.take for r in base.all()]
        take = (max(existing) + 1) if existing else 1
    else:
        take = body.take
        base.filter_by(take=take).delete()
    for t in body.times_ms:
        db.add(models.PumpTruth(session_id=session_id, t_ms=int(t),
                                run_idx=body.run_idx, take=take))
    db.commit()
    takes = _truth_takes(db, session_id, body.run_idx)
    return {"ok": True, "saved": len(body.times_ms), "take": take, "n_takes": len(takes)}


@router.get("/{session_id}/pump-truth/compare")
def compare_pump_truth(
    session_id: int, run_idx: int | None = None,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Vergleicht die getappten Durchläufe (Takes): richtet sie per Kreuzkorrelation aus,
    liefert je Take Offset+Rest-Jitter und einen mehrheitlich bestätigten Konsens."""
    _owned_or_admin(db, user, session_id)
    from ..pumptruth import assess_takes
    # Foiling-Dauer des Laufs (bzw. aller Läufe) für die Kadenz-/Abdeckungs-Plausibilität.
    ar = db.query(models.AnalysisResult).filter_by(session_id=session_id).first()
    segs = []
    if ar and ar.segments_json:
        try:
            segs = json.loads(ar.segments_json)
        except ValueError:
            segs = []
    if run_idx is not None:
        foil_s = (segs[run_idx].get("duration_s") if 0 <= run_idx < len(segs) else 0) or 0
    else:
        foil_s = sum((s.get("duration_s") or 0) for s in segs)
    return assess_takes(_truth_takes(db, session_id, run_idx), float(foil_s))


@router.delete("/{session_id}/pump-truth")
def delete_pump_truth(
    session_id: int, run_idx: int | None = None,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Löscht alle getappten Durchläufe (Takes) der Session — bzw. nur eines Laufs, wenn
    run_idx gesetzt ist."""
    _owned_or_admin(db, user, session_id)
    q = db.query(models.PumpTruth).filter_by(session_id=session_id)
    if run_idx is not None:
        q = q.filter_by(run_idx=run_idx)
    n = q.delete()
    db.commit()
    return {"ok": True, "deleted": n}


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
    from ..media import thumb_url
    return [{"id": p.id, "url": p.url, "thumb_url": thumb_url(p.url)} for p in rows]


@router.post("/{session_id}/photos")
async def upload_photo(
    session_id: int,
    file: UploadFile = File(...),
    user: models.User = Depends(require_social),   # UGC-Erstellung — unter 13 gesperrt
    db: Session = Depends(get_db),
) -> dict:
    _owned(db, user, session_id)
    n = db.query(models.SessionPhoto).filter_by(session_id=session_id).count()
    if n >= MAX_PHOTOS_PER_SESSION:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Max. {MAX_PHOTOS_PER_SESSION} Fotos")
    from ..media import ImageError, save_image

    raw = await file.read()
    try:
        url = save_image(raw, subdir="photos", max_dim=1600, thumb_dim=480)
    except ImageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    photo = models.SessionPhoto(session_id=session_id, user_id=user.id, url=url)
    db.add(photo)
    # Session „zuletzt geändert" bumpen -> App-Cache lädt das Detail (mit neuem Foto) nach.
    db.query(models.Session).filter_by(id=session_id).update({models.Session.updated_at: func.now()})
    db.commit()
    from ..media import thumb_url
    return {"id": photo.id, "url": photo.url, "thumb_url": thumb_url(photo.url)}


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
    db.query(models.Session).filter_by(id=session_id).update({models.Session.updated_at: func.now()})
    db.commit()
    return {"ok": True}
