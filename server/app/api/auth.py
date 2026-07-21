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
from ..schemas import AgeRangeIn, ForgotIn, LoginIn, PasswordChangeIn, ProfileIn, ProfileOut, RegisterIn, ResetIn, TokenOut
from ..ratelimit import rate_limit
from ..security import create_access_token, hash_password, new_token, verify_password
from .deps import current_user

RESET_TTL_MIN = 60

# Unterstützte UI-Sprachen (inkl. Dialekte). Quelle der Wahrheit auch im Frontend (i18n).
SUPPORTED_LANGS = {"de", "gsw", "de-AT", "en", "fr", "it", "es", "fi", "nl", "cs"}


def _clean_lang(raw: str | None, fallback: str = "en") -> str:
    """Normalisiert einen Sprachcode auf eine unterstützte Sprache, sonst Fallback."""
    code = (raw or "").strip()
    return code if code in SUPPORTED_LANGS else fallback


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _clean_display_name(db: Session, raw: str | None, exclude_id: int | None = None) -> str | None:
    """Trimmt + validiert den Anzeigenamen und prüft Eindeutigkeit (case-insensitiv).
    Leer -> None (kein Name). Bereits vergeben -> 409. (Für Profil-EDIT: bewusste Wahl.)"""
    name = (raw or "").strip()
    if not name:
        return None
    if len(name) < 2 or len(name) > 40:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anzeigename muss 2–40 Zeichen lang sein")
    q = db.query(models.User).filter(func.lower(models.User.display_name) == name.lower())
    if exclude_id is not None:
        q = q.filter(models.User.id != exclude_id)
    if q.first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Anzeigename ist bereits vergeben")
    return name


def _name_taken(db: Session, name: str) -> bool:
    return db.query(models.User).filter(
        func.lower(models.User.display_name) == name.lower()).first() is not None


def next_free_display_name(db: Session, base: str) -> str:
    """Freien Anzeigenamen ableiten: `base` nehmen; ist er vergeben, die nächste freie
    Zahl ab 2 anhängen (Jan -> Jan2 -> Jan3 …). Case-insensitiv, max. 40 Zeichen."""
    base = base.strip()[:40]
    if not _name_taken(db, base):
        return base
    i = 2
    while True:
        suffix = str(i)
        cand = base[:40 - len(suffix)] + suffix
        if not _name_taken(db, cand):
            return cand
        i += 1


def _create_display_name(db: Session, raw: str | None) -> str | None:
    """Anzeigename beim ANLEGEN eines Kontos: Länge prüfen, dann bei Kollision automatisch
    durchnummerieren (kein 409). Leer -> None."""
    name = (raw or "").strip()
    if not name:
        return None
    if len(name) < 2 or len(name) > 40:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anzeigename muss 2–40 Zeichen lang sein")
    return next_free_display_name(db, name)


@router.post("/register", response_model=TokenOut)
def register(
    body: RegisterIn, db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(5, 3600, "register")),
) -> TokenOut:
    existing = db.query(models.User).filter_by(email=body.email.lower()).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    name = _create_display_name(db, body.display_name)   # bei Kollision automatisch durchnummerieren
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
    return ProfileOut(email=user.email, display_name=user.display_name, avatar_url=user.avatar_url, is_admin=user.is_admin, language=user.language or "en", beta=True, foil_sensitivity=(user.foil_sensitivity or "normal"), social_allowed=(user.social_allowed is not False))


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
        user.language = _clean_lang(body.language, fallback=user.language or "en")
    # Persönliche Erkennungs-Empfindlichkeit: bei Änderung im HINTERGRUND die EIGENEN Sessions
    # (nur die noch nicht für dieses Preset gecachten) reanalysieren — Request kommt sofort zurück,
    # PWA pollt /me/reanalysis für die Fortschrittsanzeige. Community/Rekorde bleiben Standard.
    if body.foil_sensitivity is not None:
        from ..analysis.gps import SENSITIVITY_PRESETS
        from ..reanalysis import start_reanalysis
        new_sens = body.foil_sensitivity if body.foil_sensitivity in SENSITIVITY_PRESETS else "normal"
        if new_sens != (user.foil_sensitivity or "normal"):
            user.foil_sensitivity = new_sens
            db.commit()
            # Kanonische Spalten aller eigenen Sessions auf das neue Preset umschreiben (auch
            # ->normal, um auf die Standardlimits zurückzugehen). Läuft im Hintergrund.
            start_reanalysis(user.id, new_sens)
    db.commit()
    db.refresh(user)
    return ProfileOut(email=user.email, display_name=user.display_name, avatar_url=user.avatar_url, is_admin=user.is_admin, language=user.language or "en", beta=True, foil_sensitivity=(user.foil_sensitivity or "normal"), social_allowed=(user.social_allowed is not False))


@router.put("/me/age-range", response_model=ProfileOut)
@router.post("/me/age-range", response_model=ProfileOut)
def set_age_range(
    body: AgeRangeIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)
) -> ProfileOut:
    """Ergebnis der iOS Declared Age Range API übernehmen: sperrt Social-Features (UGC/Feed/Chat)
    für unter-13 (Apple-Vorgabe). Gilt plattformweit über das social_allowed-Flag."""
    user.social_allowed = bool(body.social_allowed)
    user.age_bracket = (body.age_bracket or None)
    db.commit()
    db.refresh(user)
    return ProfileOut(email=user.email, display_name=user.display_name, avatar_url=user.avatar_url,
                      is_admin=user.is_admin, language=user.language or "en",
                      beta=True,
                      foil_sensitivity=(user.foil_sensitivity or "normal"),
                      social_allowed=(user.social_allowed is not False))


@router.get("/me/reanalysis")
def reanalysis_progress(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Fortschritt der Hintergrund-Reanalyse nach Empfindlichkeits-Wechsel (für die PWA-Anzeige)."""
    from ..reanalysis import progress_for
    return progress_for(db, user.id)


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
            "videos": [v.youtube_url for v in db.query(models.SessionVideo).filter_by(session_id=s.id).all()],
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
@router.put("/me/password")  # PUT-Alias: native Clients (HttpURLConnection) koennen kein PATCH
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
    return ProfileOut(email=user.email, display_name=user.display_name, avatar_url=user.avatar_url, is_admin=user.is_admin, language=user.language or "en", beta=True, foil_sensitivity=(user.foil_sensitivity or "normal"), social_allowed=(user.social_allowed is not False))


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
