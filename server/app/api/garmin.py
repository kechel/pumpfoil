"""Garmin Connect: Konto verknuepfen (OAuth 2.0 mit PKCE) und Aktivitaeten per Push importieren.

Starter Access im Garmin Connect Developer Program, beantragt und freigegeben am 05.11.2026 (docs/TODO.md,
Einreichungs-Protokoll). Zugesagt und in der Datenschutzerklaerung (Impressum, Abschnitt Garmin) beschrieben:
nur Activity API, nur Wassersport-Aktivitaeten mit GPS ab der Verknuepfung, keine Gesundheitsdaten, kein Verkauf.
Garmins Unterlagen sind vertraulich und liegen nicht im Repo (~/garmin-doku auf der VM).

Ablauf:
1. `GET /connect` (eingeloggt): Code-Verifier erzeugen, Challenge (S256) an Garmin. Der Verifier reist
   VERSCHLUESSELT im signierten `state` mit (app/geheim.py) — so braucht es keine Tabelle fuer die Zwischenzeit
   zwischen den Server-Prozessen, und wer die Weiterleitung mitliest, bekommt ihn trotzdem nicht.
2. `GET /callback` -> wie bei Polar/COROS ueber verknuepfung.py: erst die PWA bzw. App schliesst mit ihrem Login ab.
   Dort: Code gegen Token tauschen (nur vom Server, mit Client-Secret), Garmin-User-ID holen, Link speichern.
3. Garmin pusht an `POST /push/activity-files` die Metadaten neuer Aktivitaeten mit einer einmal gueltigen
   Download-Adresse. Wir antworten sofort mit 200 und laden erst danach (Hintergrundaufgabe): Garmin wartet nur
   kurz und wiederholt sonst stuendlich.
4. `POST /push/deregistrations` (Nutzer hat in Garmin Connect getrennt) und `POST /push/permissions` (Freigaben
   geaendert) halten den Link aktuell.
5. `DELETE ""` trennt: Registrierung bei Garmin loeschen, dann den Link. Dasselbe beim Loeschen des Kontos
   (app/loeschung.py) — Garmin verlangt das fuer jeden Weg, auf dem jemand bei uns „trennen" kann.

Push-Anfragen tragen keine Signatur. Geschuetzt wird deshalb ueber das, was wir daraus machen: nur bekannte
Garmin-User-IDs, und geladen wird ausschliesslich von https://apis.garmin.com (sonst koennte jeder uns beliebige
Adressen abrufen lassen).
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit

import httpx
import jwt as pyjwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import geheim, models
from ..config import get_settings
from ..db import get_db
from . import verknuepfung
from .deps import current_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations/garmin", tags=["garmin"])

AUTHORIZE_URL = "https://connect.garmin.com/oauth2Confirm"
TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token"
API = "https://apis.garmin.com"
# Nur von hier wird geladen (Download-Adressen aus Push-Nachrichten).
DOWNLOAD_HOST = "apis.garmin.com"

# Profile: JEDES kommt, bis der Nutzer es abwaehlt (Jan, 05.11.2026: „lass uns alles speichern was kommt bis der user
# aktiv etwas abgewaehlt hat … wer weiss als was die user alles ihre sessions tracken") — wie bei Polar, Suunto und
# COROS (importsports). Vorher waren nur Wassersport-Profile an; dabei meldet Garmin sogar Aufnahmen unserer eigenen
# Connect-IQ-App als OTHER. Die festen Grenzen fuer Kontoverknuepfungen bleiben (ohne GPS und vor 2026 keine Session).

# Erneuern, wenn das Access-Token in weniger als dieser Zeit ablaeuft (Garmin raet zu Spielraum).
REFRESH_VORLAUF = timedelta(minutes=15)


def _creds() -> tuple[str, str]:
    cid = os.environ.get("GARMIN_CLIENT_ID", "")
    secret = os.environ.get("GARMIN_CLIENT_SECRET", "")
    if not cid or not secret:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Garmin not configured")
    return cid, secret


def verfuegbar() -> bool:
    return bool(os.environ.get("GARMIN_CLIENT_ID") and os.environ.get("GARMIN_CLIENT_SECRET"))


def fuer_nutzer_sichtbar(user: models.User) -> bool:
    """Vor der Freigabe fuer alle nur fuer Admins und Tester. `GARMIN_TESTER=12,34` (Nutzer-IDs) in server/.env zeigt
    die Verknuepfung weiteren Konten — Garmins Partner Verification verlangt zwei Nutzer mit Daten (05.11.2026).
    `GARMIN_OEFFENTLICH=1` gibt sie fuer alle frei."""
    tester = {t.strip() for t in os.environ.get("GARMIN_TESTER", "").split(",") if t.strip()}
    return verfuegbar() and (os.environ.get("GARMIN_OEFFENTLICH") == "1" or bool(user.is_admin)
                             or str(user.id) in tester)


def _redirect_uri() -> str:
    return f"{get_settings().base_url}/api/integrations/garmin/callback"


def _challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


def _state_for(uid: int, verifier: str) -> str:
    s = get_settings()
    return pyjwt.encode(
        {"uid": uid, "scope": "garmin-link", "v": geheim.verschluesseln(verifier), "exp": int(time.time()) + 900},
        s.jwt_secret, algorithm=s.jwt_algorithm,
    )


def _state_lesen(state: str) -> tuple[int, str] | None:
    s = get_settings()
    try:
        p = pyjwt.decode(state, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except Exception:  # noqa: BLE001
        return None
    if p.get("scope") != "garmin-link":
        return None
    v = geheim.entschluesseln(p.get("v"))
    return (int(p["uid"]), v) if v else None


def _uid_from_state(state: str) -> int | None:
    g = _state_lesen(state)
    return g[0] if g else None


def _jetzt() -> datetime:
    return datetime.now(timezone.utc)


def _aware(t: datetime | None) -> datetime | None:
    return t.replace(tzinfo=timezone.utc) if t is not None and t.tzinfo is None else t


def _tokens_uebernehmen(link: models.GarminLink, tok: dict) -> None:
    link.access_token = tok["access_token"]
    if tok.get("refresh_token"):
        link.refresh_token = tok["refresh_token"]
    if tok.get("expires_in"):
        link.token_expires_at = _jetzt() + timedelta(seconds=int(tok["expires_in"]))
    if tok.get("refresh_token_expires_in"):
        link.refresh_expires_at = _jetzt() + timedelta(seconds=int(tok["refresh_token_expires_in"]))


def _token_anfrage(daten: dict) -> dict:
    cid, secret = _creds()
    r = httpx.post(TOKEN_URL, data={**daten, "client_id": cid, "client_secret": secret},
                   headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
                   timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"Garmin-Token {r.status_code}: {r.text[:200]}")
    tok = r.json()
    if not tok.get("access_token"):
        raise RuntimeError("Garmin-Token ohne access_token")
    return tok


def gueltiges_token(link: models.GarminLink, db: Session) -> str:
    """Access-Token, bei Bedarf vorher erneuert (dabei kommt auch ein neues Refresh-Token)."""
    ablauf = _aware(link.token_expires_at)
    if ablauf is None or ablauf - _jetzt() < REFRESH_VORLAUF:
        tok = _token_anfrage({"grant_type": "refresh_token", "refresh_token": link.refresh_token})
        _tokens_uebernehmen(link, tok)
        db.commit()
    return link.access_token


@router.get("/status")
def status_(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = db.query(models.GarminLink).filter_by(user_id=user.id).first()
    # None = unbekannt (Abfrage beim Verbinden kam leer, s. unten) -> nicht warnen; "" = Garmin hat ausdruecklich
    # KEINE Freigabe gemeldet (Teilen in Garmin Connect ausgeschaltet, Push vom 05.11. 13:22) -> warnen.
    rechte = None if link is None or link.permissions is None else [r for r in link.permissions.split(",") if r]
    return {
        "available": fuer_nutzer_sichtbar(user),
        "linked": link is not None,
        "last_sync_at": link.last_sync_at.isoformat() if link and link.last_sync_at else None,
        # Hat der Nutzer in Garmin Connect das Teilen von Aktivitaeten ausgeschaltet, kommt nichts mehr an.
        "activity_export": rechte is None or "ACTIVITY_EXPORT" in rechte,
        # Refresh-Token abgelaufen (drei Monate ohne Erneuerung): neu verbinden noetig.
        "expired": bool(link and link.refresh_expires_at and _aware(link.refresh_expires_at) < _jetzt()),
    }


@router.get("/connect")
def connect(app: bool = False, user: models.User = Depends(current_user)) -> dict:
    cid, _ = _creds()
    if not fuer_nutzer_sichtbar(user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Garmin not available")
    verifier = secrets.token_urlsafe(64)[:96]
    params = {
        "response_type": "code",
        "client_id": cid,
        "code_challenge": _challenge(verifier),
        "code_challenge_method": "S256",
        "redirect_uri": _redirect_uri(),
        "state": verknuepfung.mit_app(_state_for(user.id, verifier), app),
    }
    return {"authorize_url": f"{AUTHORIZE_URL}?{urlencode(params)}"}


def _callback_ausfuehren(code: str | None = None, state: str | None = None, db: Session = Depends(get_db)):
    g = _state_lesen(state or "")
    if not code or g is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Garmin state")
    uid, verifier = g
    try:
        tok = _token_anfrage({"grant_type": "authorization_code", "code": code, "code_verifier": verifier,
                              "redirect_uri": _redirect_uri()})
        kopf = {"Authorization": f"Bearer {tok['access_token']}"}
        r = httpx.get(f"{API}/partner-gateway/rest/user/id", headers=kopf, timeout=20)
        r.raise_for_status()
        garmin_uid = str(r.json().get("userId") or "")
        rechte: list[str] = []
        try:
            p = httpx.get(f"{API}/partner-gateway/rest/user/permissions", headers=kopf, timeout=20)
            if p.status_code == 200:
                rechte = [str(x) for x in (p.json().get("permissions") or [])]
        except Exception:  # noqa: BLE001 — die Freigaben sind Zusatz, die Verknuepfung haengt nicht daran
            pass
    except Exception as exc:  # noqa: BLE001
        log.warning("garmin: Verknuepfen fehlgeschlagen (user %s): %s", uid, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Garmin token exchange failed") from exc
    if not garmin_uid:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Garmin user id missing")

    # Dieselbe Garmin-ID war an einem anderen Pumpfoil-Konto: Garmin kennt je App nur EINE Registrierung, die
    # neue gilt. Den alten Link entfernen, sonst landeten Aktivitaeten beim falschen Konto.
    for alt in db.query(models.GarminLink).filter(models.GarminLink.garmin_user_id == garmin_uid,
                                                  models.GarminLink.user_id != uid).all():
        db.delete(alt)
    link = db.query(models.GarminLink).filter_by(user_id=uid).first()
    if link is None:
        link = models.GarminLink(user_id=uid, garmin_user_id=garmin_uid, access_token="", refresh_token="")
        db.add(link)
    link.garmin_user_id = garmin_uid
    link.verbunden_am = _jetzt()
    link.permissions = ",".join(rechte)[:300] or None
    _tokens_uebernehmen(link, tok)
    db.commit()
    log.info("garmin: verknuepft (user %s)", uid)
    return RedirectResponse(f"{get_settings().base_url}/konten?garmin=connected", status_code=303)


@router.get("/callback")
def callback(request: Request):
    return verknuepfung.zur_bestaetigung("garmin", request)


@router.post("/abschliessen")
def abschliessen(body: verknuepfung.AbschlussIn, user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)) -> dict:
    return verknuepfung.abschliessen(user, _uid_from_state(body.state or ""),
                                     lambda: _callback_ausfuehren(code=body.code, state=body.state, db=db))


verknuepfung.routen_ohne_login(router, _uid_from_state,
                               lambda b, db: _callback_ausfuehren(code=b.code, state=b.state, db=db))


@router.get("/sports")
def sports_(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Die Garmin-Profile, die DIESER Nutzer uebertraegt — mit seiner Auswahl (wie Polar/Suunto/COROS)."""
    from .. import importsports
    return {"sports": importsports.liste(db, user.id, "garmin")}


