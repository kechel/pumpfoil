"""Polar AccessLink: Konto verknüpfen + Trainings als Sessions importieren.

Credential-gated (`OAUTH_POLAR_CLIENT_ID` / `_SECRET`). Polar bietet keinen FIT-Push,
sondern OAuth2 + die AccessLink-REST-API. Trainings holen wir als **TCX** und schicken
sie durch denselben Parser/Import wie der manuelle TCX/GPX-Upload (`import_parsed_session`).

Flow:
1. `GET /connect`  (eingeloggt) -> liefert die Polar-Authorize-URL (state = signiertes JWT mit user_id).
2. `GET /callback` -> Code gegen Token tauschen, AccessLink-User registrieren, Link speichern.
3. `POST /sync`    (eingeloggt) -> Exercise-Transaktion: neue Trainings als TCX ziehen + importieren.
"""
from __future__ import annotations

import base64
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/integrations/polar", tags=["polar"])

AUTHORIZE_URL = "https://flow.polar.com/oauth2/authorization"
TOKEN_URL = "https://polarremote.com/v2/oauth2/token"
API = "https://www.polaraccesslink.com"


def _cfg() -> dict:
    return get_settings().oauth.get("polar", {})


def _creds() -> tuple[str, str]:
    c = _cfg()
    if not c.get("client_id") or not c.get("client_secret"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Polar not configured")
    return c["client_id"], c["client_secret"]


def _redirect_uri() -> str:
    return f"{get_settings().base_url}/api/integrations/polar/callback"


def _state_for(uid: int) -> str:
    s = get_settings()
    return pyjwt.encode(
        {"uid": uid, "scope": "polar-link", "exp": int(time.time()) + 600},
        s.jwt_secret, algorithm=s.jwt_algorithm,
    )


def _uid_from_state(state: str) -> int | None:
    s = get_settings()
    try:
        p = pyjwt.decode(state, s.jwt_secret, algorithms=[s.jwt_algorithm])
        return int(p["uid"]) if p.get("scope") == "polar-link" else None
    except Exception:  # noqa: BLE001
        return None


@router.get("/status")
def status_(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Für die UI: ist Polar überhaupt konfiguriert + ist dieser Nutzer verknüpft?"""
    c = _cfg()
    available = bool(c.get("client_id") and c.get("client_secret"))
    link = db.query(models.PolarLink).filter_by(user_id=user.id).first()
    return {
        "available": available,
        "linked": link is not None,
        "last_sync_at": link.last_sync_at.isoformat() if link and link.last_sync_at else None,
    }


@router.get("/connect")
def connect(user: models.User = Depends(current_user)) -> dict:
    """Liefert die Polar-Authorize-URL; das Frontend leitet dorthin weiter."""
    cid, _ = _creds()
    params = {
        "response_type": "code",
        "client_id": cid,
        "redirect_uri": _redirect_uri(),
        "scope": "accesslink.read_all",
        "state": _state_for(user.id),
    }
    return {"authorize_url": f"{AUTHORIZE_URL}?{urlencode(params)}"}


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, db: Session = Depends(get_db)):
    """Polar-Redirect (GET): Code -> Token, AccessLink-User registrieren, Link speichern."""
    cid, secret = _creds()
    uid = _uid_from_state(state or "")
    if not code or uid is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Polar state")
    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    try:
        tr = httpx.post(
            TOKEN_URL,
            data={"grant_type": "authorization_code", "code": code, "redirect_uri": _redirect_uri()},
            headers={"Authorization": f"Basic {basic}", "Accept": "application/json",
                     "Content-Type": "application/x-www-form-urlencoded"},
            timeout=20,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Polar token exchange failed") from exc
    if tr.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Polar token exchange failed ({tr.status_code})")
    tok = tr.json()
    access = tok.get("access_token")
    xuid = str(tok.get("x_user_id") or "")
    if not access or not xuid:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Polar token incomplete")

    member_id = f"pumpfoil-{uid}"
    # AccessLink-User registrieren (idempotent: 409 = bereits registriert).
    try:
        httpx.post(f"{API}/v3/users", json={"member-id": member_id},
                   headers={"Authorization": f"Bearer {access}", "Accept": "application/json"}, timeout=20)
    except Exception:  # noqa: BLE001
        pass  # Registrierung evtl. schon vorhanden -> Link trotzdem speichern

    link = db.query(models.PolarLink).filter_by(user_id=uid).first()
    if link is None:
        link = models.PolarLink(user_id=uid, polar_user_id=xuid, access_token=access, member_id=member_id)
        db.add(link)
    else:
        link.polar_user_id = xuid
        link.access_token = access
        link.member_id = member_id
    db.commit()
    # Zurück auf die „Verknüpfte Konten"-Seite (nicht auf die Startseite).
    return RedirectResponse(f"{get_settings().base_url}/konten?polar=connected", status_code=303)


@router.post("/sync")
def sync(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Neue Polar-Trainings (Exercise-Transaktion) als TCX ziehen und als Sessions importieren."""
    _creds()
    link = db.query(models.PolarLink).filter_by(user_id=user.id).first()
    if link is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Polar not linked")
    from .sessions import import_parsed_session  # lazy: vermeidet Import-Zyklus
    from ..tcximport import parse_track_bytes

    hdr = {"Authorization": f"Bearer {link.access_token}", "Accept": "application/json"}
    base = f"{API}/v3/users/{link.polar_user_id}/exercise-transactions"
    try:
        tr = httpx.post(base, headers=hdr, timeout=30)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Polar unreachable") from exc
    if tr.status_code == 204:  # keine neuen Trainings
        link.last_sync_at = datetime.now(timezone.utc)
        db.commit()
        return {"imported": 0, "skipped": 0, "message": "no new exercises"}
    if tr.status_code not in (200, 201):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Polar transaction failed ({tr.status_code})")
    tid = tr.json().get("transaction-id")
    listing = httpx.get(f"{base}/{tid}", headers=hdr, timeout=30)
    urls = listing.json().get("exercises", []) if listing.status_code == 200 else []

    imported = skipped = 0
    for url in urls:
        try:
            tcx = httpx.get(f"{url}/tcx",
                            headers={"Authorization": f"Bearer {link.access_token}",
                                     "Accept": "application/vnd.garmin.tcx+xml"}, timeout=60)
            if tcx.status_code != 200:
                skipped += 1
                continue
            parsed = parse_track_bytes(tcx.content, "polar.tcx")
            if not parsed.get("gps_samples") or parsed.get("started_at") is None:
                skipped += 1  # z. B. Indoor-Training ohne GPS
                continue
            s = import_parsed_session(db, user, tcx.content, parsed,
                                      src_label="polar-import", uuid_prefix="polar-")
            if s is None:
                skipped += 1
            else:
                imported += 1
        except Exception:  # noqa: BLE001 — ein kaputtes Exercise darf den Rest nicht stoppen
            skipped += 1

    # Transaktion bestätigen (markiert die Trainings als gelesen).
    try:
        httpx.put(f"{base}/{tid}", headers=hdr, timeout=30)
    except Exception:  # noqa: BLE001
        pass
    link.last_sync_at = datetime.now(timezone.utc)
    db.commit()
    return {"imported": imported, "skipped": skipped}


@router.delete("")
def unlink(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = db.query(models.PolarLink).filter_by(user_id=user.id).first()
    if link is not None:
        # Auch auf Polars Seite abmelden (AccessLink-User löschen) -> entzieht die App-Freigabe;
        # beim nächsten Verbinden kommt wieder der Consent-Bildschirm. Fehler ignorieren
        # (z. B. schon serverseitig entfernt) — unser Eintrag wird in jedem Fall gelöscht.
        try:
            httpx.delete(
                f"{API}/v3/users/{link.polar_user_id}",
                headers={"Authorization": f"Bearer {link.access_token}", "Accept": "application/json"},
                timeout=20,
            )
        except Exception:  # noqa: BLE001
            pass
        db.delete(link)
        db.commit()
    return {"ok": True}
