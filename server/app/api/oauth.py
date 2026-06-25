"""OAuth2-Login (Google/Apple/Strava/Garmin) — generischer Auth-Code-Flow.

Jeder Provider ist nur aktiv, wenn in der .env client_id+secret gesetzt sind
(OAUTH_<PROVIDER>_CLIENT_ID / _CLIENT_SECRET). Ohne Konfiguration erscheinen die
Buttons nicht und die Endpunkte liefern 404 — bestehender E-Mail-Login bleibt unberührt.

Redirect-URI je Provider (beim Provider registrieren):
    {BASE_URL}/api/auth/oauth/<provider>/callback

Hinweise:
- Google/Apple liefern eine E-Mail (im id_token) -> Login/Registrierung per E-Mail.
- Strava/Garmin liefern keine E-Mail -> Konto wird per stabiler Provider-ID verknüpft
  (synthetische E-Mail <provider>_<id>@oauth.local).
- Garmin: erfordert Teilnahme am Garmin Connect Developer Program. Die hier
  hinterlegten Endpunkte ggf. an die aktuelle Garmin-Doku anpassen. Über dieselbe
  Verknüpfung lassen sich später Aktivitäten/FIT beziehen (Activity API) — separater Schritt.
"""
from __future__ import annotations

import base64
import hashlib
import json
import secrets

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from ..security import create_access_token, hash_password

router = APIRouter(prefix="/api/auth/oauth", tags=["oauth"])

# Provider-Registry: Endpunkte + Scopes + Feature-Flags.
PROVIDERS: dict[str, dict] = {
    "google": {
        "label": "Google",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid email profile",
        "pkce": True,
    },
    "apple": {
        "label": "Apple",
        "authorize_url": "https://appleid.apple.com/auth/authorize",
        "token_url": "https://appleid.apple.com/auth/token",
        "userinfo_url": None,  # E-Mail/sub kommen aus dem id_token
        "scope": "name email",
        "pkce": False,
        "response_mode": "form_post",
    },
    "strava": {
        "label": "Strava",
        "authorize_url": "https://www.strava.com/oauth/authorize",
        "token_url": "https://www.strava.com/oauth/token",
        "userinfo_url": None,  # token-Response enthält athlete{}
        "scope": "read",
        "pkce": False,
    },
    "garmin": {
        "label": "Garmin",
        "authorize_url": "https://connect.garmin.com/oauth2Confirm",
        "token_url": "https://diauth.garmin.com/di-oauth2-service/oauth/token",
        "userinfo_url": "https://apis.garmin.com/wellness-api/rest/user/id",
        "scope": "",
        "pkce": True,
    },
}


def _enabled(provider: str) -> dict:
    cfg = PROVIDERS.get(provider)
    if cfg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown provider")
    creds = get_settings().oauth.get(provider, {})
    if not creds.get("client_id") or not creds.get("client_secret"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not configured")
    return {**cfg, **creds}


def _redirect_uri(provider: str) -> str:
    return f"{get_settings().base_url}/api/auth/oauth/{provider}/callback"


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


@router.get("/providers")
def providers() -> list[dict]:
    """Liste der aktivierten Provider (für die Login-Buttons)."""
    oauth = get_settings().oauth
    return [
        {"id": p, "label": cfg["label"]}
        for p, cfg in PROVIDERS.items()
        if oauth.get(p, {}).get("client_id") and oauth.get(p, {}).get("client_secret")
    ]


@router.get("/{provider}/start")
def start(provider: str):
    """Startet den Login: leitet zum Provider-Consent weiter (state+PKCE im Cookie)."""
    cfg = _enabled(provider)
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": cfg["client_id"],
        "redirect_uri": _redirect_uri(provider),
        "response_type": "code",
        "scope": cfg["scope"],
        "state": state,
    }
    if cfg.get("response_mode"):
        params["response_mode"] = cfg["response_mode"]
    verifier = ""
    if cfg.get("pkce"):
        verifier = secrets.token_urlsafe(48)
        challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
        params["code_challenge"] = challenge
        params["code_challenge_method"] = "S256"
    from urllib.parse import urlencode

    resp = RedirectResponse(f"{cfg['authorize_url']}?{urlencode(params)}")
    secure = get_settings().base_url.startswith("https")
    resp.set_cookie("oauth_state", state, max_age=600, httponly=True, secure=secure, samesite="lax")
    if verifier:
        resp.set_cookie("oauth_pkce", verifier, max_age=600, httponly=True, secure=secure, samesite="lax")
    return resp