@router.put("/sports")
def sports_setzen(wahl: dict[str, bool], user: models.User = Depends(current_user),
                  db: Session = Depends(get_db)) -> dict:
    from .. import importsports
    n = importsports.setzen(db, user.id, "garmin", wahl)
    return {"ok": True, "geaendert": n, "sports": importsports.liste(db, user.id, "garmin")}


# --- Push von Garmin ------------------------------------------------------------------------------------------------

async def _json_liste(request: Request, schluessel: str) -> list[dict]:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return []
    liste = body.get(schluessel) if isinstance(body, dict) else None
    return [x for x in liste if isinstance(x, dict)] if isinstance(liste, list) else []


def _sicherer_download(url: str) -> bool:
    try:
        u = urlsplit(url)
    except ValueError:
        return False
    return u.scheme == "https" and u.hostname == DOWNLOAD_HOST


def _profil(eintrag: dict) -> str:
    return str(eintrag.get("activityType") or "").upper().removesuffix("_V2").removesuffix("_WS")


def _produkt_der_uhr(db: Session, device_id: int | None) -> int | None:
    """Garmin-Produktnummer einer gekoppelten Uhr aus ihrer Part-Number („006-B3869-00" -> 3869); None = unbekannt."""
    import re
    if not device_id:
        return None
    pn = db.query(models.DeviceToken.part_number).filter_by(id=device_id).scalar()
    m = re.match(r"^\d{3}-B(\d+)-", pn or "")
    return int(m.group(1)) if m else None


def andere_uhr(db: Session, eigene: models.Session, produkt: int | None) -> bool:
    """Stammt die Garmin-Datei sicher von einer ANDEREN Uhr als die eigene Aufnahme? Nur wenn beide Nummern bekannt sind
    und sich unterscheiden (Jan, 07.11.2026: fēnix und FR55 gleichzeitig — der Import der einen Uhr landete in der
    Aufnahme der anderen). Unbekannt -> wie bisher allein nach der Zeit."""
    eig = _produkt_der_uhr(db, eigene.device_id)
    return eig is not None and produkt is not None and eig != produkt


def _produkt_der_datei(pfad) -> int | None:
    from ..fitimport import parse_fit_bytes
    try:
        return parse_fit_bytes(pfad.read_bytes()).get("garmin_produkt")
    except Exception:  # noqa: BLE001
        return None


def _eigene_aufnahme(db: Session, user_id: int, start: datetime, ende: datetime,
                     produkt: int | None = None) -> models.Session | None:
    """Aufnahme aus unseren eigenen Apps zur selben Zeit? Dann ist die Garmin-Aktivitaet dieselbe Fahrt — unsere
    Connect-IQ-App legt in Garmin Connect ebenfalls eine Aktivitaet an (oder das Handy lief daneben mit). Eigene
    Aufnahmen tragen ein Geraet (device_id), Importe nicht. Eine noch laufende zaehlt, wenn sie vorher begann."""
    from sqlalchemy import and_, or_
    S = models.Session
    kandidaten = (db.query(S).filter(
        S.user_id == user_id, S.deleted.isnot(True), S.device_id.isnot(None), S.started_at < ende,
        or_(S.ended_at > start, and_(S.ended_at.is_(None), S.started_at > start - timedelta(hours=12)))).all())
    # Ohne eingetragenes Ende (laeuft noch oder Ende nie gemeldet) nur bei fast gleichem Start — sonst koennte eine
    # liegengebliebene offene Aufnahme die Datei einer spaeteren Fahrt bekommen, deren eigener Upload noch aussteht.
    kandidaten = [x for x in kandidaten
                  if x.ended_at is not None or abs((_aware(x.started_at) - start).total_seconds()) <= 120]
    kandidaten = [x for x in kandidaten if not andere_uhr(db, x, produkt)]
    # Mehrere Treffer: die mit dem naechsten Start. Am 05.11.2026 hing eine 90-s-Fahrt (Start 14:38:28) an der
    # Aufnahme davor (14:38:09, 7 s, ohne eingetragenes Ende = „laeuft noch"), weil die frueheste gewann; dieselbe
    # Aufnahme beginnt in beiden Dateien auf die Sekunde gleich.
    return min(kandidaten, key=lambda x: abs((_aware(x.started_at) - start).total_seconds()), default=None)


