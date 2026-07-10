"""Suunto Cloud API: Konto verknüpfen (OAuth2) + Workouts als Sessions importieren.

Credential-gated (`OAUTH_SUUNTO_CLIENT_ID` / `_SECRET` + `OAUTH_SUUNTO_SUBSCRIPTION_KEY`).
Suunto-Modell (apizone.suunto.com):
- OAuth2 authorization_code; Token-Endpoint via HTTP Basic Auth (client_id:secret).
  accessToken (JWT) läuft täglich ab (expires_in 86400) -> refresh_token. scope=workout.
- Daten-Calls brauchen ZUSÄTZLICH den Header `Ocp-Apim-Subscription-Key` (aus dem
  Dev-Portal-Abo).
- Workouts: GET /v2/workouts; FIT je Workout herunterladen -> derselbe Parser/Import wie
  der manuelle FIT-Upload (`fitimport`/`import_parsed_session`). Idempotent (content_hash).

Pull-basiert (Sync-Button wie Polar). Suunto bietet auch Webhooks für neue Workouts —
optional später nachrüstbar.

ACHTUNG (vor echter Freigabe unverifiziert, bei Zugang prüfen):
- genauer FIT-Download-Pfad (FIT_EXPORT) + Feldname der Workout-ID,
- ob der Authorization-Header das rohe JWT oder „Bearer <jwt>" erwartet.
"""
from __future__ import annotations

import base64
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/integrations/suunto", tags=["suunto"])

AUTHORIZE_URL = "https://cloudapi-oauth.suunto.com/oauth/authorize"
TOKEN_URL = "https://cloudapi-oauth.suunto.com/oauth/token"
API = "https://cloudapi.suunto.com"
WORKOUTS_URL = f"{API}/v2/workouts"
# FIT-Export je Workout — Pfad bei echtem Zugang gegen die Doc verifizieren.
FIT_EXPORT = API + "/v2/workout/exportFit/{key}"


def _cfg() -> dict:
    return get_settings().oauth.get("suunto", {})


def _sub_key() -> str:
    import os
    return os.environ.get("OAUTH_SUUNTO_SUBSCRIPTION_KEY", "")


def _creds() -> tuple[str, str]:
    c = _cfg()
    if not c.get("client_id") or not c.get("client_secret") or not _sub_key():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Suunto not configured")
    return c["client_id"], c["client_secret"]


def _redirect_uri() -> str:
    return f"{get_settings().base_url}/api/integrations/suunto/callback"


def _state_for(uid: int) -> str:
    s = get_settings()
    return pyjwt.encode(
        {"uid": uid, "scope": "suunto-link", "exp": int(time.time()) + 600},
        s.jwt_secret, algorithm=s.jwt_algorithm,
    )


def _uid_from_state(state: str) -> int | None:
    s = get_settings()
    try:
        p = pyjwt.decode(state, s.jwt_secret, algorithms=[s.jwt_algorithm])
        return int(p["uid"]) if p.get("scope") == "suunto-link" else None
    except Exception:  # noqa: BLE001
        return None


def _store_token(link: models.SuuntoLink, tok: dict) -> None:
    link.access_token = tok.get("access_token") or link.access_token
    if tok.get("refresh_token"):
        link.refresh_token = tok["refresh_token"]
    exp = int(tok.get("expires_in") or 0)
    link.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=exp) if exp else None
    # Suunto liefert den Username im Token-Response (Feld "user") — für die Webhook-Zuordnung.
    if tok.get("user"):
        link.suunto_username = str(tok["user"])


def _basic(cid: str, secret: str) -> str:
    return base64.b64encode(f"{cid}:{secret}".encode()).decode()


