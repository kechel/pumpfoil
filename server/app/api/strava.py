"""Strava API: Konto verknüpfen (OAuth2) + Aktivitäten als Sessions importieren.

Credential-gated (`OAUTH_STRAVA_CLIENT_ID` / `OAUTH_STRAVA_CLIENT_SECRET`).
Strava-Modell (www.strava.com):
- OAuth2 authorization_code; Token-Endpoint mit client_id/secret im Body (KEIN Basic Auth).
  access_token läuft alle ~6h ab (Antwort liefert `expires_at` als absoluten Unix-Stempel)
  -> refresh_token (langlebig). scope=activity:read_all.
- Strava bietet KEINEN FIT-Download über die API. Stattdessen werden je Aktivität die
  GPS-Streams gezogen (GET /activities/{id}/streams?keys=latlng,time,velocity_smooth,heartrate)
  und daraus dieselbe gps_samples-Struktur wie aus FIT gebaut -> import_parsed_session.
  Idempotent über content_hash = sha256("strava-<activity_id>").

Pull-basiert (Sync-Button wie Polar/Suunto): holt die neuesten Aktivitäten seit dem letzten
Sync (`after`), je Aktivität ein Stream-Call. Rate-Limit-schonend gedeckelt (PER_SYNC_MAX).
"""
from __future__ import annotations

import hashlib
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

router = APIRouter(prefix="/api/integrations/strava", tags=["strava"])

AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
API = "https://www.strava.com/api/v3"
ACTIVITIES_URL = f"{API}/athlete/activities"
STREAMS_URL = API + "/activities/{id}/streams"

PER_SYNC_MAX = 30   # max. Aktivitäten je Sync (Rate-Limit: 100/15min, 1000/Tag)

# Strava sport_type -> unser sport-String. Wassersport wird durchgelassen; der Rest
# wird (nur) beim Default-Filter water_only übersprungen, ist aber per all=true importierbar.
_WATER_TYPES = {
    "Kitesurf": "kitesurf", "Windsurf": "windsurf", "Surfing": "surfing",
    "StandUpPaddling": "sup", "Canoeing": "canoeing", "Kayaking": "kayaking",
    "Rowing": "rowing", "Sail": "sailing", "Watersport": "open_water",
    "Workout": "open_water",   # Pump-Foiling wird auf Strava oft als generischer Workout geloggt
}


def _cfg() -> dict:
    return get_settings().oauth.get("strava", {})


def _creds() -> tuple[str, str]:
    c = _cfg()
    if not c.get("client_id") or not c.get("client_secret"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Strava not configured")
    return c["client_id"], c["client_secret"]


def _redirect_uri() -> str:
    return f"{get_settings().base_url}/api/integrations/strava/callback"


def _state_for(uid: int) -> str:
    s = get_settings()
    return pyjwt.encode(
        {"uid": uid, "scope": "strava-link", "exp": int(time.time()) + 600},
        s.jwt_secret, algorithm=s.jwt_algorithm,
    )


def _uid_from_state(state: str) -> int | None:
    s = get_settings()
    try:
        p = pyjwt.decode(state, s.jwt_secret, algorithms=[s.jwt_algorithm])
        return int(p["uid"]) if p.get("scope") == "strava-link" else None
    except Exception:  # noqa: BLE001
        return None


def _store_token(link: models.StravaLink, tok: dict) -> None:
    link.access_token = tok.get("access_token") or link.access_token
    if tok.get("refresh_token"):
        link.refresh_token = tok["refresh_token"]
    exp = tok.get("expires_at")   # absoluter Unix-Stempel
    link.token_expires_at = (
        datetime.fromtimestamp(int(exp), tz=timezone.utc) if exp else None
    )
    ath = tok.get("athlete") or {}
    if ath.get("id"):
        link.athlete_id = int(ath["id"])


def _fresh_token(link: models.StravaLink, db: Session) -> str:
    """access_token bei (baldigem) Ablauf per refresh_token erneuern (~6h Gültigkeit)."""
    exp = link.token_expires_at
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and (exp.timestamp() - 300) > time.time():
        return link.access_token
    cid, secret = _creds()
    r = httpx.post(TOKEN_URL, data={
        "client_id": cid, "client_secret": secret,
        "grant_type": "refresh_token", "refresh_token": link.refresh_token,
    }, timeout=20)
    if r.status_code == 200:
        _store_token(link, r.json())
        db.commit()
    return link.access_token


@router.get("/status")
def status_(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    c = _cfg()
    available = bool(c.get("client_id") and c.get("client_secret"))
    link = db.query(models.StravaLink).filter_by(user_id=user.id).first()
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
        "approval_prompt": "auto",
        "scope": "activity:read_all",
        "state": _state_for(user.id),
    }
    return {"authorize_url": f"{AUTHORIZE_URL}?{urlencode(params)}"}


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, db: Session = Depends(get_db)):
    cid, secret = _creds()
    uid = _uid_from_state(state or "")
    if not code or uid is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Strava state")
    try:
        tr = httpx.post(TOKEN_URL, data={
            "client_id": cid, "client_secret": secret,
            "code": code, "grant_type": "authorization_code",
        }, timeout=20)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Strava token exchange failed") from exc
    if tr.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Strava token exchange failed ({tr.status_code})")
    tok = tr.json()
    if not tok.get("access_token"):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Strava token incomplete")
    link = db.query(models.StravaLink).filter_by(user_id=uid).first()
    if link is None:
        link = models.StravaLink(user_id=uid, access_token="", refresh_token="")
        db.add(link)
    _store_token(link, tok)
    db.commit()
    return RedirectResponse(f"{get_settings().base_url}/konten?strava=connected", status_code=303)


