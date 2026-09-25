"""OAuth-2.1-Autorisierungsserver fuer unseren MCP-Zugang.

**Wofuer.** Ein Nutzer soll seine EIGENEN Aufnahmen von einem KI-Agenten auswerten lassen koennen,
ohne uns ein Passwort oder einen Dauer-Schluessel in eine Konfigdatei zu schreiben. Der Agent holt
sich statt dessen ein zeitlich begrenztes Token, das der Nutzer einmal genehmigt und jederzeit
wieder zumachen kann.

**Der Bauplan kam aus dem eigenen Haus.** `coros_mcp.py` nebenan bedient seit dem 04.09.2026 genau
so einen Server als CLIENT — COROS hat einen MCP-Server ohne Antragsverfahren aufgemacht. Dort
steht im Kopfkommentar, was die Gegenseite koennen muss, und genau das ist hier gebaut:
Metadaten unter `/.well-known/…`, Dynamic Client Registration, ein OEFFENTLICHER Client ohne
Secret, PKCE als Pflicht.

**Warum es keinen Client-Secret gibt.** Ein MCP-Client laeuft auf dem Rechner des Nutzers und kann
kein Geheimnis bewahren; jeder, der die Datei oeffnet, haette es. Die Sicherheit haengt deshalb an
drei anderen Dingen: PKCE (der Code nuetzt nur dem, der die Anfrage gestellt hat), dem EXAKTEN
Abgleich der Rueckkehr-Adresse, und daran, dass der Nutzer selbst zustimmt.

**Was ein Token NICHT oeffnet** — die Grenze ist hart und steht in `mcp.py` im Kanon:
nur lesend, nur die eigenen Aufnahmen, keine aussortierten, keine geloeschten, nichts aus dem
Bestand anderer, keine Medien, keine Chats. „Oeffentlich" heisst bei uns „fuer angemeldete
Pumpfoil-Nutzer" — ein Dritter bekommt nur die Daten dessen, der zugestimmt hat.

**Die Falle dieser VM.** Der Reverse-Proxy steht auf einer ANDEREN Maschine; `request.base_url`
traegt hier den internen Host. Jede absolute Adresse in den Metadaten kommt deshalb aus
`settings.base_url` und nirgendwo sonst — sonst zeigt das Dokument auf eine Adresse, die kein
Client der Welt erreicht.
"""
from __future__ import annotations

import base64
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from ..ratelimit import rate_limit
from .deps import current_user

settings = get_settings()

# Router OHNE Praefix: die well-known-Dokumente muessen an der Wurzel liegen (RFC 8414/9728).
router = APIRouter(tags=["mcp-oauth"])

# --- Festlegungen ------------------------------------------------------------------------------
#
# Der Aussteller. NIE aus dem Request bauen (s. Kopfkommentar).
ISSUER = settings.base_url
# Die geschuetzte Ressource. Ein Token traegt sie als `aud` und gilt nirgendwo sonst (RFC 8707) —
# damit kann ein Token, das jemand fuer einen anderen MCP-Server erschlichen hat, bei uns nichts
# ausrichten, und unseres nirgends sonst.
RESOURCE = f"{ISSUER}/mcp"
# Nur dieser eine Bereich. Er sagt, was er ist, und mehr gibt es nicht zu haben.
SCOPE = "sessions:read"
# Kurz, weil ein Access-Token nicht widerrufbar ist (es steht nicht in der DB). Nach dem Widerruf
# eines Zugangs ist spaetestens nach dieser Zeit Schluss.
ACCESS_TTL = timedelta(minutes=15)
CODE_TTL = timedelta(minutes=5)
REFRESH_TTL = timedelta(days=60)
# Eigener Signaturzweck: ein MCP-Token darf NIEMALS als Anmelde-Token der Website durchgehen und
# umgekehrt. `security.decode_access_token` liest nur `sub` — ohne diese Trennung waere ein
# MCP-Token ein vollwertiger Login. Deshalb ein eigener Aussteller-Anspruch und ein eigener
# Schluessel, abgeleitet aus dem JWT-Geheimnis.
_MCP_SECRET = hashlib.sha256(f"mcp-oauth|{settings.jwt_secret}".encode()).hexdigest()
_TOKEN_TYP = "pumpfoil-mcp-access"


def _jetzt() -> datetime:
    return datetime.now(timezone.utc)


