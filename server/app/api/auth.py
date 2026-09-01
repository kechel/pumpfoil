"""Registrierung + Login (JWT)."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, or_
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
# MUSS mit den Sprachlisten der Clients uebereinstimmen: web/src/i18n (locales/*.ts),
# `I18n.LANGS` (Android) und `Loc.langs` (iOS/Apple Watch). Was hier fehlt, faellt in
# `_clean_lang` still auf Englisch zurueck — der Nutzer stellt seine Sprache um, die App zeigt
# sie sofort, und beim naechsten Profil-Abruf springt alles auf Englisch zurueck.
# Genau das ist mit "pl" passiert (gemeldet 01.09. von einem polnischen Nutzer): Polnisch war
# seit dem 25.08. in allen drei Clients, hier aber nie ergaenzt. Belegt: KEIN einziges der 393
# Konten hatte `language = "pl"`, obwohl die Sprache angeboten wurde.
SUPPORTED_LANGS = {"de", "gsw", "de-AT", "en", "fr", "it", "es", "fi", "nl", "cs",
                   "pt", "ja", "zh", "ru", "id", "nb", "pl"}


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


def _needs_classification_id(db: Session, user_id: int) -> int | None:
    """Neueste eigene Session, die auf Zuordnung wartet — Ziel des Startseiten-Hinweises."""
    try:
        row = (db.query(models.Session.id)
               .filter(models.Session.user_id == user_id,
                       models.Session.deleted.isnot(True),
                       models.Session.needs_classification.is_(True))
               .order_by(models.Session.id.desc()).first())
        return int(row[0]) if row else None
    except Exception:  # noqa: BLE001
        return None


def _needs_classification(db: Session, user_id: int) -> int:
    """Eigene Sessions, die auf eine Zuordnung warten. Wird in jedes Profil-Payload gehängt, weil die
    Startseite den Hinweis daraus baut (Jan: „der andere sollte schon eine meldung sehen in seinem
    homebereich … oder einen marker an seiner session")."""
    try:
        return int(db.query(func.count(models.Session.id)).filter(
            models.Session.user_id == user_id,
            models.Session.deleted.isnot(True),
            models.Session.needs_classification.is_(True)).scalar() or 0)
    except Exception:  # noqa: BLE001 – darf das Profil nie brechen
        return 0


SORTED_OUT_NEU_TAGE = 7   # so lange gilt eine aussortierte Aufnahme als „frisch" (Hervorhebung)


def _sorted_out(db: Session, user_id: int) -> tuple[int, int]:
    """Aussortierte eigene Aufnahmen, die noch niemandem zugeordnet sind: (Anzahl, davon frisch).

    „Frisch" = in den letzten `SORTED_OUT_NEU_TAGE` Tagen aufgenommen. Nur diese heben den Tab
    hervor (Jans Vorgabe 05.08.): zehn Aussortierte von vor drei Monaten sind kein Anlass mehr,
    jemanden anzustupsen — die Hervorhebung verfaellt dadurch von selbst und braucht kein
    Wegklicken.

    Dieselbe Bedingung wie der „Aussortiert"-Tab (`sessions.py:_apply_pump_filter`, filter=other):
    `is_pumpfoil` NICHT true. Bewusst ausgenommen, damit der Hinweis nur zeigt, wo Zuordnen noch
    etwas AENDERT:
      • `is_pumpfoil IS NULL` -> noch nicht analysiert, da steht das Urteil gar nicht fest.
      • `needs_classification` -> hat schon seinen eigenen, deutlicheren Hinweis (kein Doppel-Nerven).
      • `sport_source` owner/admin -> ein Mensch hat die Frage bereits beantwortet.
      • `data_quality` != ok -> als Test/Datenmuell/Duplikat abgehakt, das ist gewollt aussortiert.
      • laufende Aufnahmen (recording/live).
    Die persoenliche Empfindlichkeit bleibt hier aussen vor: sie kann Laeufe nur ZUSAETZLICH finden,
    und dann steht die Aufnahme ohnehin nicht mehr im Tab.
    """
    try:
        q = (db.query(models.Session.started_at)
             .filter(models.Session.user_id == user_id,
                     models.Session.deleted.isnot(True),
                     models.Session.is_pumpfoil.is_(False),
                     models.Session.needs_classification.isnot(True),
                     or_(models.Session.sport_source.is_(None),
                         models.Session.sport_source.in_(("default", "auto"))),
                     or_(models.Session.data_quality.is_(None),
                         models.Session.data_quality == "ok"),
                     models.Session.status.notin_(("recording", "live"))))
        grenze = datetime.now(timezone.utc) - timedelta(days=SORTED_OUT_NEU_TAGE)
        alle = [r[0] for r in q.all()]
        neu = 0
        for ts in alle:
            if ts is None:
                continue
            # Naive Zeitstempel als UTC lesen, sonst schlaegt der Vergleich fehl.
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts >= grenze:
                neu += 1
        return len(alle), neu
    except Exception:  # noqa: BLE001 – darf das Profil nie brechen
        return 0, 0


def _profile_hinweise(db: Session, user_id: int) -> dict:
    """Die Hinweis-Zahlen fuer die Startseite, an EINER Stelle gebuendelt — vier Endpunkte geben
    ProfileOut zurueck, und die Felder sollen nie zwischen ihnen auseinanderlaufen."""
    anzahl, neu = _sorted_out(db, user_id)
    return {"needs_classification": _needs_classification(db, user_id),
            "needs_classification_id": _needs_classification_id(db, user_id),
            "sorted_out": anzahl, "sorted_out_new": neu}


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
def me(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> ProfileOut:
    return ProfileOut(email=user.email, display_name=user.display_name, avatar_url=user.avatar_url, is_admin=user.is_admin, language=user.language or "en", beta=True, foil_sensitivity=(user.foil_sensitivity or "normal"), pump_unit=(user.pump_unit or "hz"), social_allowed=(user.social_allowed is not False),
                      **_profile_hinweise(db, user.id))


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
    # Anzeige-Einheit der Kadenz: reine Darstellung -> KEINE Reanalyse, kein Einfluss auf Rekorde.
    if body.pump_unit is not None:
        user.pump_unit = body.pump_unit if body.pump_unit in ("hz", "ppm") else "hz"
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
    return ProfileOut(email=user.email, display_name=user.display_name, avatar_url=user.avatar_url, is_admin=user.is_admin, language=user.language or "en", beta=True, foil_sensitivity=(user.foil_sensitivity or "normal"), pump_unit=(user.pump_unit or "hz"), social_allowed=(user.social_allowed is not False),
                      **_profile_hinweise(db, user.id))


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
                      foil_sensitivity=(user.foil_sensitivity or "normal"), pump_unit=(user.pump_unit or "hz"),
                      social_allowed=(user.social_allowed is not False),
                      **_profile_hinweise(db, user.id))


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
        # Spot-Beschreibungen sind eigene Texte + eigene Fotos -> gehoeren in den Export
        # (die Liste hier ist explizit; neue Tabellen fallen sonst stumm durch).
        "spot_notes": [
            {
                "spot_id": n.spot_id,
                "spot": (db.get(models.Spot, n.spot_id).name if db.get(models.Spot, n.spot_id) else None),
                "text": n.text,
                "updated_at": n.updated_at.isoformat() if n.updated_at else None,
                "photos": [f.url for f in db.query(models.SpotNotePhoto).filter_by(note_id=n.id).all()],
            }
            for n in db.query(models.SpotNote).filter_by(user_id=user.id).all()
        ],
    }