def _parsed_from_streams(act: dict, streams: dict) -> dict | None:
    """Strava-Aktivität + Streams -> parsed-Dict wie der FIT-Parser (gps_samples …)."""
    latlng = (streams.get("latlng") or {}).get("data") or []
    tsec = (streams.get("time") or {}).get("data") or []
    vel = (streams.get("velocity_smooth") or {}).get("data") or []
    hr = (streams.get("heartrate") or {}).get("data") or []
    if not latlng or not tsec:
        return None
    start_iso = act.get("start_date")   # UTC ISO, z. B. "2026-06-01T07:24:09Z"
    if not start_iso:
        return None
    started_at = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    n = min(len(latlng), len(tsec))
    samples = []
    for i in range(n):
        ll = latlng[i]
        if not ll or len(ll) < 2:
            continue
        samples.append([
            int(tsec[i] * 1000),
            float(ll[0]), float(ll[1]),
            float(vel[i]) if i < len(vel) and vel[i] is not None else None,
            int(hr[i]) if i < len(hr) and hr[i] is not None else None,
            None,
        ])
    if not samples:
        return None
    sport = _WATER_TYPES.get(act.get("sport_type") or act.get("type") or "", "open_water")
    return {
        "gps_samples": samples, "accel_bytes": b"", "accel_hz": 0,
        "started_at": started_at, "sport": sport,
    }


@router.post("/sync")
def sync(water_only: bool = True, user: models.User = Depends(current_user),
         db: Session = Depends(get_db)) -> dict:
    """Neueste Aktivitäten seit letztem Sync ziehen und je GPS-Stream als Session importieren.
    water_only=true (Default) importiert nur Wassersport-Typen; all per ?water_only=false."""
    _creds()
    link = db.query(models.StravaLink).filter_by(user_id=user.id).first()
    if link is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Strava not linked")
    from .sessions import import_parsed_session  # lazy: vermeidet Import-Zyklus

    token = _fresh_token(link, db)
    hdr = {"Authorization": f"Bearer {token}"}
    params = {"per_page": PER_SYNC_MAX, "page": 1}
    if link.last_sync_at is not None:
        after = link.last_sync_at
        if after.tzinfo is None:
            after = after.replace(tzinfo=timezone.utc)
        params["after"] = int(after.timestamp())
    try:
        lr = httpx.get(ACTIVITIES_URL, headers=hdr, params=params, timeout=30)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Strava unreachable") from exc
    if lr.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Strava activities failed ({lr.status_code})")
    activities = lr.json() if isinstance(lr.json(), list) else []

    imported = skipped = 0
    for act in activities:
        st = act.get("sport_type") or act.get("type") or ""
        if water_only and st not in _WATER_TYPES:
            skipped += 1
            continue
        if not act.get("id"):
            skipped += 1
            continue
        try:
            sr = httpx.get(STREAMS_URL.format(id=act["id"]), headers=hdr, params={
                "keys": "latlng,time,velocity_smooth,heartrate", "key_by_type": "true",
            }, timeout=60)
            if sr.status_code != 200:
                skipped += 1
                continue
            parsed = _parsed_from_streams(act, sr.json())
            if parsed is None:
                skipped += 1
                continue
            raw = f"strava-{act['id']}".encode()   # stabiler Hash -> idempotent
            s = import_parsed_session(db, user, raw, parsed,
                                      src_label="strava-import", uuid_prefix="strava-")
            if s is None:
                skipped += 1
            else:
                imported += 1
        except Exception:  # noqa: BLE001 — eine kaputte Aktivität darf den Rest nicht stoppen
            skipped += 1

    link.last_sync_at = datetime.now(timezone.utc)
    db.commit()
    return {"imported": imported, "skipped": skipped}


@router.delete("")
def unlink(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = db.query(models.StravaLink).filter_by(user_id=user.id).first()
    if link is not None:
        db.delete(link)
        db.commit()
    return {"ok": True}
