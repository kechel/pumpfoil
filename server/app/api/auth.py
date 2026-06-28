"""Registrierung + Login (JWT)."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from ..media import delete_media
from ..mailer import send_email
from .admin import _purge_session
from ..schemas import ForgotIn, LoginIn, PasswordChangeIn, ProfileIn, ProfileOut, RegisterIn, ResetIn, TokenOut
from ..ratelimit import rate_limit
from ..security import create_access_token, hash_password, new_token, verify_password
from .deps import current_user

RESET_TTL_MIN = 60

# Unterstützte UI-Sprachen (inkl. Dialekte). Quelle der Wahrheit auch im Frontend (i18n).
SUPPORTED_LANGS = {"de", "gsw", "de-AT", "en", "fr", "it", "es"}


def _clean_lang(raw: str | None, fallback: str = "de") -> str:
    """Normalisiert einen Sprachcode auf eine unterstützte Sprache, sonst Fallback."""
    code = (raw or "").strip()
    return code if code in SUPPORTED_LANGS else fallback


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _clean_display_name(db: Session, raw: str | None, exclude_id: int | None = None) -> str | None:
    """Trimmt + validiert den Anzeigenamen (nur Länge). Anzeigenamen müssen NICHT
    eindeutig sein — die Identität läuft über E-Mail/ID, nicht über den Namen.
    Leer -> None (kein Name). (db/exclude_id bleiben für Aufruf-Kompatibilität.)"""
    name = (raw or "").strip()
    if not name:
        return None
    if len(name) < 2 or len(name) > 40:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anzeigename muss 2–40 Zeichen lang sein")
    return name


@router.post("/register", response_model=TokenOut)
def register(
    body: RegisterIn, db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(5, 3600, "register")),
) -> TokenOut:
    existing = db.query(models.User).filter_by(email=body.email.lower()).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    name = _clean_display_name(db, body.display_name)
    user = models.User(
        email=body.email.lower(), password_hash=hash_password(body.password), display_name=name,
        language=_clean_lang(body.language),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_access_token(user.id))


@router.get("/me", response_model=ProfileOut)
def me(user: models.User = Depends(current_user)) -> ProfileOut:
    return ProfileOut(email=user.email, display_name=user.display_name, avatar_url=user.avatar_url, is_admin=user.is_admin, language=user.language or "de")


@router.patch("/me", response_model=ProfileOut)
@router.put("/me", response_model=ProfileOut)  # PUT-Alias: Android-HttpURLConnection kann kein PATCH
def update_me(
    body: ProfileIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)
) -> ProfileOut:
    # display_name nur ändern, wenn mitgeschickt (reiner Sprachwechsel lässt ihn unangetastet).
    if body.display_name is not None:
        name = _clean_display_name(db, body.display_name, exclude_id=user.id)
        if name is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anzeigename darf nicht leer sein")
        user.display_name = name
    if body.language is not None:
        user.language = _clean_lang(body.language, fallback=user.language or "de")
    db.commit()
    db.refresh(user)
    return ProfileOut(email=user.email, display_name=user.display_name, avatar_url=user.avatar_url, is_admin=user.is_admin, language=user.language or "de")


@router.get("/me/export")
def export_me(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """DSGVO-Datenexport: alle personenbezogenen Daten des Nutzers als JSON."""
    def _j(s):
        try:
            return json.loads(s) if s else None
        except ValueError:
            return None
    sessions = []
    for s in db.query(models.Session).filter_by(user_id=user.id).order_by(models.Session.started_at.asc()).all():
        ar = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
        sessions.append({
            "id": s.id,
            "uuid": s.session_uuid,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "ended_at": getattr(s, "ended_at", None).isoformat() if getattr(s, "ended_at", None) else None,
            "sport": s.sport,
            "place": s.place_name,
            "caption": s.caption,
            "youtube_url": s.youtube_url,
            "metrics": _j(ar.metrics_json) if ar else None,
            "segments": _j(ar.segments_json) if ar else None,
            "track_geojson": _j(ar.track_geojson) if ar else None,
            "labels": [
                {"label": l.label, "t_start_ms": l.t_start_ms, "t_end_ms": l.t_end_ms}
                for l in db.query(models.Label).filter_by(session_id=s.id).all()
            ],
            "photos": [p.url for p in db.query(models.SessionPhoto).filter_by(session_id=s.id).all()],
        })
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": {
            "email": user.email,
            "display_name": user.display_name,
            "language": user.language,
            "avatar_url": user.avatar_url,
            "created_at": getattr(user, "created_at", None).isoformat() if getattr(user, "created_at", None) else None,
        },
        "sessions": sessions,
    }


@router.delete("/me")
def delete_me(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """DSGVO: eigenes Konto + ALLE Daten unwiderruflich löschen."""
    for s in db.query(models.Session).filter_by(user_id=user.id).all():
        _purge_session(db, s)
    db.query(models.SessionLike).filter_by(user_id=user.id).delete()
    db.query(models.SessionVote).filter_by(user_id=user.id).delete()
    db.query(models.DeviceToken).filter_by(user_id=user.id).delete()
    db.query(models.PairingCode).filter_by(user_id=user.id).delete()
    db.query(models.OAuthIdentity).filter_by(user_id=user.id).delete()
    delete_media(user.avatar_url)
    db.delete(user)
    db.commit()
    return {"ok": True}


@router.post("/forgot-password")
def forgot_password(
    body: ForgotIn, db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(5, 900, "forgot")),
) -> dict:
    """Reset-Link per E-Mail anfordern. Antwortet IMMER ok (kein Konto-Enumeration)."""
    user = db.query(models.User).filter_by(email=body.email.lower()).first()
    if user and not user.blocked:
        token = new_token(32)
        db.add(models.PasswordReset(
            user_id=user.id, token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=RESET_TTL_MIN)))
        db.commit()
        link = f"{get_settings().base_url}/reset?token={token}"
        send_email(
            user.email, "Passwort zurücksetzen — Pumpfoil",
            f"Hallo,\n\nsetze dein Passwort über diesen Link (gültig {RESET_TTL_MIN} min):\n\n{link}\n\n"
            "Wenn du das nicht warst, ignoriere diese E-Mail.\n")
    return {"ok": True}


@router.post("/reset-password", response_model=TokenOut)
def reset_password(
    body: ResetIn, db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(10, 900, "reset")),
) -> TokenOut:
    """Passwort per gültigem Token setzen. Token wird verbraucht; direkt eingeloggt."""
    pr = db.query(models.PasswordReset).filter_by(token=body.token).first()
    now = datetime.now(timezone.utc)
    exp = pr.expires_at.replace(tzinfo=timezone.utc) if pr and pr.expires_at.tzinfo is None else (pr.expires_at if pr else None)
    if pr is None or pr.used_at is not None or exp < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Link ungültig oder abgelaufen")
    user = db.get(models.User, pr.user_id)
    if user is None or user.blocked:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Konto nicht verfügbar")
    user.password_hash = hash_password(body.new_password)
    pr.used_at = now
    db.commit()
    return TokenOut(access_token=create_access_token(user.id))


@router.patch("/me/password")
def change_password(
    body: PasswordChangeIn, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Self-Service: eigenes Passwort ändern (aktuelles Passwort zur Bestätigung)."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aktuelles Passwort falsch")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.post("/me/avatar", response_model=ProfileOut)
async def upload_avatar(
    file: UploadFile = File(...), user: models.User = Depends(current_user), db: Session = Depends(get_db)
) -> ProfileOut:
    from ..media import ImageError, delete_media, save_image

    raw = await file.read()
    try:
        url = save_image(raw, subdir="avatars", max_dim=256, square=True)
    except ImageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    delete_media(user.avatar_url)  # altes Bild aufräumen
    user.avatar_url = url
    db.commit()
    db.refresh(user)
    return ProfileOut(email=user.email, display_name=user.display_name, avatar_url=user.avatar_url, is_admin=user.is_admin, language=user.language or "de")


@router.post("/login", response_model=TokenOut)
def login(
    body: LoginIn, db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(10, 300, "login")),
) -> TokenOut:
    user = db.query(models.User).filter_by(email=body.email.lower()).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if user.blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Konto gesperrt")
    return TokenOut(access_token=create_access_token(user.id))