def _sicherer_name(text: str) -> str:
    return "".join(c for c in str(text) if c.isalnum() or c in "-_")[:60] or "aktivitaet"


def datei_anhaengen(ziel: models.Session, roh: bytes, beschreibung: dict, praefix: str = "garmin-connect") -> str | None:
    """Garmin-Datei an eine Session haengen, ohne etwas zu ueberschreiben (Jan, 05.11.2026: „die daten von uhr und
    ueber garmin fuer die gleiche session verknuepfen … immer beide daten komplett speichern damit nichts verloren
    gehen kann"). Je Garmin-Aktivitaet eine NEUE Datei `garmin-connect-<summaryId>.fit` plus `.json` mit der
    Beschreibung — `server/data` ist per Hardlink mit den Sicherungen verbunden, ein Schreiben in eine vorhandene Datei
    wuerde auch die Sicherungen aendern. Gibt den Dateinamen zurueck (None, wenn es sie schon gab)."""
    import json as _json

    from .. import storage
    d = storage.ensure_session_dir(ziel.session_uuid)
    name = f"{praefix}-{_sicherer_name(beschreibung.get('summaryId') or beschreibung.get('activityId') or '')}"
    fit, info = d / f"{name}.fit", d / f"{name}.json"
    if fit.exists():
        return None
    fit.write_bytes(roh)
    info.write_text(_json.dumps({**beschreibung, "datei": fit.name, "angehaengt": _jetzt().isoformat()},
                                default=str, indent=2))
    return fit.name


def _beschreibung(eintrag: dict) -> dict:
    return {k: eintrag.get(k) for k in ("summaryId", "activityId", "activityType", "deviceName",
                                         "startTimeInSeconds", "durationInSeconds", "activityName")}


def _eigene_zum_eintrag(db: Session, user_id: int, eintrag: dict) -> models.Session | None:
    """Eigene Aufnahme zur Startzeit aus dem Push (ohne Download). Ohne Dauer zaehlt die erste Minute."""
    try:
        start = datetime.fromtimestamp(int(eintrag.get("startTimeInSeconds")), timezone.utc)
    except (TypeError, ValueError):
        return None
    try:
        dauer = max(int(eintrag.get("durationInSeconds") or 0), 60)
    except (TypeError, ValueError):
        dauer = 60
    return _eigene_aufnahme(db, user_id, start, start + timedelta(seconds=dauer))


class _Geladen:
    """Die geladene (oder gesicherte) Datei in der Form, die der Rest von aktivitaet_importieren erwartet (`.content`)."""
    def __init__(self, content: bytes):
        self.content = content
        self.status_code = 200


def aktivitaet_importieren(db: Session, link: models.GarminLink, eintrag: dict) -> str:
    """Eine Aktivitaetsdatei laden und importieren. Gibt den Ausgang als kurzes Wort zurueck (fuers Protokoll)."""
    from .. import importsports, storage
    from ..fitimport import parse_fit_bytes
    from .sessions import import_parsed_session

    profil = _profil(eintrag)
    if str(eintrag.get("fileType") or "FIT").upper() != "FIT":
        return "kein fit"
    url = str(eintrag.get("callbackURL") or "")
    if not _sicherer_download(url):
        log.warning("garmin: Download-Adresse abgelehnt (user %s): %s", link.user_id, url[:120])
        return "fremde adresse"
    user = db.get(models.User, link.user_id)
    if user is None:
        return "kein nutzer"
    # Immer erst laden: welches Profil wirklich lief, steht nur in der Datei (Profilname, Jan 05.11.2026), und ob sie zu
    # einer eigenen Aufnahme gehoert, entscheidet sich auch erst mit ihren Zeiten.
    # Schon einmal geladen (Neustart mitten in der Verarbeitung)? Dann die gesicherte Datei — die Adresse gilt nur einmal.
    roh = _ws_datei(eintrag)
    if roh is None:
        r = httpx.get(url, headers={"Authorization": f"Bearer {gueltiges_token(link, db)}"}, timeout=60)
        if r.status_code != 200 or not r.content:
            return f"download {r.status_code}"
        roh = r.content
        try:
            _ws_datei_merken(eintrag, roh)
        except OSError as exc:
            log.warning("garmin: Datei %s nicht gesichert: %s", eintrag.get("summaryId"), exc)
    r = _Geladen(roh)
    try:
        parsed = parse_fit_bytes(r.content)
    except Exception as exc:  # noqa: BLE001
        # Nicht lesbar: gehoert sie zu einer eigenen Aufnahme (Startzeit aus dem Push), trotzdem anhaengen — nichts
        # verlieren. Sonst wie bei allen Importen in die Quarantaene.
        eigene = _eigene_zum_eintrag(db, user.id, eintrag) if koennte_unsere_sein(eintrag) else None
        if eigene is not None:
            datei_anhaengen(eigene, r.content, _beschreibung(eintrag))
            return f"an eigene aufnahme #{eigene.id} angehaengt (datei nicht lesbar)"
        storage.quarantaene_ablegen(r.content, quelle="garmin", user_id=user.id, grund=f"{type(exc).__name__}: {exc}")
        return "fit kaputt"
    # Wie viel kommt ueber Garmin wirklich an? Groesse und Beschleunigung im Protokoll (Frage 05.11.2026: liefert die
    # API die Originaldatei mit den Sensor-Daten unserer Connect-IQ-App?).
    log.info("garmin: Datei %s (user %s): %d KB, GPS %d, Accel %d Werte, Profil %s", eintrag.get("summaryId"), user.id,
             len(r.content) // 1024, len(parsed.get("gps_samples") or []), len(parsed.get("accel_bytes") or b"") // 6,
             parsed.get("sport_name") or profil)
    # Der Profilname aus der Datei ist der verlaesslichere Hinweis auf unsere App als der Push (dort kann ein Titel stehen).
    if parsed.get("sport_name"):
        eintrag = {**eintrag, "activityName": parsed["sport_name"]}
    # Erst die eigene Aufnahme suchen, dann die Grenzen fuer neue Sessions pruefen: Aufnahmen ohne GPS (Tanz, Halle)
    # bekommen ihre Garmin-Datei sonst nie (05.11.2026).
    eigene = None
    if not koennte_unsere_sein(eintrag):
        pass   # Garmin-Profil-Aufnahme einer anderen Uhr: wird eine eigene Session, nie Anhang einer unserer
    elif parsed.get("started_at") is not None:
        start = _aware(parsed["started_at"])
        samples = parsed.get("gps_samples") or []
        ende = start + timedelta(milliseconds=int(samples[-1][0] if samples else parsed.get("dauer_ms") or 0))
        eigene = _eigene_aufnahme(db, user.id, start, max(ende, start + timedelta(seconds=60)),
                                  produkt=parsed.get("garmin_produkt"))
    if eigene is None and koennte_unsere_sein(eintrag):
        eigene = _eigene_zum_eintrag(db, user.id, eintrag)
        if eigene is not None and andere_uhr(db, eigene, parsed.get("garmin_produkt")):
            eigene = None
    if eigene is not None and not importsports.konto_import_grund(parsed) and garmin_ersetzt(eigene, parsed):
        # Garmins Datei ist die bessere Aufnahme: entweder hat die Uhr eigene Bloecke absichtlich weggelassen
        # (Datenwege, duenn) oder Garmins Beschleunigung hat die hoehere Rate. Sie wird die Session, unsere liefert
        # Sportart, Foil, Ausruestung und Geraet und zeigt danach auf sie (Jan, 05.11.2026).
        g = import_parsed_session(db, user, r.content, parsed, src_label="garmin-import", uuid_prefix="garmin-",
                                  filename="garmin.fit", sport_override=eigene.sport_class, ausser_id=eigene.id)
        if g is None or g.id == eigene.id:
            datei_anhaengen(eigene, r.content, _beschreibung(eintrag))
            return f"an eigene aufnahme #{eigene.id} angehaengt (import ging nicht)"
        if g.session_uuid.startswith("garmin-") and not g.device_model:
            g.device_model = geraet_name(eintrag.get("deviceName"))
        bleibt = in_garmin_session_aufgehen(db, eigene, g)
        if bleibt.id == eigene.id:
            return f"an eigene aufnahme #{eigene.id} angehaengt (garmin-datei mit weniger laeufen)"
        return f"eigene aufnahme #{eigene.id} -> garmin-session #{g.id} (bessere daten)"
    if eigene is not None:
        # Dieselbe Fahrt: keine zweite Session, aber die Garmin-Datei vollstaendig an unsere haengen.
        datei_anhaengen(eigene, r.content, _beschreibung(eintrag))
        return f"an eigene aufnahme #{eigene.id} angehaengt"
    # Ab hier wird es ggf. eine NEUE Session — jetzt entscheidet die Auswahl auf der Garmin-Karte, je Profil UND
    # Profilname („Andere: Foil", „Andere: Snowkite" … Jan, 05.11.2026). Neue Namen erben die Wahl ihres Profils.
    modus, label = modus_schluessel(profil, parsed.get("sport_name"))
    standard = importsports.erlaubt(db, user.id, "garmin", profil) if modus != profil else True
    if not importsports.merken(db, user.id, "garmin", modus, label=label, standard=standard).importieren:
        return "abgewaehlt"
    grund = importsports.konto_import_grund(parsed)
    if grund:
        if aus_unserer_app(eintrag) and parsed.get("started_at") is not None:
            # Unsere eigene Aufnahme kommt noch (Uhr nicht gekoppelt, kein Handy in der Naehe …): parken und beim
            # Abschluss anhaengen (nach_eigener_aufnahme). 05.11.2026: eine 8-s-Aufnahme ohne GPS-Fix kam zuerst ueber
            # Garmin, wurde verworfen — und fehlte, als unsere Aufnahme sechs Minuten spaeter kam.
            eingang_parken(user.id, r.content, _beschreibung(eintrag), _aware(parsed["started_at"]),
                           int(parsed.get("dauer_ms") or 0))
            return f"{grund}, geparkt bis zur eigenen aufnahme"
        return grund
    # „zaehlt als" je Profil (Garmin-Karte) wie bei Polar/Suunto/COROS — vorher speicherte der Server die Wahl nicht
    # und der Import fragte sie nicht ab (05.11.2026).
    s = import_parsed_session(db, user, r.content, parsed, src_label="garmin-import", uuid_prefix="garmin-",
                              filename="garmin.fit",   # Originaldatei als original.fit (sonst .bin)
                              sport_override=(importsports.sport_fuer_modus(user, "garmin", modus)
                                              or importsports.sport_fuer_modus(user, "garmin", profil)))
    if s is None:
        return "schon da"
    _push_merken(s, eintrag)
    # „Garmin [Geraet]" fuer das Uhr-Abzeichen (Markenvorgabe; sessions.import_geraet zeigt es an).
    if s.session_uuid.startswith("garmin-") and not s.device_model:
        s.device_model = geraet_name(eintrag.get("deviceName"))
        db.commit()
    return "importiert"