def _fresh_token(link: models.SuuntoLink, db: Session) -> str:
    """Token bei Ablauf (täglich!) per refresh_token erneuern."""
    exp = link.token_expires_at
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp - timedelta(minutes=5) > datetime.now(timezone.utc):
        return link.access_token
    cid, secret = _creds()
    r = httpx.post(TOKEN_URL,
                   data={"grant_type": "refresh_token", "refresh_token": link.refresh_token},
                   headers={"Authorization": f"Basic {_basic(cid, secret)}",
                            "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
                   timeout=20)
    if r.status_code == 200:
        _store_token(link, r.json())
        db.commit()
    return link.access_token


@router.get("/status")
def status_(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    c = _cfg()
    available = bool(c.get("client_id") and c.get("client_secret") and _sub_key())
    link = db.query(models.SuuntoLink).filter_by(user_id=user.id).first()
    return {
        "available": available,
        "linked": link is not None,
        "last_sync_at": link.last_sync_at.isoformat() if link and link.last_sync_at else None,
    }


@router.get("/connect")
def connect(user: models.User = Depends(current_user)) -> dict:
    cid, _ = _creds()
    params = {
        "response_type": "code",
        "client_id": cid,
        "redirect_uri": _redirect_uri(),
        "scope": "workout",
    }
    return {"authorize_url": f"{AUTHORIZE_URL}?{urlencode(params)}"}


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, db: Session = Depends(get_db)):
    cid, secret = _creds()
    uid = _uid_from_state(state or "")
    if not code or uid is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Suunto state")
    try:
        tr = httpx.post(TOKEN_URL,
                        data={"grant_type": "authorization_code", "code": code, "redirect_uri": _redirect_uri()},
                        headers={"Authorization": f"Basic {_basic(cid, secret)}",
                                 "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
                        timeout=20)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Suunto token exchange failed") from exc
    if tr.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Suunto token exchange failed ({tr.status_code})")
    tok = tr.json()
    if not tok.get("access_token"):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Suunto token incomplete")
    link = db.query(models.SuuntoLink).filter_by(user_id=uid).first()
    if link is None:
        link = models.SuuntoLink(user_id=uid, access_token="", refresh_token="")
        db.add(link)
    _store_token(link, tok)
    db.commit()
    return RedirectResponse(f"{get_settings().base_url}/konten?suunto=connected", status_code=303)


def _import_workout(db: Session, user: models.User, token: str, key: str) -> bool:
    """Ein Workout per FIT-Export herunterladen + importieren (idempotent). True bei Neuimport."""
    from .sessions import import_parsed_session  # lazy: vermeidet Import-Zyklus
    from ..fitimport import parse_fit_bytes
    try:
        fr = httpx.get(FIT_EXPORT.format(key=key),
                       headers={"Authorization": f"Bearer {token}", "Ocp-Apim-Subscription-Key": _sub_key()},
                       timeout=60)
        if fr.status_code != 200 or not fr.content:
            return False
        parsed = parse_fit_bytes(fr.content)
        if not parsed.get("gps_samples") or parsed.get("started_at") is None:
            return False
        s = import_parsed_session(db, user, fr.content, parsed,
                                  src_label="suunto-import", uuid_prefix="suunto-")
        return s is not None
    except Exception:  # noqa: BLE001 — ein kaputtes Workout darf den Rest nicht stoppen
        return False


@router.post("/sync")
def sync(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Alle Workouts ziehen und je FIT als Session importieren (idempotent)."""
    _creds()
    link = db.query(models.SuuntoLink).filter_by(user_id=user.id).first()
    if link is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Suunto not linked")

    token = _fresh_token(link, db)
    hdr = {"Authorization": f"Bearer {token}", "Ocp-Apim-Subscription-Key": _sub_key(), "Accept": "application/json"}
    try:
        lr = httpx.get(WORKOUTS_URL, headers=hdr, timeout=30)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Suunto unreachable") from exc
    if lr.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Suunto workouts failed ({lr.status_code})")
    payload = lr.json()
    workouts = payload.get("payload") or payload.get("workouts") or payload if isinstance(payload, list) else payload.get("payload", [])
    if isinstance(workouts, dict):
        workouts = workouts.get("payload") or []

    imported = skipped = 0
    for w in (workouts or []):
        key = str(w.get("workoutKey") or w.get("id") or "")
        if not key:
            skipped += 1
            continue
        if _import_workout(db, user, token, key):
            imported += 1
        else:
            skipped += 1

    link.last_sync_at = datetime.now(timezone.utc)
    db.commit()
    return {"imported": imported, "skipped": skipped}


@router.post("/webhook")
async def webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    """Auto-Import: Suunto benachrichtigt bei neuem Workout (Notification enthält Username +
    Workout-Key). Wir lösen den Link über den Username auf, holen genau dieses Workout und
    importieren es. Antwortet immer schnell 200 (Webhook-Konvention). Öffentlich (keine Auth) —
    kein Schaden möglich: wir importieren nur Workouts des zum Username gehörenden Tokens."""
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return {"ok": True}
    # VERIFY: Feldnamen gegen die Suunto-Webhook-Doku (how-to-start) abgleichen.
    username = str(body.get("username") or body.get("user") or "")
    key = str(body.get("workoutid") or body.get("workoutKey") or body.get("id") or "")
    if not username or not key:
        return {"ok": True}
    link = db.query(models.SuuntoLink).filter_by(suunto_username=username).first()
    if link is None:
        return {"ok": True}   # kein verknüpfter Nutzer -> ignorieren
    user = db.get(models.User, link.user_id)
    if user is None:
        return {"ok": True}
    token = _fresh_token(link, db)
    if _import_workout(db, user, token, key):
        link.last_sync_at = datetime.now(timezone.utc)
        db.commit()
    return {"ok": True}


@router.delete("")
def unlink(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = db.query(models.SuuntoLink).filter_by(user_id=user.id).first()
    if link is not None:
        db.delete(link)
        db.commit()
    return {"ok": True}
