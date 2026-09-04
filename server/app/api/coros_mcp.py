"""COROS über den MCP-Server: Konto verknüpfen + Trainings als FIT importieren.

**Warum es diesen zweiten COROS-Weg gibt.** `coros.py` daneben spricht die klassische
COROS Open API (Push per Webhook). Die braucht einen Partner-Vertrag; unser Antrag lag
seit dem 16.07.2026 bei COROS. Am 04.09.2026 kam die Antwort: COROS hat statt dessen
einen **MCP-Server** aufgemacht, „no application or approval needed", OAuth 2.0, und
darüber gibt es Aktivitätslisten UND den FIT-Download. Damit ist COROS für uns offen,
ohne auf den Vertrag zu warten. Die Datei hier ist dieser Weg; `coros.py` bleibt
unangetastet, falls der Partner-Weg (Webhooks, Zwei-Wege-Sync) später doch kommt.

**Was MCP hier praktisch bedeutet.** Der Server ist eine JSON-RPC-2.0-Schnittstelle über
HTTP („Streamable HTTP"): erst `initialize`, dann `tools/call` mit dem Namen des
Werkzeugs. Die Antwort kommt als JSON *oder* als Server-Sent-Events-Strom — beides muss
der Client lesen können (s. `_rpc`). Nichts daran ist KI-spezifisch; wir benutzen es wie
eine gewöhnliche REST-API.

**Anmeldung ohne Antrag (belegt am 04.09.).** Der Server veröffentlicht seine
OAuth-Metadaten unter `/.well-known/oauth-authorization-server` und erlaubt **Dynamic
Client Registration** (`/connect/register`). Unsere Registrierung lief durch und ergab
einen *öffentlichen* Client (`token_endpoint_auth_method: none`) — es gibt also kein
Client-Secret, und **PKCE ist Pflicht**. Genau so ist der Ablauf unten gebaut.

Ablauf:
1. `GET /connect`  (eingeloggt) -> Authorize-URL. `state` = signiertes JWT mit user_id UND
   dem PKCE-Verifier, damit wir serverseitig nichts zwischenspeichern müssen.
2. `GET /callback` -> Code + Verifier gegen Tokens tauschen, Link speichern.
3. `POST /sync`    -> `querySportRecords` -> `downloadActivityFitFiles` -> Import wie beim
   manuellen FIT-Upload (`import_parsed_session`, idempotent über `content_hash`).

**Kontingent:** 50 FIT-Dateien je Konto und Kalendertag (COROS-Doku). Der Sync hört von
selbst auf, bevor er dagegenläuft, und merkt sich den Stand über `last_sync_at`.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from .deps import current_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations/coros/mcp", tags=["coros-mcp"])

# Regionale Server (COROS-Doku): mcpeu für Europa, mcpus, mcpcn für Festland-China.
# `mcp.coros.com` verweist in seinen Metadaten selbst auf die regionale Adresse.
BASE = os.environ.get("COROS_MCP_BASE", "https://mcpeu.coros.com").rstrip("/")
MCP_URL = f"{BASE}/mcp"
AUTHORIZE_URL = f"{BASE}/oauth2/authorize"
TOKEN_URL = f"{BASE}/oauth2/token"
SCOPE = "openid mcp.tools offline_access"     # offline_access = Refresh-Token
PROTOCOL_VERSION = "2025-06-18"

# So viele FIT-Dateien holen wir höchstens je Sync — COROS erlaubt 50 pro Konto und Tag.
# Der Rest kommt beim nächsten Lauf; lieber mehrfach nachholen als ins Kontingent laufen.
MAX_FITS_JE_SYNC = 25


def _client_id() -> str:
    """Client-ID aus der dynamischen Registrierung (server/.env). Fehlt sie, ist die
    Anbindung schlicht nicht verfügbar — genau wie bei den anderen Konto-Anbindungen."""
    cid = (os.environ.get("OAUTH_COROS_MCP_CLIENT_ID") or "").strip()
    if not cid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "COROS MCP not configured")
    return cid


def _redirect_uri() -> str:
    return f"{get_settings().base_url}/api/integrations/coros/mcp/callback"


def _state_for(uid: int, verifier: str) -> str:
    s = get_settings()
    return pyjwt.encode(
        {"uid": uid, "v": verifier, "scope": "coros-mcp-link", "exp": int(time.time()) + 600},
        s.jwt_secret, algorithm=s.jwt_algorithm,
    )


def _state_lesen(state: str) -> tuple[int | None, str | None]:
    s = get_settings()
    try:
        d = pyjwt.decode(state, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except Exception:  # noqa: BLE001 — abgelaufen oder manipuliert: beides „ungültig"
        return None, None
    if d.get("scope") != "coros-mcp-link":
        return None, None
    return d.get("uid"), d.get("v")


def _pkce() -> tuple[str, str]:
    """(verifier, challenge) nach RFC 7636, S256 — der Server verlangt es (kein Secret)."""
    verifier = secrets.token_urlsafe(64)[:96]
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


# --------------------------------------------------------------------------------------
# Tokens


def _tokens_speichern(link: models.CorosMcpLink, daten: dict) -> None:
    link.access_token = daten.get("access_token") or ""
    if daten.get("refresh_token"):
        link.refresh_token = daten["refresh_token"]
    sek = int(daten.get("expires_in") or 3600)
    # Eine Minute Sicherheitsabstand: lieber einmal zu früh erneuern als mitten im Sync 401.
    link.expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(sek - 60, 60))


def _frischer_token(link: models.CorosMcpLink, db: Session) -> str:
    if link.expires_at and link.expires_at > datetime.now(timezone.utc):
        return link.access_token
    if not link.refresh_token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "COROS link expired, please reconnect")
    try:
        r = httpx.post(TOKEN_URL, data={
            "grant_type": "refresh_token",
            "refresh_token": link.refresh_token,
            "client_id": _client_id(),
        }, timeout=30)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "COROS unreachable") from exc
    if r.status_code != 200:
        log.warning("coros-mcp: refresh fehlgeschlagen (user %s): %s %s", link.user_id, r.status_code, r.text[:200])
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "COROS link expired, please reconnect")
    _tokens_speichern(link, r.json())
    db.commit()
    return link.access_token


# --------------------------------------------------------------------------------------
# MCP-Transport


def _antwort_lesen(r: httpx.Response) -> dict:
    """Streamable HTTP: der Server darf mit JSON ODER mit einem SSE-Strom antworten.
    Beim SSE-Strom steht die eigentliche Antwort in einer `data:`-Zeile."""
    typ = (r.headers.get("content-type") or "").lower()
    if "text/event-stream" in typ:
        for zeile in r.text.splitlines():
            if zeile.startswith("data:"):
                roh = zeile[5:].strip()
                if not roh:
                    continue
                try:
                    d = json.loads(roh)
                except json.JSONDecodeError:
                    continue
                if isinstance(d, dict) and ("result" in d or "error" in d):
                    return d
        return {}
    try:
        return r.json()
    except Exception:  # noqa: BLE001
        return {}


class McpSitzung:
    """Eine MCP-Sitzung: `initialize`, danach beliebig viele `tools/call`.

    Die Sitzungs-ID kommt als Kopfzeile `Mcp-Session-Id` zurück und muss bei jedem
    weiteren Aufruf mitgeschickt werden — fehlt sie, antwortet der Server mit 400.
    """

    def __init__(self, token: str) -> None:
        self.token = token
        self.sid: str | None = None
        self._id = 0

    def _kopf(self) -> dict:
        h = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            # Beide Formen erlauben — welche kommt, entscheidet der Server.
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": PROTOCOL_VERSION,
        }
        if self.sid:
            h["Mcp-Session-Id"] = self.sid
        return h

    def _rpc(self, method: str, params: dict | None = None, *, notification: bool = False) -> dict:
        koerper: dict = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            koerper["params"] = params
        if not notification:
            self._id += 1
            koerper["id"] = self._id
        try:
            r = httpx.post(MCP_URL, headers=self._kopf(), json=koerper, timeout=90)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "COROS unreachable") from exc
        if r.headers.get("mcp-session-id"):
            self.sid = r.headers["mcp-session-id"]
        if r.status_code == 401:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "COROS link expired, please reconnect")
        if r.status_code >= 400:
            log.warning("coros-mcp: %s -> HTTP %s %s", method, r.status_code, r.text[:200])
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"COROS MCP failed ({r.status_code})")
        if notification:
            return {}
        d = _antwort_lesen(r)
        if "error" in d:
            log.warning("coros-mcp: %s -> Fehler %s", method, str(d["error"])[:200])
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "COROS MCP error")
        return d.get("result") or {}

    def start(self) -> dict:
        res = self._rpc("initialize", {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "pumpfoil.org", "version": "1.0"},
        })
        # Der Vertrag verlangt diese Benachrichtigung nach dem initialize.
        self._rpc("notifications/initialized", {}, notification=True)
        return res

    def werkzeuge(self) -> list:
        return (self._rpc("tools/list") or {}).get("tools") or []

    def rufe(self, name: str, argumente: dict) -> dict:
        return self._rpc("tools/call", {"name": name, "arguments": argumente})


def _inhalt_text(res: dict) -> str:
    """Alle Text-Blöcke einer Werkzeug-Antwort zusammenfügen."""
    return "\n".join(c.get("text") or "" for c in (res.get("content") or []) if c.get("type") == "text")


def _inhalt_json(res: dict):
    """Strukturierte Antwort, falls vorhanden, sonst den Text als JSON lesen."""
    if isinstance(res.get("structuredContent"), (dict, list)):
        return res["structuredContent"]
    txt = _inhalt_text(res).strip()
    if not txt:
        return None
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        return None


# --------------------------------------------------------------------------------------
# Endpunkte


@router.get("/status")
def status_(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    verfuegbar = bool((os.environ.get("OAUTH_COROS_MCP_CLIENT_ID") or "").strip())
    link = db.query(models.CorosMcpLink).filter_by(user_id=user.id).first() if verfuegbar else None
    return {
        "available": verfuegbar,
        "linked": link is not None,
        "last_sync_at": link.last_sync_at.isoformat() if link and link.last_sync_at else None,
    }


@router.get("/connect")
def connect(user: models.User = Depends(current_user)) -> dict:
    verifier, challenge = _pkce()
    q = urlencode({
        "response_type": "code",
        "client_id": _client_id(),
        "redirect_uri": _redirect_uri(),
        "scope": SCOPE,
        "state": _state_for(user.id, verifier),
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })
    return {"authorize_url": f"{AUTHORIZE_URL}?{q}"}


def _fehlerseite(kopf: str, warum: str) -> HTMLResponse:
    return HTMLResponse(
        f"<html><body style='font-family:sans-serif;padding:2rem'>"
        f"<h2>{kopf}</h2><p>{warum}</p>"
        f"<p><a href='/konten'>&larr; zurück</a></p></body></html>",
        status_code=status.HTTP_400_BAD_REQUEST,
    )


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, db: Session = Depends(get_db)):
    if not code or not state:
        return RedirectResponse("/konten?coros=cancelled", status_code=302)
    uid, verifier = _state_lesen(state)
    if uid is None or not verifier:
        return _fehlerseite("Verknüpfung abgelaufen", "Bitte noch einmal von vorn beginnen.")
    user = db.get(models.User, uid)
    if user is None:
        return _fehlerseite("Konto nicht gefunden", "Bitte neu anmelden und erneut versuchen.")
    try:
        r = httpx.post(TOKEN_URL, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _redirect_uri(),
            "client_id": _client_id(),
            "code_verifier": verifier,
        }, timeout=30)
    except Exception:  # noqa: BLE001
        return _fehlerseite("COROS nicht erreichbar", "Bitte später noch einmal versuchen.")
    if r.status_code != 200:
        log.warning("coros-mcp: Token-Tausch fehlgeschlagen: %s %s", r.status_code, r.text[:200])
        return _fehlerseite("COROS hat die Verknüpfung abgelehnt", f"Fehlercode {r.status_code}.")

    link = db.query(models.CorosMcpLink).filter_by(user_id=user.id).first()
    if link is None:
        link = models.CorosMcpLink(user_id=user.id, access_token="", refresh_token="")
        db.add(link)
    _tokens_speichern(link, r.json())
    db.commit()
    return RedirectResponse("/konten?coros=connected", status_code=302)


@router.get("/tools")
def tools(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Werkzeug-Liste des MCP-Servers — für die Diagnose.

    COROS dokumentiert die Namen, aber nicht die Parameter. Statt zu raten, holt man sie
    sich hier einmal mit einem echten Token und sieht die Schemata im Klartext."""
    link = db.query(models.CorosMcpLink).filter_by(user_id=user.id).first()
    if link is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "COROS not linked")
    s = McpSitzung(_frischer_token(link, db))
    s.start()
    return {"tools": s.werkzeuge()}