def modus_schluessel(profil: str, name: str | None) -> tuple[str, str]:
    """Schluessel + Anzeige fuer die Auswahl „zaehlt als": das Garmin-Profil, bei eigenen Profilen mit Namen
    („OTHER:Foil" -> „Foil (Other)"). Eigene Profile laufen fast immer unter „Andere"/generic, koennen aber auch
    auf einem anderen Profil aufsetzen — deshalb immer mit Profil davor."""
    basis = profil.replace("_", " ").title()
    n = " ".join(str(name or "").split())[:40]
    if not n or n.upper().replace(" ", "_") == profil or n.lower() in UNSERE_NAMEN:
        return profil, basis
    return f"{profil}:{n}", f"{n} ({basis})"


def _push_merken(s: models.Session, eintrag: dict) -> None:
    """Push-Angaben (Profil, Profilname, Geraet) neben die Garmin-Session legen — die andere Reihenfolge
    (nach_eigener_aufnahme) braucht den Profilnamen. Neue Datei, nie ueberschreiben."""
    import json as _json
    from .. import storage
    try:
        d = storage.session_dir(s.session_uuid)
        if d.exists() and not (d / "garmin-push.json").exists():
            (d / "garmin-push.json").write_text(_json.dumps(_beschreibung(eintrag), default=str, indent=2))
    except OSError as exc:
        log.warning("garmin: Push-Angaben fuer #%s nicht gespeichert: %s", s.id, exc)


def _push_gelesen(s: models.Session) -> dict:
    import json as _json
    from .. import storage
    try:
        return _json.loads((storage.session_dir(s.session_uuid) / "garmin-push.json").read_text())
    except (OSError, ValueError):
        return {}


def geraet_name(device_name) -> str:
    """„fenix 8" -> „Garmin fenix 8"; schon mit Garmin davor bleibt es; ohne Angabe nur „Garmin"."""
    n = " ".join(str(device_name or "").split())[:70]
    if not n:
        return "Garmin"
    return n if n.lower().startswith("garmin") else f"Garmin {n}"


# Warteschlange auf der Platte (Jan, 06.11.2026: „ja bitte immer sichern"). Garmins Download-Adresse gilt nur EINMAL,
# und die Verarbeitung laeuft nach der 200-Antwort im Serverprozess — ein Neustart dazwischen verlor die Aktivitaet.
# Jetzt: der Push liegt als <schluessel>.json in data/garmin-warteschlange, BEVOR Garmin die 200 bekommt; die geladene
# Datei als <schluessel>.fit, BEVOR sie gelesen wird. Beides verschwindet erst, wenn der Eintrag verarbeitet ist. Was
# liegen bleibt, holt app/nach_neustart.py nach dem naechsten Start nach (ohne neuen Download, wenn die Datei da ist).
WARTESCHLANGE = "garmin-warteschlange"


def _ws_dir():
    from ..config import get_settings
    d = get_settings().data_dir / WARTESCHLANGE
    d.mkdir(parents=True, exist_ok=True)
    return d


def _ws_schluessel(e: dict) -> str:
    roh = f"{e.get('userId')}-{e.get('summaryId') or e.get('callbackURL')}"
    import hashlib
    return hashlib.sha256(roh.encode()).hexdigest()[:24]


def warteschlange_merken(eintraege: list[dict]) -> None:
    import json as _json
    import os
    d = _ws_dir()
    for e in eintraege:
        p = d / f"{_ws_schluessel(e)}.json"
        neu = p.with_name(p.name + ".neu")
        neu.write_text(_json.dumps(e, default=str))
        os.replace(neu, p)


