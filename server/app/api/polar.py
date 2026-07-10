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
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from .deps import current_admin, current_user

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


def _ok_redirect() -> RedirectResponse:
    """Erfolg -> zurück auf die „Verknüpfte Konten"-Seite (Toast via ?polar=connected)."""
    return RedirectResponse(f"{get_settings().base_url}/konten?polar=connected", status_code=303)


def _error_page(headline: str, why: str, http_status: int = status.HTTP_400_BAD_REQUEST) -> HTMLResponse:
    """Menschenlesbare Fehlerseite (statt rohem JSON) im App-Look, mit klarer Ursache + Rück-Button."""
    base = get_settings().base_url
    html = f"""<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Polar-Verbindung</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:420px;text-align:center">
    <div style="font-size:44px;line-height:1">⚠️</div>
    <h1 style="font-size:20px;margin:14px 0 8px;font-weight:700">{headline}</h1>
    <p style="color:#94a3b8;font-size:14px;line-height:1.55;margin:0 0 20px">{why}</p>
    <a href="{base}/konten" style="display:inline-block;background:#22d3ee;color:#0f172a;font-weight:600;
text-decoration:none;padding:11px 20px;border-radius:12px">Zurück &amp; erneut verbinden</a>
  </div>
</body></html>"""
    return HTMLResponse(html, status_code=http_status)


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, db: Session = Depends(get_db)):
    """Polar-Redirect (GET): Code -> Token, AccessLink-User registrieren, Link speichern.

    Robust gegen Browser-Prefetch/Doppelaufruf: Polar-Codes gelten nur EINMAL. Lädt der Browser
    die Callback-URL vorab oder doppelt, scheitert der zweite Token-Tausch (400). Existiert dann
    bereits ein Link (der erste Aufruf war erfolgreich), melden wir trotzdem Erfolg statt Fehler."""
    cid, secret = _creds()
    uid = _uid_from_state(state or "")
    if not code or uid is None:
        return _error_page("Verbindungs-Link ungültig oder abgelaufen",
                           "Bitte starte die Verknüpfung neu: Verknüpfte Konten → Polar → Verbinden.")
    existing = db.query(models.PolarLink).filter_by(user_id=uid).first()
    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    try:
        tr = httpx.post(
            TOKEN_URL,
            data={"grant_type": "authorization_code", "code": code, "redirect_uri": _redirect_uri()},
            headers={"Authorization": f"Basic {basic}", "Accept": "application/json",
                     "Content-Type": "application/x-www-form-urlencoded"},
            timeout=20,
        )
    except Exception:  # noqa: BLE001
        if existing is not None:
            return _ok_redirect()   # war schon verbunden -> kein Fehler zeigen
        return _error_page("Polar war gerade nicht erreichbar",
                           "Kurzes Netzproblem beim Verbinden. Bitte gleich noch einmal versuchen.",
                           status.HTTP_502_BAD_GATEWAY)
    if tr.status_code != 200:
        if existing is not None:
            return _ok_redirect()   # Einmal-Code doppelt eingelöst, aber Link steht schon -> Erfolg
        return _error_page("Verbindungs-Code bereits verbraucht oder abgelaufen",
                           "Das passiert, wenn die Seite doppelt geladen oder vom Browser vorab "
                           "geöffnet wird — Polar-Codes gelten nur einmal. Klick einfach noch einmal "
                           "auf „Verbinden“.")
    tok = tr.json()
    access = tok.get("access_token")
    xuid = str(tok.get("x_user_id") or "")
    if not access or not xuid:
        if existing is not None:
            return _ok_redirect()
        return _error_page("Polar hat kein gültiges Token geliefert",
                           "Bitte versuch die Verknüpfung noch einmal.", status.HTTP_502_BAD_GATEWAY)

    member_id = f"pumpfoil-{uid}"
    # AccessLink-User registrieren (idempotent: 409 = bereits registriert).
    try:
        httpx.post(f"{API}/v3/users", json={"member-id": member_id},
                   headers={"Authorization": f"Bearer {access}", "Accept": "application/json"}, timeout=20)
    except Exception:  # noqa: BLE001
        pass  # Registrierung evtl. schon vorhanden -> Link trotzdem speichern

    link = existing
    if link is None:
        link = models.PolarLink(user_id=uid, polar_user_id=xuid, access_token=access, member_id=member_id)
        db.add(link)
    else:
        link.polar_user_id = xuid
        link.access_token = access
        link.member_id = member_id
    db.commit()
    return _ok_redirect()


def _pull_import(db: Session, user: models.User, link: models.PolarLink) -> dict:
    """Exercise-Transaktion abarbeiten: neue Trainings als TCX ziehen + importieren. Von /sync
    (manuell) UND vom Webhook (Auto-Import) genutzt."""
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


@router.post("/sync")
def sync(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Neue Polar-Trainings (Exercise-Transaktion) als TCX ziehen und als Sessions importieren."""
    _creds()
    link = db.query(models.PolarLink).filter_by(user_id=user.id).first()
    if link is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Polar not linked")
    return _pull_import(db, user, link)


def _webhook_secret() -> str:
    import os
    return os.environ.get("OAUTH_POLAR_WEBHOOK_SECRET", "")


@router.post("/webhook")
async def webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    """Auto-Import: Polar pingt bei neuem Training (event=EXERCISE, user_id=polar_user_id).
    Wir prüfen die Signatur (Polar-Webhook-Signature = HMAC-SHA256 des Rohbodys mit dem
    signature_secret_key der Webhook-Registrierung) und ziehen dann die Transaktion dieses
    Nutzers. Antwortet immer schnell 200 (Webhook-Konvention)."""
    raw = await request.body()
    secret = _webhook_secret()
    if secret:
        import hashlib
        import hmac
        sig = request.headers.get("Polar-Webhook-Signature", "")
        expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad signature")
    try:
        import json
        body = json.loads(raw or b"{}")
    except Exception:  # noqa: BLE001
        return {"ok": True}
    if body.get("event") not in (None, "EXERCISE"):
        return {"ok": True}   # nur Trainings interessieren uns
    xuid = str(body.get("user_id") or "")
    if not xuid:
        return {"ok": True}
    link = db.query(models.PolarLink).filter_by(polar_user_id=xuid).first()
    if link is None:
        return {"ok": True}
    user = db.get(models.User, link.user_id)
    if user is not None:
        try:
            _pull_import(db, user, link)
        except Exception:  # noqa: BLE001 — Ping darf nie 500 werfen
            pass
    return {"ok": True}


@router.post("/webhook/register")
def webhook_register(user: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    """Einmalige Admin-Aktion: den Webhook bei Polar registrieren (nur EIN Webhook je Client
    erlaubt). Gibt den signature_secret_key zurück -> in OAUTH_POLAR_WEBHOOK_SECRET eintragen
    + foil-server neu starten. Erneut aufrufen listet/ersetzt (Polar: DELETE dann POST)."""
    cid, secret = _creds()
    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    hdr = {"Authorization": f"Basic {basic}", "Content-Type": "application/json", "Accept": "application/json"}
    url = f"{get_settings().base_url}/api/integrations/polar/webhook"
    r = httpx.post(f"{API}/v3/webhooks", json={"events": ["EXERCISE"], "url": url}, headers=hdr, timeout=20)
    return {"status": r.status_code, "body": (r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text), "webhook_url": url}


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
