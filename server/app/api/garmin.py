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

# Profile, die automatisch importiert werden: Wassersport und Kiteboarding (Garmin-Namen ohne „_V2"/„_WS"). Der Nutzer
# kann jedes je Modus abwaehlen (importsports, Anbieter „garmin").
WASSERSPORT = frozenset({
    "SURFING", "KITEBOARDING", "WINDSURFING", "STAND_UP_PADDLEBOARDING", "WAKEBOARDING", "WATERSKIING",
    "PADDLING", "KAYAKING", "ROWING", "SAILING", "BOATING", "WATER_SPORTS", "OPEN_WATER_SWIMMING",
})
# Garmin kennt kein Snowkite- oder Landkite-Profil (Jan, 05.11.2026: „die sollten auch zur auswahl stehen wenigstens").
# Wer dafuer nicht Kiteboarding nimmt, nimmt ein Schnee-Profil oder „Andere". Diese stehen zur Auswahl, sind aber AUS,
# bis der Nutzer sie einschaltet — sonst wuerde jeder Skitag eine Session. Die erste Aktivitaet eines solchen Profils
# wird nur vorgemerkt (dann steht es in der Auswahl), nicht geladen.
NUR_AUF_WUNSCH = frozenset({
    "BACKCOUNTRY_SKIING", "BACKCOUNTRY_SNOWBOARDING", "SNOWBOARDING", "RESORT_SKIING", "RESORT_SKIING_SNOWBOARDING",
    "OTHER",
})

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


def _eigene_aufnahme(db: Session, user_id: int, start: datetime, ende: datetime) -> models.Session | None:
    """Aufnahme aus unseren eigenen Apps zur selben Zeit? Dann ist die Garmin-Aktivitaet dieselbe Fahrt — unsere
    Connect-IQ-App legt in Garmin Connect ebenfalls eine Aktivitaet an (oder das Handy lief daneben mit). Eigene
    Aufnahmen tragen ein Geraet (device_id), Importe nicht. Eine noch laufende zaehlt, wenn sie vorher begann."""
    from sqlalchemy import and_, or_
    S = models.Session
    return (db.query(S).filter(
        S.user_id == user_id, S.deleted.isnot(True), S.device_id.isnot(None), S.started_at < ende,
        or_(S.ended_at > start, and_(S.ended_at.is_(None), S.started_at > start - timedelta(hours=12))))
        .order_by(S.started_at).first())


def _sicherer_name(text: str) -> str:
    return "".join(c for c in str(text) if c.isalnum() or c in "-_")[:60] or "aktivitaet"