def _ws_datei_merken(e: dict, roh: bytes) -> None:
    import os
    p = _ws_dir() / f"{_ws_schluessel(e)}.fit"
    neu = p.with_name(p.name + ".neu")
    neu.write_bytes(roh)
    os.replace(neu, p)


def _ws_datei(e: dict) -> bytes | None:
    p = _ws_dir() / f"{_ws_schluessel(e)}.fit"
    try:
        return p.read_bytes()
    except OSError:
        return None


def _ws_erledigt(e: dict) -> None:
    d = _ws_dir()
    for endung in (".json", ".fit"):
        try:
            (d / f"{_ws_schluessel(e)}{endung}").unlink()
        except FileNotFoundError:
            pass


def warteschlange_nachholen(vor) -> int:
    """Eintraege, die vor `vor` (Prozessstart) abgelegt und nie fertig wurden, jetzt verarbeiten. -> Anzahl."""
    import json as _json
    eintraege = []
    for p in sorted(_ws_dir().glob("*.json")):
        try:
            if datetime.fromtimestamp(p.stat().st_mtime, timezone.utc) >= vor:
                continue
            eintraege.append(_json.loads(p.read_text()))
        except (OSError, ValueError):
            continue
    if eintraege:
        log.info("garmin: %d liegengebliebene Push(es) nach dem Neustart nachholen", len(eintraege))
        _activity_files_verarbeiten(eintraege)
    return len(eintraege)


def _activity_files_verarbeiten(eintraege: list[dict]) -> None:
    """Hintergrundaufgabe nach der 200-Antwort: eigene DB-Sitzung, ein kaputter Eintrag stoppt die anderen nicht."""
    from ..db import SessionLocal

    db = SessionLocal()
    try:
        for e in eintraege:
            gid = str(e.get("userId") or "")
            link = db.query(models.GarminLink).filter_by(garmin_user_id=gid).first() if gid else None
            if link is None:
                _ws_erledigt(e)   # Verbindung inzwischen getrennt: nichts mehr zu tun
                continue
            try:
                ausgang = aktivitaet_importieren(db, link, e)
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                ausgang = f"fehler {type(exc).__name__}"
                log.warning("garmin: Import fehlgeschlagen (user %s, %s): %s", link.user_id, e.get("summaryId"), exc)
            link.last_sync_at = _jetzt()
            db.commit()
            # Auch nach einem Fehler weg: ein Fehler im Import wiederholt sich beim naechsten Mal genauso (die Datei
            # selbst liegt dann in der Quarantaene bzw. an der Session). Nur ein Neustart mittendrin laesst sie liegen.
            _ws_erledigt(e)
            log.info("garmin: %s %s (user %s): %s", e.get("summaryId"), _profil(e), link.user_id, ausgang)
    finally:
        db.close()


@router.post("/push/activity-files")
async def push_activity_files(request: Request, hintergrund: BackgroundTasks) -> dict:
    eintraege = await _json_liste(request, "activityFiles")
    if eintraege:
        try:
            warteschlange_merken(eintraege)
        except OSError as exc:  # Platte voll o. ae.: trotzdem verarbeiten, nur ohne Absicherung
            log.warning("garmin: Warteschlange nicht geschrieben: %s", exc)
        hintergrund.add_task(_activity_files_verarbeiten, eintraege)
    return {"ok": True}


# Wer neu verbindet, beendet bei Garmin die alte Verbindung — Garmin schickt dafuer eine Abmeldung mit DERSELBEN
# Garmin-ID. Am 05.11.2026 kam sie drei Sekunden VOR dem Speichern der neuen Verbindung; kaeme sie danach, loeschte sie
# die frische. Abmeldungen kurz nach einem Verbinden gelten deshalb der alten Verbindung und werden uebergangen.
FRISCH_VERBUNDEN = timedelta(minutes=5)


@router.post("/push/deregistrations")
async def push_deregistrations(request: Request, db: Session = Depends(get_db)) -> dict:
    for e in await _json_liste(request, "deregistrations"):
        gid = str(e.get("userId") or "")
        for link in db.query(models.GarminLink).filter_by(garmin_user_id=gid).all() if gid else []:
            verbunden = _aware(link.verbunden_am or link.created_at)
            if verbunden is not None and _jetzt() - verbunden < FRISCH_VERBUNDEN:
                log.info("garmin: Abmeldung kurz nach dem Verbinden uebergangen (user %s)", link.user_id)
                continue
            log.info("garmin: in Garmin Connect getrennt (user %s)", link.user_id)
            db.delete(link)
    db.commit()
    return {"ok": True}


@router.post("/push/permissions")
async def push_permissions(request: Request, db: Session = Depends(get_db)) -> dict:
    for e in await _json_liste(request, "userPermissionsChange"):
        gid = str(e.get("userId") or "")
        link = db.query(models.GarminLink).filter_by(garmin_user_id=gid).first() if gid else None
        if link is not None:
            # Leere Liste ausdruecklich als "" speichern (keine Freigabe), nicht als None (unbekannt).
            link.permissions = ",".join(str(x) for x in (e.get("permissions") or []))[:300]
    db.commit()
    return {"ok": True}


def nutzerinhalte_uebertragen(db: Session, von: models.Session, nach: models.Session) -> None:
    """Alles, was Menschen an der Garmin-Session gemacht haben, kommt an die eigene (Jan, 05.11.2026: „das darf eigentlich
    nie passieren, sowas muss immer uebertragen oder verknuepft gemeinsam angezeigt werden"). Die Garmin-Session ist ab
    dem Push sichtbar, bis unser Upload fertig ist — in der Zeit kann kommentiert, geliked, ein Foto angehaengt werden.
    Fotos/Videos mit Herkunft wie beim Zusammenfuehren (merge.py). Doppelte Likes/Stimmen desselben Nutzers bleiben an
    der alten Zeile (gleiche Aussage, eine Unique-Grenze je Session)."""
    from ..merge import sync_video_mirror
    for M in (models.SessionPhoto, models.SessionVideo):
        db.query(M).filter_by(session_id=von.id).update(
            {M.session_id: nach.id, M.merged_from_session_id: von.id}, synchronize_session=False)
    for M, schluessel in ((models.SessionLike, ("user_id",)), (models.SessionVote, ("user_id", "kind")),
                          (models.SessionBewertung, ("user_id",)), (models.SessionFlag, ("user_id",))):
        for row in db.query(M).filter_by(session_id=von.id).all():
            gleich = db.query(M).filter_by(session_id=nach.id, **{k: getattr(row, k) for k in schluessel}).first()
            if gleich is None:
                row.session_id = nach.id
    # Kommentare (Chat-Raum „session:<id>") samt Lesestand.
    alt_raum, neu_raum = f"session:{von.id}", f"session:{nach.id}"
    db.query(models.ChatMessage).filter_by(scope=alt_raum).update({models.ChatMessage.scope: neu_raum},
                                                                   synchronize_session=False)
    for st in db.query(models.ChatRoomState).filter_by(scope=alt_raum).all():
        if db.query(models.ChatRoomState).filter_by(user_id=st.user_id, scope=neu_raum).first() is None:
            st.scope = neu_raum
    # Bildunterschrift: nie ueberschreiben, sondern anhaengen.
    if von.caption and von.caption != nach.caption:
        nach.caption = f"{nach.caption}\n\n{von.caption}" if nach.caption else von.caption
    db.flush()
    sync_video_mirror(db, nach)


# --- Garmin-Eingang: Dateien unserer App, die (noch) keine Session werden ------------------------------------------
# Nur fuer Aktivitaeten, die erkennbar aus unseren Uhr-Apps stammen (Name „Pumpfoil"/„Dance", so legen sie die
# FIT-Session an). Fremde Aktivitaeten ohne GPS (Yoga, Kraft …) verwerfen wir weiter, wie in der Datenschutzerklaerung.
UNSERE_NAMEN = ("pumpfoil", "dance")
EINGANG = "garmin-eingang"