@router.delete("/me")
def delete_me(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """DSGVO: eigenes Konto + ALLE Daten unwiderruflich löschen."""
    for s in db.query(models.Session).filter_by(user_id=user.id).all():
        _purge_session(db, s)
    db.query(models.SessionLike).filter_by(user_id=user.id).delete()
    db.query(models.SessionVote).filter_by(user_id=user.id).delete()
    # Spot-Beschreibungen: eigene Texte + Fotodateien weg, dazu die eigenen Herzchen/Meldungen
    # auf FREMDEN Beschreibungen. DSGVO-Loeschung ist absolut — nichts stehen lassen.
    from .spotnotes import _note_weg
    for n in db.query(models.SpotNote).filter_by(user_id=user.id).all():
        _note_weg(db, n)
    db.query(models.SpotNoteLike).filter_by(user_id=user.id).delete()
    db.query(models.SpotNoteVote).filter_by(user_id=user.id).delete()
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
    return ProfileOut(email=user.email, display_name=user.display_name, avatar_url=user.avatar_url, is_admin=user.is_admin, language=user.language or "en", beta=True, foil_sensitivity=(user.foil_sensitivity or "normal"), pump_unit=(user.pump_unit or "hz"), social_allowed=(user.social_allowed is not False),
                      **_profile_hinweise(db, user.id))


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