def _decode_id_token(id_token: str) -> dict:
    """JWT-Payload ohne Signaturprüfung lesen (kam direkt vom Token-Endpoint über TLS)."""
    try:
        payload = id_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:  # noqa: BLE001
        return {}


def _identity(provider: str, cfg: dict, token: dict) -> tuple[str, str | None, str | None]:
    """(subject, email, name) aus Token-/Userinfo-Antwort des Providers ziehen."""
    if provider in ("google", "apple"):
        claims = _decode_id_token(token.get("id_token", ""))
        sub = claims.get("sub") or ""
        # Nur VORNAME als Anzeigename — kein Nachname (Datenschutz).
        name = claims.get("given_name") or (claims.get("name") or "").split(" ")[0].strip() or None
        return sub, claims.get("email"), name
    if provider == "strava":
        ath = token.get("athlete") or {}
        sub = str(ath.get("id") or "")
        name = (ath.get("firstname") or "").strip() or None  # nur Vorname, kein Nachname
        return sub, None, name
    # garmin (+ generischer Fallback): User-ID separat abrufen
    access = token.get("access_token", "")
    sub = ""
    if cfg.get("userinfo_url"):
        try:
            r = httpx.get(cfg["userinfo_url"], headers={"Authorization": f"Bearer {access}"}, timeout=15)
            if r.status_code == 200:
                data = r.json()
                sub = str(data.get("userId") or data.get("sub") or data.get("id") or "")
        except Exception:  # noqa: BLE001
            sub = ""
    return sub, None, None


def _unique_display_name(db: Session, name: str | None) -> str | None:
    n = (name or "").strip()
    if not (2 <= len(n) <= 40):
        return None
    if db.query(models.User).filter(func.lower(models.User.display_name) == n.lower()).first():
        return None  # vergeben -> Nutzer setzt später selbst einen
    return n


@router.api_route("/{provider}/callback", methods=["GET", "POST"])
async def callback(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
    oauth_state: str | None = Cookie(None),
    oauth_pkce: str | None = Cookie(None),
):
    """Tauscht den Code gegen ein Token, ermittelt die Identität, loggt ein/registriert
    und leitet mit unserem JWT zurück ins Frontend (#token=...)."""
    cfg = _enabled(provider)
    # Code/State aus Query (GET) oder Form (Apple form_post).
    params = dict(request.query_params)
    if request.method == "POST":
        params.update({k: v for k, v in (await request.form()).items()})
    code, state = params.get("code"), params.get("state")
    if not code or not state or state != oauth_state:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid OAuth state")

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": _redirect_uri(provider),
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
    }
    if cfg.get("pkce") and oauth_pkce:
        data["code_verifier"] = oauth_pkce
    try:
        tr = httpx.post(cfg["token_url"], data=data,
                        headers={"Accept": "application/json"}, timeout=20)
        token = tr.json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Token exchange failed") from exc
    if "access_token" not in token and "id_token" not in token:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No token from provider")

    subject, email, name = _identity(provider, cfg, token)
    if not subject:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No identity from provider")

    # 1) bekannte Verknüpfung?
    ident = db.query(models.OAuthIdentity).filter_by(provider=provider, subject=subject).first()
    if ident:
        user = db.get(models.User, ident.user_id)
    else:
        user = None
        if email:  # 2) per E-Mail einem bestehenden Konto zuordnen
            user = db.query(models.User).filter(func.lower(models.User.email) == email.lower()).first()
        if user is None:  # 3) neues Konto anlegen
            login_email = (email or f"{provider}_{subject}@oauth.local").lower()
            user = models.User(
                email=login_email,
                password_hash=hash_password(secrets.token_urlsafe(24)),
                display_name=_unique_display_name(db, name),
                language="de",
            )
            db.add(user)
            db.flush()
        db.add(models.OAuthIdentity(user_id=user.id, provider=provider, subject=subject))
    if user is None or user.blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account unavailable")
    db.commit()

    jwt = create_access_token(user.id)
    resp = RedirectResponse(f"{get_settings().base_url}/#token={jwt}")
    resp.delete_cookie("oauth_state")
    resp.delete_cookie("oauth_pkce")
    return resp
