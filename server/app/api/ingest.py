"""Roh-Upload von der Uhr: Session anmelden, Chunks hochladen, abschließen.

Idempotent & resumebar: gleiche (session, kind, index) überschreibt; received_chunks
erlaubt der Uhr, nach Abbruch nur Fehlendes nachzuschicken.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, storage
from ..analysis import maybe_auto_trim, run_analysis
from ..db import SessionLocal, get_db
from ..schemas import (
    ChunkIn,
    ChunkOut,
    SessionCompleteIn,
    SessionStartIn,
    SessionStartOut,
)
from .deps import current_device

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


def _get_owned_session(db, device, session_uuid) -> models.Session:
    s = db.query(models.Session).filter_by(session_uuid=session_uuid).first()
    if s is None or s.user_id != device.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return s


@router.post("/session", response_model=SessionStartOut)
def start_session(
    body: SessionStartIn,
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
) -> SessionStartOut:
    s = db.query(models.Session).filter_by(session_uuid=body.session_uuid).first()
    if s is None:
        # Standard-Foil des Nutzers beim Anlegen fest zuordnen (änderbar).
        import json as _json
        _u = db.get(models.User, device.user_id)
        _foil = None
        if _u and _u.settings_json:
            try:
                _foil = (_json.loads(_u.settings_json) or {}).get("foil_id")
            except ValueError:
                _foil = None
        s = models.Session(
            session_uuid=body.session_uuid,
            user_id=device.user_id,
            device_id=device.id,
            sport=body.sport,
            started_at=body.started_at,
            gps_hz=body.gps_hz,
            accel_hz=body.accel_hz,
            accel_scale=body.accel_scale,
            status="recording",
            foil_id=_foil,
        )
        db.add(s)
        db.commit()
        db.refresh(s)
    elif s.user_id != device.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Session belongs to another user")

    storage.write_meta(
        body.session_uuid,
        {
            "session_uuid": body.session_uuid,
            "started_at": body.started_at,
            "sport": body.sport,
            "gps_hz": body.gps_hz,
            "accel_hz": body.accel_hz,
            "accel_scale": body.accel_scale,
        },
    )
    received = [c.index for c in s.chunks]
    return SessionStartOut(session_id=s.id, received_chunks=sorted(set(received)))


@router.post("/session/{session_uuid}/chunk", response_model=ChunkOut)
def upload_chunk(
    session_uuid: str,
    body: ChunkIn,
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
) -> ChunkOut:
    s = _get_owned_session(db, device, session_uuid)

    if body.kind == "gps":
        if not isinstance(body.data, list):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "gps data must be a list")
        n = storage.save_gps_chunk(session_uuid, body.index, body.data)
    elif body.kind == "accel":
        if not isinstance(body.data, str):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "accel data must be base64 string")
        n = storage.save_accel_chunk(session_uuid, body.index, body.data)
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown kind {body.kind!r}")

    chunk = (
        db.query(models.IngestChunk)
        .filter_by(session_id=s.id, kind=body.kind, index=body.index)
        .first()
    )
    if chunk is None:
        chunk = models.IngestChunk(
            session_id=s.id, kind=body.kind, index=body.index, sample_count=n
        )
        db.add(chunk)
    else:
        chunk.sample_count = n
    db.commit()
    return ChunkOut(ok=True, index=body.index)


def _analyze_in_background(session_id: int, final: bool = True) -> None:
    """Analyse in eigener DB-Session (die Request-Session ist nach Antwort geschlossen)."""
    db = SessionLocal()
    try:
        s = db.get(models.Session, session_id)
        if s is not None:
            run_analysis(db, s, final=final)
            if final and maybe_auto_trim(db, s):  # nach Abschluss Heimfahrt o.ä. wegschneiden
                run_analysis(db, s, final=True)
            if final:
                from ..notify import notify_session_analyzed
                notify_session_analyzed(db, s)
    finally:
        db.close()


@router.post("/session/{session_uuid}/analyze")
def analyze_partial(
    session_uuid: str,
    background: BackgroundTasks,
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
) -> dict:
    """Zwischenanalyse während die Aufnahme noch läuft (Live-Sync). Rechnet die
    bisher hochgeladenen Rohdaten neu durch, ohne die Session abzuschließen ->
    der aktuelle Lauf ist schon auswertbar, ohne die Aktivität zu beenden."""
    s = _get_owned_session(db, device, session_uuid)
    background.add_task(_analyze_in_background, s.id, False)
    return {"session_id": s.id, "status": "live", "analysis": "queued"}


@router.post("/session/{session_uuid}/complete")
def complete_session(
    session_uuid: str,
    body: SessionCompleteIn,
    background: BackgroundTasks,
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
) -> dict:
    s = _get_owned_session(db, device, session_uuid)
    if body.ended_at is not None:
        s.ended_at = body.ended_at
    s.total_chunks = body.total_chunks
    s.status = "complete"
    db.commit()

    # Analyse asynchron, damit der Upload-Abschluss der Uhr schnell quittiert wird.
    background.add_task(_analyze_in_background, s.id)
    return {"session_id": s.id, "status": s.status, "analysis": "queued"}