def aus_unserer_app(eintrag: dict) -> bool:
    return str(eintrag.get("activityName") or "").strip().lower() in UNSERE_NAMEN


def koennte_unsere_sein(eintrag: dict) -> bool:
    """Darf diese Garmin-Aktivitaet einer eigenen Aufnahme zugeordnet werden? Nur wenn sie aus unserer App stammt
    (Profilname „Pumpfoil"/„Dance") — eine Uhr zeichnet nie zwei Aktivitaeten gleichzeitig auf, eine Garmin-Profil-
    Aufnahme zur selben Zeit kommt also von einer ANDEREN Uhr (Olek, 05.11.2026: zwei Uhren gleichzeitig, eine mit
    unserer App, eine mit Garmins Profil „Foil"). Ohne Namen (unbekannt) wie bisher: zuordnen erlaubt."""
    name = str(eintrag.get("activityName") or "").strip()
    return not name or name.lower() in UNSERE_NAMEN


def _eingang_dir(user_id: int):
    from ..config import get_settings
    return get_settings().data_dir / EINGANG / str(int(user_id))


def eingang_parken(user_id: int, roh: bytes, beschreibung: dict, start: datetime, dauer_ms: int) -> None:
    import json as _json
    d = _eingang_dir(user_id)
    try:
        d.mkdir(parents=True, exist_ok=True)
        name = _sicherer_name(beschreibung.get("summaryId") or beschreibung.get("activityId") or "")
        if not (d / f"{name}.fit").exists():
            (d / f"{name}.fit").write_bytes(roh)
            (d / f"{name}.json").write_text(_json.dumps({**beschreibung, "start": start.isoformat(),
                                                         "dauer_ms": dauer_ms, "geparkt": _jetzt().isoformat()},
                                                        default=str, indent=2))
    except OSError as exc:
        log.warning("garmin: Parken fehlgeschlagen (user %s): %s", user_id, exc)


def eingang_abholen(eigene: models.Session) -> int:
    """Geparkte Garmin-Dateien, die zeitlich zu dieser eigenen Aufnahme passen, anhaengen. Die geparkte Datei bleibt
    liegen (nichts loeschen), ihr Beipackzettel vermerkt, wohin sie ging — ein zweites Abholen ueberspringt sie."""
    import json as _json
    d = _eingang_dir(eigene.user_id)
    if not d.exists() or eigene.started_at is None:
        return 0
    start = _aware(eigene.started_at)
    ende = _aware(eigene.ended_at) if eigene.ended_at else start + timedelta(hours=12)
    n = 0
    for info_p in sorted(d.glob("*.json")):
        try:
            info = _json.loads(info_p.read_text())
            if info.get("angehaengt_an"):
                continue
            g_start = datetime.fromisoformat(info["start"])
            g_ende = g_start + timedelta(milliseconds=max(int(info.get("dauer_ms") or 0), 60_000))
            if not (g_start < ende and g_ende > start) or abs((g_start - start).total_seconds()) > 120:
                continue
            datei_anhaengen(eigene, info_p.with_suffix(".fit").read_bytes(),
                            {k: info.get(k) for k in ("summaryId", "activityId", "activityType", "deviceName",
                                                      "startTimeInSeconds", "activityName")})
            info_p.write_text(_json.dumps({**info, "angehaengt_an": eigene.id}, default=str, indent=2))
            n += 1
            log.info("garmin: geparkte Datei %s an eigene Aufnahme #%s (user %s)", info_p.stem, eigene.id,
                     eigene.user_id)
        except (OSError, ValueError, KeyError) as exc:
            log.warning("garmin: geparkte Datei %s: %s", info_p.name, exc)
    return n


# Was die eigene (duenne) Aufnahme an die Garmin-Session weitergibt: das, was am Handgelenk gewaehlt wurde.
UEBERNEHMEN = ("sport_class", "sport_source", "foil_id", "stab_id", "board_id", "mast_len_cm", "shim_deg", "placement",
               "device_id", "app_version")   # Geraet: die Fahrt zaehlt weiter fuer „Foilen je Uhr"

# Die bessere Beschleunigung gewinnt (Jan, 05.11.2026: „kann das nicht einfach immer in die datei schauen und jedesmal
# die bessere rate nutzen?" · „wer mehr hat gewinnt"). Gemessen wird die Rate ueber die Wanduhr-Dauer der Aufnahme
# (Werte / Sekunden, Pausen und absichtliche Luecken eingeschlossen) — bei beiden gleich gerechnet, also vergleichbar.
# Wer ausduennt („Speicher sparen", „nur GPS") hat damit weniger und verliert. Garmin muss klar vorn liegen, sonst
# bleibt unsere Aufnahme (sie war zuerst da und traegt die Live-Daten).
RATE_VORSPRUNG = 1.2


def rate_eigene(s: models.Session) -> float:
    from .. import storage
    if s.started_at is None or s.ended_at is None:
        return 0.0
    dauer = (_aware(s.ended_at) - _aware(s.started_at)).total_seconds()
    if dauer <= 0:
        return 0.0
    try:
        return storage.load_accel(s.session_uuid).shape[0] / dauer
    except Exception:  # noqa: BLE001
        return 0.0


def rate_garmin(parsed: dict) -> float:
    n = len(parsed.get("accel_bytes") or b"") // 6
    dauer = (parsed.get("dauer_ms") or 0) / 1000
    return n / dauer if dauer > 0 else 0.0


def garmin_besser(eigene: models.Session, parsed: dict) -> bool:
    rg, re_ = rate_garmin(parsed), rate_eigene(eigene)
    besser = rg > 0 and rg > re_ * RATE_VORSPRUNG
    log.info("garmin: Accel-Rate eigene #%s %.1f Hz, Garmin %.1f Hz -> %s", eigene.id, re_, rg,
             "Garmin" if besser else "eigene")
    return besser


# Garmins Aufnahme muss die eigene auch zeitlich abdecken (08.11.2026, #20815/#20823: die Garmin-Aktivitaet war nach 28 min
# gestoppt, unsere App lief 92 min weiter — die hoehere Accel-Rate gewann, 64 min GPS und alle spaeteren Laeufe waren weg).
DECKUNG_MIN = 0.9


def _spanne_eigene_s(s: models.Session) -> float:
    from .. import storage
    try:
        g = storage.load_gps(s.session_uuid)
        if len(g):
            return float(g[-1][0]) / 1000
    except Exception:  # noqa: BLE001
        pass
    if s.started_at is None or s.ended_at is None:
        return 0.0
    return max(0.0, (_aware(s.ended_at) - _aware(s.started_at)).total_seconds())


def _spanne_garmin_s(parsed: dict) -> float:
    samples = parsed.get("gps_samples") or []
    if samples:
        return float(samples[-1][0]) / 1000
    return (parsed.get("dauer_ms") or 0) / 1000


def garmin_deckt(eigene: models.Session, parsed: dict) -> bool:
    """Reicht Garmins Aufnahme (GPS bzw. Records) mindestens ueber DECKUNG_MIN der eigenen? Sonst bleibt unsere die Fahrt
    und Garmins Datei wird nur angehaengt — egal, wie viel besser ihre Beschleunigung ist."""
    eg, gg = _spanne_eigene_s(eigene), _spanne_garmin_s(parsed)
    ok = eg <= 0 or gg >= eg * DECKUNG_MIN
    if not ok:
        log.info("garmin: Garmin-Datei deckt eigene #%s nicht ab (%.0f s von %.0f s) -> eigene bleibt", eigene.id, gg, eg)
    return ok