def _hash(wert: str) -> str:
    """Codes und Refresh-Tokens stehen nur als Hash in der DB — wer sie dort liest, kann nichts
    damit einloesen."""
    return hashlib.sha256(wert.encode()).hexdigest()


def _fehler(code: str, beschreibung: str, status_code: int = 400) -> JSONResponse:
    """OAuth-Fehler sind ein festgelegtes JSON-Format, keine FastAPI-`detail`-Meldung."""
    return JSONResponse({"error": code, "error_description": beschreibung}, status_code=status_code)


# --- Metadaten ---------------------------------------------------------------------------------

@router.get("/.well-known/oauth-protected-resource")
@router.get("/.well-known/oauth-protected-resource/mcp")
def geschuetzte_ressource() -> dict:
    """RFC 9728. Sagt einem Client, WO er sich fuer diese Ressource ein Token holt.

    Seit der MCP-Fassung vom Juni 2025 ist das der Einstieg: der Client ruft `/mcp` auf, bekommt
    401 mit einem `WWW-Authenticate`-Kopf, der hierher zeigt, und findet erst hier den
    Autorisierungsserver. Vorher musste er ihn raten.
    """
    return {
        "resource": RESOURCE,
        "authorization_servers": [ISSUER],
        "scopes_supported": [SCOPE],
        "bearer_methods_supported": ["header"],
        "resource_documentation": f"{ISSUER}/changelog",
    }


@router.get("/.well-known/oauth-authorization-server")
def autorisierungsserver() -> dict:
    """RFC 8414. Was dieser Server kann — und was ausdruecklich nicht."""
    return {
        "issuer": ISSUER,
        "authorization_endpoint": f"{ISSUER}/oauth/authorize",
        "token_endpoint": f"{ISSUER}/oauth/token",
        "registration_endpoint": f"{ISSUER}/oauth/register",
        "revocation_endpoint": f"{ISSUER}/oauth/revoke",
        "scopes_supported": [SCOPE],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        # Oeffentliche Clients, kein Secret.
        "token_endpoint_auth_methods_supported": ["none"],
        # NUR S256. `plain` ist in OAuth 2.1 gestrichen und waere hier wirkungslos.
        "code_challenge_methods_supported": ["S256"],
        "resource_indicators_supported": True,
    }


# --- Dynamic Client Registration (RFC 7591) ----------------------------------------------------

def _redirect_erlaubt(uri: str) -> bool:
    """Welche Rueckkehr-Adressen wir annehmen.

    Ein Angreifer, der eine beliebige Adresse eintragen darf, laesst den Code dorthin schicken.
    Deshalb: entweder https (echte Anwendung im Netz) oder eine Adresse auf dem Rechner des
    Nutzers — das ist der Normalfall bei Desktop-Clients, und http ist dort erlaubt, weil der
    Verkehr die Maschine nie verlaesst. Alles andere (eigene Schemata, http im Netz) lehnen wir ab.
    """
    if uri.startswith("https://"):
        return True
    for erlaubt in ("http://127.0.0.1", "http://[::1]", "http://localhost"):
        if uri.startswith(erlaubt + "/") or uri.startswith(erlaubt + ":"):
            return True
    return False


@router.post("/oauth/register",
             dependencies=[Depends(rate_limit(20, 3600, "mcp-register"))])
