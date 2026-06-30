"""COROS Open API: Konto verknüpfen (OAuth2) + Workouts automatisch per Push importieren.

Credential-gated (`OAUTH_COROS_CLIENT_ID` / `_SECRET`). COROS-Modell (API Reference V2.0.6):
- OAuth2 authorization_code; accessToken 30 Tage, refreshToken läuft nie ab.
- **Workout Data Push (5.3):** COROS POSTet alle ~5 Min neue Workout-Summaries an unseren
  `/push`-Endpunkt (client/secret im Header zur Verifikation), jede Summary enthält eine
  `fitUrl` (.fit). Wir laden die .fit und schicken sie durch denselben Parser/Import wie der
  manuelle FIT-Upload (`import_parsed_session`). Idempotent über content_hash -> Duplikate
  (COROS retryt) sind unkritisch.
- `/health`: GET -> 200 für den von COROS geforderten Service-Status-Check.

Basis-Host per `COROS_API_BASE` umschaltbar (Default Prod `https://open.coros.com`,
Test `https://opentest.coros.com`).

Flow:
1. `GET /connect`  (eingeloggt) -> COROS-Authorize-URL (state = signiertes JWT mit user_id).
2. `GET /callback` -> Code gegen Token tauschen (access/refresh/openId), Link speichern.
3. COROS pusht Workouts -> `POST /push` -> .fit laden + importieren.
4. `DELETE ""` -> COROS-seitig deauthorize + Link löschen.
"""
from __future__ import annotations

import os
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

router = APIRouter(prefix="/api/integrations/coros", tags=["coros"])


def _base() -> str:
    return os.environ.get("COROS_API_BASE", "https://open.coros.com").rstrip("/")


def _cfg() -> dict:
    return get_settings().oauth.get("coros", {})


def _creds() -> tuple[str, str]:
    c = _cfg()
    if not c.get("client_id") or not c.get("client_secret"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "COROS not configured")
    return c["client_id"], c["client_secret"]


def _push_creds() -> tuple[str, str]:
    """client/secret, mit denen COROS Push-Requests signiert. Eigene Env-Variablen, falls
    COROS dafür separate Werte ausstellt; sonst Fallback auf die OAuth-Credentials."""
    c = _cfg()
    return (
        os.environ.get("OAUTH_COROS_PUSH_CLIENT") or c.get("client_id", ""),
        os.environ.get("OAUTH_COROS_PUSH_SECRET") or c.get("client_secret", ""),
    )


def _redirect_uri() -> str:
    return f"{get_settings().base_url}/api/integrations/coros/callback"


def _state_for(uid: int) -> str:
    s = get_settings()
    return pyjwt.encode(
        {"uid": uid, "scope": "coros-link", "exp": int(time.time()) + 600},
        s.jwt_secret, algorithm=s.jwt_algorithm,
    )


def _uid_from_state(state: str) -> int | None:
    s = get_settings()
    try:
        p = pyjwt.decode(state, s.jwt_secret, algorithms=[s.jwt_algorithm])
        return int(p["uid"]) if p.get("scope") == "coros-link" else None
    except Exception:  # noqa: BLE001
        return None


# --- Service-Status-Check (COROS pingt das; muss 200 liefern) --------------------------
@router.get("/health")
def health() -> dict:
    return {"ok": True}