def datei_anhaengen(ziel: models.Session, roh: bytes, beschreibung: dict) -> str | None:
    """Garmin-Datei an eine Session haengen, ohne etwas zu ueberschreiben (Jan, 05.11.2026: „die daten von uhr und
    ueber garmin fuer die gleiche session verknuepfen … immer beide daten komplett speichern damit nichts verloren
    gehen kann"). Je Garmin-Aktivitaet eine NEUE Datei `garmin-connect-<summaryId>.fit` plus `.json` mit der
    Beschreibung — `server/data` ist per Hardlink mit den Sicherungen verbunden, ein Schreiben in eine vorhandene Datei
    wuerde auch die Sicherungen aendern. Gibt den Dateinamen zurueck (None, wenn es sie schon gab)."""
    import json as _json

    from .. import storage
    d = storage.ensure_session_dir(ziel.session_uuid)
    name = f"garmin-connect-{_sicherer_name(beschreibung.get('summaryId') or beschreibung.get('activityId') or '')}"
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
    # Die Profil-Auswahl entscheidet nur, ob aus Garmin eine NEUE Session wird. Gehoert die Aktivitaet zu einer eigenen
    # Aufnahme, kommt die Datei immer dazu (05.11.2026: Garmin meldet Aufnahmen unserer Connect-IQ-App als OTHER, das
    # ist standardmaessig aus — die Datei der ersten echten Testfahrt wurde deshalb gar nicht erst geladen).
    grund = None
    if profil not in WASSERSPORT and profil not in NUR_AUF_WUNSCH:
        grund = "kein passendes profil"
    elif not importsports.merken(db, user.id, "garmin", profil, label=profil.replace("_", " ").title(),
                                 standard=profil in WASSERSPORT).importieren:
        grund = "abgewaehlt"
    eigene_vorab = _eigene_zum_eintrag(db, user.id, eintrag) if grund else None
    if grund and eigene_vorab is None:
        return grund
    r = httpx.get(url, headers={"Authorization": f"Bearer {gueltiges_token(link, db)}"}, timeout=60)
    if r.status_code != 200 or not r.content:
        return f"download {r.status_code}"
    if eigene_vorab is not None:
        datei_anhaengen(eigene_vorab, r.content, _beschreibung(eintrag))
        return f"an eigene aufnahme #{eigene_vorab.id} angehaengt ({len(r.content) // 1024} KB, {grund})"
    try:
        parsed = parse_fit_bytes(r.content)
    except Exception as exc:  # noqa: BLE001
        storage.quarantaene_ablegen(r.content, quelle="garmin", user_id=user.id, grund=f"{type(exc).__name__}: {exc}")
        return "fit kaputt"
    # Wie viel kommt ueber Garmin wirklich an? Groesse und Beschleunigung im Protokoll (Frage 05.11.2026: liefert die
    # API die Originaldatei mit den Sensor-Daten unserer Connect-IQ-App?).
    log.info("garmin: Datei %s (user %s): %d KB, GPS %d, Accel %d Werte", eintrag.get("summaryId"), user.id,
             len(r.content) // 1024, len(parsed.get("gps_samples") or []), len(parsed.get("accel_bytes") or b"") // 6)
    grund = importsports.konto_import_grund(parsed)
    if grund:
        return grund
    start = _aware(parsed["started_at"])
    samples = parsed.get("gps_samples") or []
    ende = start + timedelta(milliseconds=int(samples[-1][0] if samples else parsed.get("dauer_ms") or 0))
    eigene = _eigene_aufnahme(db, user.id, start, ende)
    if eigene is not None:
        # Dieselbe Fahrt: keine zweite Session, aber die Garmin-Datei vollstaendig an unsere haengen.
        datei_anhaengen(eigene, r.content, _beschreibung(eintrag))
        return f"an eigene aufnahme #{eigene.id} angehaengt"
    s = import_parsed_session(db, user, r.content, parsed, src_label="garmin-import", uuid_prefix="garmin-",
                              filename="garmin.fit")   # Originaldatei als original.fit (sonst .bin)
    if s is None:
        return "schon da"
    # „Garmin [Geraet]" fuer das Uhr-Abzeichen (Markenvorgabe; sessions.import_geraet zeigt es an).
    if s.session_uuid.startswith("garmin-") and not s.device_model:
        s.device_model = geraet_name(eintrag.get("deviceName"))
        db.commit()
    return "importiert"


def geraet_name(device_name) -> str:
    """„fenix 8" -> „Garmin fenix 8"; schon mit Garmin davor bleibt es; ohne Angabe nur „Garmin"."""
    n = " ".join(str(device_name or "").split())[:70]
    if not n:
        return "Garmin"
    return n if n.lower().startswith("garmin") else f"Garmin {n}"


def _activity_files_verarbeiten(eintraege: list[dict]) -> None:
    """Hintergrundaufgabe nach der 200-Antwort: eigene DB-Sitzung, ein kaputter Eintrag stoppt die anderen nicht."""
    from ..db import SessionLocal

    db = SessionLocal()
    try:
        for e in eintraege:
            gid = str(e.get("userId") or "")
            link = db.query(models.GarminLink).filter_by(garmin_user_id=gid).first() if gid else None
            if link is None:
                continue
            try:
                ausgang = aktivitaet_importieren(db, link, e)
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                ausgang = f"fehler {type(exc).__name__}"
                log.warning("garmin: Import fehlgeschlagen (user %s, %s): %s", link.user_id, e.get("summaryId"), exc)
            link.last_sync_at = _jetzt()
            db.commit()
            log.info("garmin: %s %s (user %s): %s", e.get("summaryId"), _profil(e), link.user_id, ausgang)
    finally:
        db.close()


@router.post("/push/activity-files")
async def push_activity_files(request: Request, hintergrund: BackgroundTasks) -> dict:
    eintraege = await _json_liste(request, "activityFiles")
    if eintraege:
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


def nach_eigener_aufnahme(db: Session, eigene: models.Session) -> int:
    """Andere Reihenfolge: Garmin war schneller, jetzt schliesst unsere App die Aufnahme ab. Garmin-Importe desselben
    Nutzers zur selben Zeit werden mit ihr verknuepft: ihre Originaldatei kommt (als Kopie) an unsere Session, die
    Garmin-Session wird ausgeblendet (deleted) — ihr Ordner bleibt unangetastet, es geht nichts verloren. Wirft nie.
    Gibt die Zahl der verknuepften Garmin-Sessions zurueck."""
    if not eigene.device_id or eigene.started_at is None:
        return 0
    from .. import storage
    S = models.Session
    ende = eigene.ended_at or eigene.started_at + timedelta(hours=12)
    n = 0
    try:
        for g in db.query(S).filter(S.user_id == eigene.user_id, S.deleted.isnot(True),
                                    S.session_uuid.like("garmin-%"), S.started_at < ende,
                                    S.ended_at > eigene.started_at).all():
            d = storage.session_dir(g.session_uuid)
            originale = sorted(d.glob("original.*")) if d.exists() else []
            if not originale:
                continue
            datei_anhaengen(eigene, originale[0].read_bytes(),
                            {"summaryId": g.session_uuid, "deviceName": g.device_model,
                             "von_session": g.id, "von_uuid": g.session_uuid})
            g.deleted = True
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