def garmin_ersetzt(eigene: models.Session, parsed: dict) -> bool:
    """Wird Garmins Datei die Session (unsere geht darin auf)? Nur wenn sie die Fahrt abdeckt UND unsere duenn ist oder
    Garmin die deutlich bessere Beschleunigung hat."""
    from .. import storage
    return garmin_deckt(eigene, parsed) and (storage.duenn(eigene.session_uuid) or garmin_besser(eigene, parsed))


def in_garmin_session_aufgehen(db: Session, eigene: models.Session, g: models.Session) -> models.Session:
    """Duenne eigene Aufnahme (Datenwege) geht in der Garmin-Session derselben Fahrt auf: Sportart, Foil und Ausruestung
    von der Uhr, alles Nutzergemachte, dann zeigt sie per merged_into auf die Garmin-Session und wird ausgeblendet.
    Danach neu auswerten (Sportart und Foil bestimmen die Auswertung). Findet die Garmin-Datei dabei weniger Laeufe als
    unsere Aufnahme, wird das wieder umgedreht (zurueck_zur_eigenen). Gibt die Session zurueck, die die Fahrt bleibt."""
    from ..analysis import run_analysis
    from .. import manuell
    laeufe_eigene = _laeufe(db, eigene)
    share_token = eigene.share_token
    for feld in UEBERNEHMEN:
        # Hat der Fahrer das an der Garmin-Session schon von Hand gesetzt (juenger als an unserer), bleibt es
        # (13.11.2026, Jan: „manuelle eintraege des fahrers immer uebernommen … egal in welcher richtung").
        gruppe = manuell.gruppe_von(feld)
        if gruppe and manuell.neuer(g, eigene, gruppe):
            continue
        wert = getattr(eigene, feld, None)
        if wert is not None:
            setattr(g, feld, wert)
    # Und alles, was an unserer Aufnahme von Hand eingestellt wurde (Zuschnitt, aussortierte Laeufe … mit Startversatz).
    manuell.uebernehmen(eigene, g)
    # Tanz-App (06.11.2026, #20252): `sport` ist sonst Garmins Rohwert („training"), die Tanz-Auswertung haengt aber an
    # sport == "dance" — und die Tanz-Abschnitte der Uhr muessen mit (app/tanz.py, nur fuer Tanz-Sessions).
    if (eigene.sport or "") == "dance":
        from .. import tanz
        g.sport = "dance"
        if eigene.started_at and g.started_at:
            tanz.umhaengen(db, eigene.id, g.id, int((eigene.started_at - g.started_at).total_seconds() * 1000))
    nutzerinhalte_uebertragen(db, eigene, g)
    eigene.deleted = True
    eigene.merged_into = g.id
    eigene.share_token = None
    db.commit()
    try:
        run_analysis(db, g)
    except Exception as exc:  # noqa: BLE001 — die Zuordnung steht, die Auswertung holt die Reanalyse nach
        db.rollback()
        log.warning("garmin: Neuauswertung #%s nach Uebernahme fehlgeschlagen: %s", g.id, exc)
        return g
    log.info("garmin: duenne Aufnahme #%s geht in Garmin-Session #%s auf (user %s)", eigene.id, g.id, eigene.user_id)
    if laeufe_eigene is not None and (_laeufe(db, g) or 0) < laeufe_eigene:
        return zurueck_zur_eigenen(db, g, eigene, share_token)
    return g


def _laeufe(db: Session, s: models.Session) -> int | None:
    a = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
    return None if a is None else int(a.num_runs or 0)


def garmin_in_eigene_aufgehen(db: Session, g: models.Session, eigene: models.Session) -> None:
    """Umgekehrte Richtung: die Garmin-/FIT-Session geht in unserer Aufnahme auf — ihre Originaldatei als Kopie an unsere,
    Nutzerinhalte und von Hand Eingestelltes kommen mit, sie zeigt per merged_into auf unsere. Committet nicht."""
    from .. import manuell, storage
    d = storage.session_dir(g.session_uuid)
    originale = sorted(d.glob("original.*")) if d.exists() else []
    if originale:
        datei_anhaengen(eigene, originale[0].read_bytes(),
                        {"summaryId": g.session_uuid, "deviceName": g.device_model,
                         "von_session": g.id, "von_uuid": g.session_uuid},
                        praefix="fit-upload" if g.session_uuid.startswith("fit-") else "garmin-connect")
    nutzerinhalte_uebertragen(db, g, eigene)
    # Von Hand an der Garmin-/FIT-Session Eingestelltes (Sportart, Foil, Stab, Zuschnitt …) kommt mit (13.11.2026).
    manuell.uebernehmen(g, eigene)
    g.deleted = True
    g.merged_into = eigene.id      # alte Links leiten weiter (sessions.get_session)
    g.share_token = None


def zurueck_zur_eigenen(db: Session, g: models.Session, eigene: models.Session,
                        share_token: str | None = None) -> models.Session:
    """Die Garmin-Datei fand nach der Neuauswertung WENIGER Laeufe als unsere Aufnahme: dann bleibt unsere die Session
    und Garmins haengt als Datei daran (Jan, 14.11.2026, FR55-Fahrt mit 4 Laeufen in unserer, 0 in Garmins Datei:
    „wir nehmen jetzt das, wo halt mehr Laeufe sind, bis wir das Modell neu trainiert haben"). Bis dahin ist die
    hoehere Beschleunigungsrate allein kein Beleg fuer die bessere Auswertung (Einheiten-Frage, 13.11.)."""
    from ..analysis import run_analysis
    eigene.deleted = False
    eigene.merged_into = None
    if share_token and not eigene.share_token:
        eigene.share_token = share_token
    garmin_in_eigene_aufgehen(db, g, eigene)
    db.commit()
    try:
        run_analysis(db, eigene)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        log.warning("garmin: Neuauswertung #%s nach Rueckgabe fehlgeschlagen: %s", eigene.id, exc)
    log.info("garmin: Garmin-Session #%s hat weniger Laeufe, eigene Aufnahme #%s bleibt (user %s)",
             g.id, eigene.id, eigene.user_id)
    return eigene


def _garmin_datei_ersetzt(eigene: models.Session, pfad) -> bool:
    from ..fitimport import parse_fit_bytes
    try:
        return garmin_ersetzt(eigene, parse_fit_bytes(pfad.read_bytes()))
    except Exception as exc:  # noqa: BLE001 — im Zweifel bleibt unsere Aufnahme
        log.warning("garmin: Rate der Garmin-Datei %s nicht lesbar: %s", pfad, exc)
        return False


# --- Von Hand hochgeladene FIT-Dateien (09.11.2026) ---------------------------------------------------------------
# Anlass: Ein Nutzer lud die FIT-Datei seiner Fahrt hoch, weil die Uhr noch nicht synchronisiert hatte; spaeter kam der
# Upload unserer App dazu — dieselbe Fahrt stand doppelt in Event und Bestenlisten. Jan: „bau das fuer fit-importe
# genauso, aber die daten sollen natuerlich trotzdem gespeichert werden, am ende wollen wir immer die besseren daten zur
# analyse und auswertung verwenden". Also dieselben Regeln wie fuer Garmin Connect: die bessere Aufnahme wird die
# Session (Deckung + Beschleunigung, garmin_ersetzt), die andere geht darin auf bzw. haengt als Datei daran.
FIT_START_TOLERANZ_S = 120


def _parsed_der_datei(pfad) -> dict | None:
    from ..fitimport import parse_fit_bytes
    try:
        return parse_fit_bytes(pfad.read_bytes())
    except Exception:  # noqa: BLE001
        return None