def registrieren(body: dict, db: Session = Depends(get_db)):
    """Ein neuer MCP-Client meldet sich an. OHNE Login — so ist es vorgesehen.

    Das ist der einzige Schreib-Endpunkt hier, den jeder erreicht: ein Client kann sich schlecht
    anmelden, wenn er dafuer schon angemeldet sein muesste. Registriert sein heisst deshalb
    ausdruecklich NICHT, an Daten zu kommen — es heisst nur, fragen zu duerfen. Den Zugriff gibt
    allein der Nutzer im Zustimmungsschritt.

    Dagegen gestellt: 20 Registrierungen je Stunde und Adresse.
    """
    uris = body.get("redirect_uris")
    if not isinstance(uris, list) or not uris or not all(isinstance(u, str) for u in uris):
        return _fehler("invalid_redirect_uri", "redirect_uris fehlt oder ist keine Liste.")
    if len(uris) > 5:
        return _fehler("invalid_redirect_uri", "Hoechstens fuenf Rueckkehr-Adressen.")
    for u in uris:
        if len(u) > 255 or not _redirect_erlaubt(u):
            return _fehler("invalid_redirect_uri",
                           f"Nicht erlaubte Rueckkehr-Adresse: {u[:80]}")

    verfahren = body.get("token_endpoint_auth_method", "none")
    if verfahren != "none":
        # Wir geben keine Secrets aus, also koennen wir auch keins pruefen.
        return _fehler("invalid_client_metadata",
                       "Nur oeffentliche Clients (token_endpoint_auth_method: none).")

    client = models.OAuthClient(
        client_id=secrets.token_urlsafe(24),
        client_name=(body.get("client_name") or "")[:120] or None,
        redirect_uris=json.dumps(uris),
        client_uri=(body.get("client_uri") or "")[:255] or None,
        software_id=(body.get("software_id") or "")[:120] or None,
    )
    db.add(client)
    db.commit()
    return JSONResponse({
        "client_id": client.client_id,
        # 0 = laeuft nicht ab. Ungenutzte Registrierungen raeumen wir statt dessen selbst weg.
        "client_id_issued_at": int(client.created_at.timestamp()),
        "client_secret_expires_at": 0,
        "redirect_uris": uris,
        "token_endpoint_auth_method": "none",
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "client_name": client.client_name,
        "scope": SCOPE,
    }, status_code=201)


# --- Zustimmung --------------------------------------------------------------------------------

def _client_holen(db: Session, client_id: str) -> models.OAuthClient | None:
    return db.query(models.OAuthClient).filter(models.OAuthClient.client_id == client_id).first()


@router.get("/oauth/authorize")
def autorisieren(request: Request, db: Session = Depends(get_db)):
    """Einstieg des Nutzers. Prueft die Anfrage und reicht sie an die Zustimmungsseite weiter.

    **Warum hier nichts angezeigt wird:** die Seite ist Teil der PWA, damit der Nutzer sie in
    seiner Sprache und im gewohnten Aussehen sieht und damit die Anmeldung dort stattfindet, wo
    sie ohnehin stattfindet. Dieser Endpunkt prueft nur und leitet weiter.

    **Fehler gehen NICHT an den Client zurueck, solange `client_id`/`redirect_uri` nicht geprueft
    sind** — sonst wuerde man eine Weiterleitung auf eine beliebige Adresse bauen. Erst wenn beide
    stimmen, ist eine Fehler-Weiterleitung dorthin zulaessig.
    """
    p = request.query_params
    client_id = p.get("client_id") or ""
    redirect_uri = p.get("redirect_uri") or ""
    client = _client_holen(db, client_id)
    if client is None:
        return _fehler("invalid_client", "Unbekannter Client.")
    if redirect_uri not in json.loads(client.redirect_uris):
        # EXAKTER Abgleich, kein Praefix: sonst genuegt eine offene Weiterleitung beim Client.
        return _fehler("invalid_request", "Rueckkehr-Adresse gehoert nicht zu diesem Client.")

    # Ab hier duerfen Fehler an den Client zurueck.
    def zurueck(code: str, beschreibung: str):
        from urllib.parse import urlencode
        teile = {"error": code, "error_description": beschreibung}
        if p.get("state"):
            teile["state"] = p["state"]
        trenner = "&" if "?" in redirect_uri else "?"
        return JSONResponse(status_code=302, content=None,
                            headers={"Location": f"{redirect_uri}{trenner}{urlencode(teile)}"})

    if p.get("response_type") != "code":
        return zurueck("unsupported_response_type", "Nur response_type=code.")
    if p.get("code_challenge_method") != "S256":
        return zurueck("invalid_request", "PKCE mit S256 ist Pflicht.")
    herausforderung = p.get("code_challenge") or ""
    if not (43 <= len(herausforderung) <= 128):
        return zurueck("invalid_request", "code_challenge fehlt oder hat eine falsche Laenge.")
    # RFC 8707: fragt der Client nach einer Ressource, muss es unsere sein.
    ressource = p.get("resource")
    if ressource and ressource.rstrip("/") != RESOURCE:
        return zurueck("invalid_target", "Dieses Token gaelte fuer eine andere Ressource.")

    # Weiter zur Zustimmungsseite der PWA. Die Angaben reisen als Parameter mit; nichts davon ist
    # geheim, und gespeichert wird erst, wenn der Nutzer zustimmt.
    from urllib.parse import urlencode
    weiter = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_challenge": herausforderung,
        "state": p.get("state") or "",
        "resource": ressource or RESOURCE,
    }
    return JSONResponse(status_code=302, content=None,
                        headers={"Location": f"{ISSUER}/oauth/consent?{urlencode(weiter)}"})