def _fit_bytes_aus(res: dict) -> list[bytes]:
    """FIT-Dateien aus einer Werkzeug-Antwort ziehen.

    Zwei Wege, beide vorgesehen: der Server schickt die Datei als Base64-Blob im
    `resource`-Inhalt — oder (Rückfall des zweiten Werkzeugs) nur eine URL, die wir dann
    selbst laden. Was wirklich kommt, entscheidet der Server; wir nehmen beides an."""
    aus: list[bytes] = []
    for c in res.get("content") or []:
        art = c.get("type")
        if art == "resource":
            r = c.get("resource") or {}
            if r.get("blob"):
                try:
                    aus.append(base64.b64decode(r["blob"]))
                except Exception:  # noqa: BLE001
                    continue
        elif art == "text":
            txt = (c.get("text") or "").strip()
            if txt.startswith("http"):
                try:
                    fr = httpx.get(txt, timeout=60)
                    if fr.status_code == 200 and fr.content:
                        aus.append(fr.content)
                except Exception:  # noqa: BLE001
                    continue
    return aus


def _aktivitaeten_aus(res: dict) -> list[tuple[str, int | None]]:
    """(labelId, sportType) je Training aus der Antwort von `querySportRecords`.

    Der Server ist fuer KI-Clients gebaut und antwortet in Prosa („No sport records found from
    … to …"), nicht zwingend in JSON. Deshalb zwei Wege: strukturierte Antwort, wenn es sie
    gibt — sonst die `labelId`s aus dem Text klauben. Ein `labelId` ist eine lange Ziffernfolge;
    `sportType` steht, wenn ueberhaupt, in derselben Zeile.
    """
    daten = _inhalt_json(res)
    aus: list[tuple[str, int | None]] = []
    if isinstance(daten, dict):
        daten = daten.get("records") or daten.get("data") or daten.get("activities")
    if isinstance(daten, list):
        for e in daten:
            if not isinstance(e, dict):
                continue
            lid = e.get("labelId") or e.get("label_id") or e.get("activityId")
            if lid:
                st = e.get("sportType") or e.get("sport_type")
                aus.append((str(lid), int(st) if isinstance(st, (int, float)) else None))
        if aus:
            return aus
    # Rueckfall Text.
    import re as _re
    for zeile in _inhalt_text(res).splitlines():
        m = _re.search(r'labelId["\s:=]+(\d{6,})', zeile, _re.I) or _re.search(r'\b(\d{14,})\b', zeile)
        if not m:
            continue
        st = _re.search(r'sportType["\s:=]+(\d{1,4})', zeile, _re.I)
        aus.append((m.group(1), int(st.group(1)) if st else None))
    return aus