@router.get("/status")
def status_(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """UI: ist COROS konfiguriert + ist dieser Nutzer verknüpft?"""
    c = _cfg()
    available = bool(c.get("client_id") and c.get("client_secret"))
    link = db.query(models.CorosLink).filter_by(user_id=user.id).first()
    return {
        "available": available,
        "linked": link is not None,
        "last_sync_at": link.last_sync_at.isoformat() if link and link.last_sync_at else None,
    }


@router.get("/connect")
def connect(user: models.User = Depends(current_user)) -> dict:
    """Liefert die COROS-Authorize-URL; das Frontend leitet dorthin weiter."""
    cid, _ = _creds()
    params = {
        "client_id": cid,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "state": _state_for(user.id),
    }
    return {"authorize_url": f"{_base()}/oauth2/authorize?{urlencode(params)}"}


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, db: Session = Depends(get_db)):
    """COROS-Redirect (GET): Code -> Token (access/refresh/openId), Link speichern."""
    cid, secret = _creds()
    uid = _uid_from_state(state or "")
    if not code or uid is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid COROS state")
    try:
        tr = httpx.post(
            f"{_base()}/oauth2/accesstoken",
            data={
                "client_id": cid,
                "client_secret": secret,
                "code": code,
                "redirect_uri": _redirect_uri(),
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            timeout=20,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "COROS token exchange failed") from exc
    if tr.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"COROS token exchange failed ({tr.status_code})")
    tok = tr.json()
    access = tok.get("access_token")
    refresh = tok.get("refresh_token") or ""
    open_id = str(tok.get("openId") or tok.get("open_id") or "")
    expires_in = int(tok.get("expires_in") or 0)
    if not access or not open_id:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "COROS token incomplete")
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in) if expires_in else None

    link = db.query(models.CorosLink).filter_by(user_id=uid).first()
    if link is None:
        link = models.CorosLink(user_id=uid, open_id=open_id, access_token=access,
                                refresh_token=refresh, token_expires_at=expires_at)
        db.add(link)
    else:
        link.open_id = open_id
        link.access_token = access
        link.refresh_token = refresh or link.refresh_token
        link.token_expires_at = expires_at
    db.commit()
    return RedirectResponse(f"{get_settings().base_url}/konten?coros=connected", status_code=303)


@router.post("/push")
async def push(request: Request, db: Session = Depends(get_db)) -> dict:
    """Workout Summary Data Push (5.3): COROS POSTet neue Workouts. client/secret im Header
    verifizieren, je Summary die fitUrl laden und importieren. Idempotent (content_hash).

    Antwortet immer 200/OK, solange die Verifikation passt — COROS retryt sonst (2×) und stellt
    nach 24 h ein. Vor der Freigabe (keine Push-Credentials konfiguriert) wird ein Ping
    angenommen, aber nichts importiert."""
    want_client, want_secret = _push_creds()
    got_client = request.headers.get("client") or ""
    got_secret = request.headers.get("secret") or ""
    if want_client and want_secret:
        if got_client != want_client or got_secret != want_secret:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid COROS push credentials")
    else:
        # Noch nicht konfiguriert (vor Freigabe) -> Ping bestätigen, kein Import.
        return {"result": "0000", "message": "OK"}

    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    items = body.get("sportDataList") or []

    from .sessions import import_parsed_session  # lazy: vermeidet Import-Zyklus
    from ..fitimport import parse_fit_bytes

    imported = 0
    for it in items:
        open_id = str(it.get("openId") or "")
        link = db.query(models.CorosLink).filter_by(open_id=open_id).first() if open_id else None
        if link is None:
            continue
        user = db.get(models.User, link.user_id)
        if user is None:
            continue
        # fitUrl der Summary; bei Multisport ohne Top-fitUrl die der Teil-Workouts.
        urls = []
        if it.get("fitUrl"):
            urls.append(it["fitUrl"])
        else:
            for sub in it.get("triathlonItemList") or []:
                if sub.get("fitUrl"):
                    urls.append(sub["fitUrl"])
        for fit_url in urls:
            try:
                r = httpx.get(fit_url, timeout=60)   # presignte OSS-URL, kein Auth nötig
                if r.status_code != 200 or not r.content:
                    continue
                parsed = parse_fit_bytes(r.content)
                if not parsed.get("gps_samples") or parsed.get("started_at") is None:
                    continue   # z. B. Indoor ohne GPS
                s = import_parsed_session(db, user, r.content, parsed,
                                          src_label="coros-import", uuid_prefix="coros-")
                if s is not None:
                    imported += 1
            except Exception:  # noqa: BLE001 — ein kaputtes Workout darf den Rest nicht stoppen
                continue
        link.last_sync_at = datetime.now(timezone.utc)
    db.commit()
    return {"result": "0000", "message": "OK", "imported": imported}


@router.delete("")
def unlink(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = db.query(models.CorosLink).filter_by(user_id=user.id).first()
    if link is not None:
        # Auch COROS-seitig deauthorize (Token in den Header) -> entzieht die App-Freigabe.
        try:
            httpx.post(f"{_base()}/oauth2/deauthorize",
                       headers={"token": link.access_token, "Accept": "application/json"},
                       timeout=20)
        except Exception:  # noqa: BLE001
            pass
        db.delete(link)
        db.commit()
    return {"ok": True}