@router.post("/oauth/consent")
def zustimmen(body: dict,
              user: models.User = Depends(current_user),
              db: Session = Depends(get_db)):
    """Der ANGEMELDETE Nutzer stimmt zu. Ergebnis ist ein Autorisierungscode.

    Alles wird hier NOCH EINMAL geprueft, obwohl `/oauth/authorize` es schon getan hat: zwischen
    beiden Schritten liegt der Browser des Nutzers, und was von dort kommt, ist eine Behauptung.
    """
    client_id = body.get("client_id") or ""
    redirect_uri = body.get("redirect_uri") or ""
    herausforderung = body.get("code_challenge") or ""
    client = _client_holen(db, client_id)
    if client is None or redirect_uri not in json.loads(client.redirect_uris):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Client oder Rueckkehr-Adresse stimmt nicht.")
    if not (43 <= len(herausforderung) <= 128):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "code_challenge fehlt.")
    ressource = (body.get("resource") or RESOURCE).rstrip("/")
    if ressource != RESOURCE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falsche Ressource.")

    code = secrets.token_urlsafe(32)
    db.add(models.OAuthGrant(
        code_hash=_hash(code), client_id=client_id, user_id=user.id,
        redirect_uri=redirect_uri, code_challenge=herausforderung, scope=SCOPE,
        resource=ressource, expires_at=_jetzt() + CODE_TTL,
    ))
    client.last_used_at = _jetzt()
    db.commit()
    return {"code": code, "redirect_uri": redirect_uri}


# --- Tokens ------------------------------------------------------------------------------------

def _access_token(user_id: int, client_id: str) -> str:
    """Kurzlebiges JWT. `aud` bindet es an UNSERE Ressource (RFC 8707)."""
    jetzt = _jetzt()
    return jwt.encode({
        "iss": ISSUER, "sub": str(user_id), "aud": RESOURCE, "azp": client_id,
        "scope": SCOPE, "typ": _TOKEN_TYP,
        "iat": jetzt, "exp": jetzt + ACCESS_TTL,
    }, _MCP_SECRET, algorithm="HS256")