def fit_ist_dieselbe_aufnahme(db: Session, eigene: models.Session, parsed: dict | None) -> bool:
    """Ist die FIT-Datei die Aufzeichnung unserer App zur eigenen Aufnahme? Strenger als bei Garmin Connect (dort sagt
    der Push, woher die Datei kommt): der Profilname muss unserer sein („Pumpfoil"/„Dance"), die Uhr darf keine andere
    sein, und der Start muss auf FIT_START_TOLERANZ_S stimmen. Eine zweite Uhr mit Garmins Profil oder einer anderen
    App (Vergleichsfahrten mit zwei Uhren) bleibt damit ihre eigene Session."""
    if not parsed or parsed.get("started_at") is None or eigene.started_at is None:
        return False
    if str(parsed.get("sport_name") or "").strip().lower() not in UNSERE_NAMEN:
        return False
    if andere_uhr(db, eigene, parsed.get("garmin_produkt")):
        return False
    return abs((_aware(parsed["started_at"]) - _aware(eigene.started_at)).total_seconds()) <= FIT_START_TOLERANZ_S


def fit_zur_eigenen_aufnahme(db: Session, user: models.User, raw: bytes, parsed: dict,
                             dateiname: str | None) -> models.Session | None:
    """FIT-Upload zu einer eigenen Aufnahme derselben Fahrt: die bessere wird die Session, die andere geht darin auf
    (Datei bleibt angehaengt bzw. der Ordner der eigenen Aufnahme unangetastet). None = keine eigene Aufnahme dazu, der
    normale Import laeuft weiter."""
    import hashlib

    from .sessions import import_parsed_session
    if parsed.get("started_at") is None:
        return None
    start = _aware(parsed["started_at"])
    samples = parsed.get("gps_samples") or []
    ende = start + timedelta(milliseconds=int(samples[-1][0] if samples else parsed.get("dauer_ms") or 0))
    eigene = _eigene_aufnahme(db, user.id, start, max(ende, start + timedelta(seconds=60)),
                              produkt=parsed.get("garmin_produkt"))
    if eigene is None or not fit_ist_dieselbe_aufnahme(db, eigene, parsed):
        return None
    if garmin_ersetzt(eigene, parsed):
        g = import_parsed_session(db, user, raw, parsed, src_label="fit-upload", uuid_prefix="fit-", filename=dateiname,
                                  sport_override=eigene.sport_class, von_hand=True, ausser_id=eigene.id)
        if g is not None and g.id != eigene.id:
            bleibt = in_garmin_session_aufgehen(db, eigene, g)
            log.info("fit-upload: eigene Aufnahme #%s / FIT-Session #%s -> #%s bleibt (user %s)", eigene.id, g.id,
                     bleibt.id, user.id)
            return bleibt
    datei_anhaengen(eigene, raw, {"summaryId": hashlib.sha256(raw).hexdigest()[:16], "datei": dateiname,
                                  "deviceName": None}, praefix="fit-upload")
    log.info("fit-upload: Datei an eigene Aufnahme #%s angehaengt (user %s)", eigene.id, user.id)
    return eigene


def nach_eigener_aufnahme(db: Session, eigene: models.Session) -> int:
    """Andere Reihenfolge: Garmin war schneller, jetzt schliesst unsere App die Aufnahme ab. Garmin-Importe desselben
    Nutzers zur selben Zeit werden mit ihr verknuepft: ihre Originaldatei kommt (als Kopie) an unsere Session, die
    Garmin-Session wird ausgeblendet (deleted) — ihr Ordner bleibt unangetastet, es geht nichts verloren. Wirft nie.
    Gibt die Zahl der verknuepften Garmin-Sessions zurueck."""
    if not eigene.device_id or eigene.started_at is None:
        return 0
    from .. import storage
    try:
        eingang_abholen(eigene)
    except Exception as exc:  # noqa: BLE001
        log.warning("garmin: Eingang fuer #%s: %s", eigene.id, exc)
    S = models.Session
    ende = eigene.ended_at or eigene.started_at + timedelta(hours=12)
    n = 0
    try:
        for g in db.query(S).filter(S.user_id == eigene.user_id, S.deleted.isnot(True),
                                    or_(S.session_uuid.like("garmin-%"), S.session_uuid.like("fit-%")),
                                    S.started_at < ende, S.ended_at > eigene.started_at).all():
            d = storage.session_dir(g.session_uuid)
            originale = sorted(d.glob("original.*")) if d.exists() else []
            if g.session_uuid.startswith("fit-"):
                # Von Hand hochgeladene FIT-Datei (09.11.2026): nur die Datei unserer App derselben Uhr, auf wenige
                # Sekunden gleich gestartet — sonst eine andere Aufnahme (zweite Uhr, andere App) und bleibt eigene Session.
                if not originale or not fit_ist_dieselbe_aufnahme(db, eigene, _parsed_der_datei(originale[0])):
                    continue
            elif not koennte_unsere_sein(_push_gelesen(g)):
                continue   # Garmin-Profil-Aufnahme einer anderen Uhr (s. koennte_unsere_sein) — bleibt eigene Session
            if originale and andere_uhr(db, eigene, _produkt_der_datei(originale[0])):
                continue   # Import einer anderen Uhr zur selben Zeit (07.11.2026) — bleibt seine eigene Session
            # Garmins Session hat die bessere Aufnahme (duenn bei uns oder hoehere Accel-Rate): sie bleibt die Fahrt,
            # unsere geht darin auf.
            # Ohne Originaldatei laesst sich die Deckung nicht pruefen: dann nur bei duenner eigener Aufnahme (wie bisher).
            if (_garmin_datei_ersetzt(eigene, originale[0]) if originale else storage.duenn(eigene.session_uuid)):
                in_garmin_session_aufgehen(db, eigene, g)
                return 1
            if not originale:
                continue
            garmin_in_eigene_aufgehen(db, g, eigene)
            n += 1
            log.info("garmin: Import #%s mit eigener Aufnahme #%s verknuepft (user %s)", g.id, eigene.id, eigene.user_id)
        if n:
            db.commit()
    except Exception as exc:  # noqa: BLE001 — der Abschluss einer Aufnahme darf daran nie scheitern
        db.rollback()
        log.warning("garmin: Verknuepfen nach Aufnahme #%s fehlgeschlagen: %s", eigene.id, exc)
        return 0
    return n


# Erneuern, sobald das Refresh-Token in weniger als dieser Zeit ablaeuft. Jede Erneuerung bringt ein neues Refresh-Token
# mit wieder drei Monaten — so verliert auch niemand die Verbindung, der lange nichts aufzeichnet.
REFRESH_ERNEUERN_VOR = timedelta(days=30)


def sync(user: models.User, db: Session) -> str:
    """Fuer den taeglichen Lauf (app/kontensync.py): nichts holen, nur die Verbindung erneuern, wenn noetig."""
    link = db.query(models.GarminLink).filter_by(user_id=user.id).first()
    if link is None:
        return "kein link"
    ablauf = _aware(link.refresh_expires_at)
    if ablauf is not None and ablauf - _jetzt() > REFRESH_ERNEUERN_VOR:
        return "ok"
    tok = _token_anfrage({"grant_type": "refresh_token", "refresh_token": link.refresh_token})
    _tokens_uebernehmen(link, tok)
    db.commit()
    return "erneuert"


# --- Trennen --------------------------------------------------------------------------------------------------------

def registrierung_loeschen(db: Session, link: models.GarminLink) -> None:
    """Bei Garmin abmelden (Pflicht, wenn bei uns getrennt oder das Konto geloescht wird). Wirft nie."""
    try:
        token = gueltiges_token(link, db)
        httpx.delete(f"{API}/partner-gateway/rest/user/registration",
                     headers={"Authorization": f"Bearer {token}"}, timeout=20)
    except Exception as exc:  # noqa: BLE001
        log.warning("garmin: Abmelden bei Garmin fehlgeschlagen (user %s): %s", link.user_id, exc)


@router.delete("")
def unlink(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = db.query(models.GarminLink).filter_by(user_id=user.id).first()
    if link is not None:
        registrierung_loeschen(db, link)
        db.delete(link)
        db.commit()
    return {"ok": True}