@router.post("/sync")
def sync(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Neue COROS-Trainings als FIT ziehen und als Sessions importieren (idempotent).

    **Am echten Server ausgemessen (04.09.), nicht geraten** — beides hat je einen Anlauf
    gekostet und steht deshalb hier:
      * **Datumsformat ist `YYYYMMDD`.** Mit `2026-06-01` antwortet der Server nicht etwa mit
        einer Fehlermeldung, sondern mit „Tool call anomalies detected. High risk of session
        context pollution…" — das ist seine Art, ungültige Eingaben abzulehnen. Wer diese
        Meldung sieht, hat einen Parameter falsch, nicht ein Kontingent gerissen.
      * **`downloadActivityFitFiles` kann NUR je Aktivität**, obwohl sein Schema `startDate`/
        `endDate`/`limit` anbietet: jede Zeitraum-Form wird mit derselben Meldung abgelehnt,
        während `labelId` + `sportType` eine echte Antwort liefert. Also erst die Liste holen,
        dann je Eintrag die Datei.
    """
    from .sessions import import_parsed_session   # lazy: vermeidet Import-Zyklus
    from ..fitimport import parse_fit_bytes

    link = db.query(models.CorosMcpLink).filter_by(user_id=user.id).first()
    if link is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "COROS not linked")

    sitzung = McpSitzung(_frischer_token(link, db))
    sitzung.start()

    # Zeitfenster: ab dem letzten Sync, beim ersten Mal 90 Tage zurueck.
    seit = (link.last_sync_at or datetime.now(timezone.utc) - timedelta(days=90))
    liste = sitzung.rufe("querySportRecords", {
        "startDate": seit.strftime("%Y%m%d"),
        "endDate": (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y%m%d"),
        "limit": MAX_FITS_JE_SYNC,
    })
    aktivitaeten = _aktivitaeten_aus(liste)

    imported = skipped = gescheitert = 0
    for labelId, sportType in aktivitaeten[:MAX_FITS_JE_SYNC]:
        args = {"labelId": labelId}
        if sportType is not None:
            args["sportType"] = sportType
        try:
            dateien = _fit_bytes_aus(sitzung.rufe("downloadActivityFitFiles", args))
            if not dateien:
                # Rueckfall des zweiten Werkzeugs: nur die URL, die wir dann selbst laden.
                dateien = _fit_bytes_aus(sitzung.rufe("queryActivityFitFileDownloadUrls", args))
            if not dateien:
                gescheitert += 1
                log.warning("coros-mcp: keine FIT-Datei fuer %s (user %s)", labelId, user.id)
                continue
            for roh in dateien:
                parsed = parse_fit_bytes(roh)
                if not parsed.get("gps_samples") or parsed.get("started_at") is None:
                    skipped += 1        # z. B. Indoor-Training ohne GPS
                    continue
                s = import_parsed_session(db, user, roh, parsed,
                                          src_label="coros-import", uuid_prefix="coros-")
                if s is None:
                    skipped += 1        # war schon da bzw. bewusst geloescht
                else:
                    imported += 1
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001 — ein kaputtes Training stoppt den Rest nicht
            gescheitert += 1
            log.warning("coros-mcp: Training %s nicht importiert (user %s): %s: %s",
                        labelId, user.id, type(exc).__name__, exc)

    # Wie bei Polar: den Stand nur weiterschieben, wenn nichts hart gescheitert ist — sonst
    # fiele ein Fehlschlag beim naechsten Lauf aus dem Fenster.
    if gescheitert == 0:
        link.last_sync_at = datetime.now(timezone.utc)
        db.commit()
    return {"imported": imported, "skipped": skipped, "failed": gescheitert,
            "found": len(aktivitaeten)}


@router.delete("")
def unlink(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = db.query(models.CorosMcpLink).filter_by(user_id=user.id).first()
    if link is not None:
        db.delete(link)
        db.commit()
    return {"ok": True}