def access_token_pruefen(token: str) -> int | None:
    """Gibt die user_id zurueck — oder None. Von `mcp.py` benutzt.

    Geprueft werden Aussteller, Empfaenger UND der eigene Typ-Anspruch. Der Typ ist der Riegel
    gegen die gefaehrlichste Verwechslung: ein Anmelde-Token der Website darf hier nicht gelten
    und ein MCP-Token dort nicht. Die Schluessel sind ohnehin verschieden, der Anspruch ist der
    zweite Riegel.
    """
    try:
        nutzlast = jwt.decode(token, _MCP_SECRET, algorithms=["HS256"],
                              audience=RESOURCE, issuer=ISSUER)
        if nutzlast.get("typ") != _TOKEN_TYP:
            return None
        return int(nutzlast["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def _refresh_ausgeben(db: Session, user_id: int, client_id: str) -> str:
    roh = secrets.token_urlsafe(32)
    db.add(models.OAuthToken(
        token_hash=_hash(roh), client_id=client_id, user_id=user_id,
        scope=SCOPE, resource=RESOURCE, expires_at=_jetzt() + REFRESH_TTL,
    ))
    return roh


def _antwort(db: Session, user_id: int, client_id: str) -> JSONResponse:
    refresh = _refresh_ausgeben(db, user_id, client_id)
    db.commit()
    return JSONResponse({
        "access_token": _access_token(user_id, client_id),
        "token_type": "Bearer",
        "expires_in": int(ACCESS_TTL.total_seconds()),
        "refresh_token": refresh,
        "scope": SCOPE,
    })


@router.post("/oauth/token", dependencies=[Depends(rate_limit(120, 3600, "mcp-token"))])
def token(grant_type: str = Form(...),
          code: str | None = Form(None),
          redirect_uri: str | None = Form(None),
          client_id: str | None = Form(None),
          code_verifier: str | None = Form(None),
          refresh_token: str | None = Form(None),
          resource: str | None = Form(None),
          db: Session = Depends(get_db)):
    """Code gegen Tokens tauschen, oder ein Refresh-Token erneuern.

    Der Inhalt kommt als Formular, nicht als JSON — so steht es in RFC 6749, und so schicken es
    die Clients.
    """
    if resource and resource.rstrip("/") != RESOURCE:
        return _fehler("invalid_target", "Token fuer eine andere Ressource.")

    if grant_type == "authorization_code":
        if not (code and redirect_uri and client_id and code_verifier):
            return _fehler("invalid_request", "code, redirect_uri, client_id und code_verifier noetig.")
        grant = db.query(models.OAuthGrant).filter(
            models.OAuthGrant.code_hash == _hash(code)).first()
        if grant is None:
            return _fehler("invalid_grant", "Code unbekannt.")
        if grant.used_at is not None:
            # RFC 6749 §10.5: ein zweiter Versuch heisst, dass der Code abgefangen wurde.
            # Dann fliegt alles raus, was aus ihm entstanden ist.
            db.query(models.OAuthToken).filter(
                models.OAuthToken.user_id == grant.user_id,
                models.OAuthToken.client_id == grant.client_id,
                models.OAuthToken.revoked_at.is_(None),
            ).update({"revoked_at": _jetzt()}, synchronize_session=False)
            db.commit()
            return _fehler("invalid_grant", "Code war schon eingeloest. Alle Zugaenge dieses "
                                            "Clients wurden vorsorglich geschlossen.")
        if grant.expires_at < _jetzt():
            return _fehler("invalid_grant", "Code abgelaufen.")
        if grant.client_id != client_id or grant.redirect_uri != redirect_uri:
            return _fehler("invalid_grant", "Code gehoert zu einer anderen Anfrage.")
        # PKCE: S256(verifier) muss die hinterlegte Herausforderung ergeben.
        gerechnet = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode()).digest()).decode().rstrip("=")
        if not secrets.compare_digest(gerechnet, grant.code_challenge):
            return _fehler("invalid_grant", "code_verifier passt nicht.")
        grant.used_at = _jetzt()
        return _antwort(db, grant.user_id, grant.client_id)

    if grant_type == "refresh_token":
        if not refresh_token:
            return _fehler("invalid_request", "refresh_token fehlt.")
        alt = db.query(models.OAuthToken).filter(
            models.OAuthToken.token_hash == _hash(refresh_token)).first()
        if alt is None:
            return _fehler("invalid_grant", "Unbekanntes Refresh-Token.")
        if alt.ersetzt_durch is not None:
            # Ein schon getauschtes Token taucht wieder auf -> kopiert. Ganze Kette zu.
            db.query(models.OAuthToken).filter(
                models.OAuthToken.user_id == alt.user_id,
                models.OAuthToken.client_id == alt.client_id,
                models.OAuthToken.revoked_at.is_(None),
            ).update({"revoked_at": _jetzt()}, synchronize_session=False)
            db.commit()
            return _fehler("invalid_grant", "Dieses Token war bereits getauscht. Alle Zugaenge "
                                            "dieses Clients wurden geschlossen.")
        if alt.revoked_at is not None or alt.expires_at < _jetzt():
            return _fehler("invalid_grant", "Refresh-Token abgelaufen oder widerrufen.")
        neu = _refresh_ausgeben(db, alt.user_id, alt.client_id)
        alt.ersetzt_durch = _hash(neu)
        alt.revoked_at = _jetzt()
        alt.last_used_at = _jetzt()
        db.commit()
        return JSONResponse({
            "access_token": _access_token(alt.user_id, alt.client_id),
            "token_type": "Bearer",
            "expires_in": int(ACCESS_TTL.total_seconds()),
            "refresh_token": neu,
            "scope": SCOPE,
        })

    return _fehler("unsupported_grant_type", "Nur authorization_code und refresh_token.")


@router.post("/oauth/revoke")
def widerrufen(token: str = Form(...), db: Session = Depends(get_db)):
    """RFC 7009. Antwortet IMMER mit 200 — auch bei einem unbekannten Token.

    Das ist Absicht: eine unterscheidende Antwort waere ein Orakel, mit dem man gueltige Tokens
    erraten koennte. Access-Tokens stehen nicht in der DB; sie laufen von selbst ab (15 Minuten).
    """
    zeile = db.query(models.OAuthToken).filter(
        models.OAuthToken.token_hash == _hash(token)).first()
    if zeile is not None and zeile.revoked_at is None:
        zeile.revoked_at = _jetzt()
        db.commit()
    return {}
