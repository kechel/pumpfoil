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
import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt as pyjwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import SessionLocal, get_db
from .deps import current_user

router = APIRouter(prefix="/api/integrations/suunto", tags=["suunto"])
log = logging.getLogger("pumpfoil.suunto")

AUTHORIZE_URL = "https://cloudapi-oauth.suunto.com/oauth/authorize"
TOKEN_URL = "https://cloudapi-oauth.suunto.com/oauth/token"
API = "https://cloudapi.suunto.com"

# --- Zwei API-Versionen, eine aktiv -----------------------------------------------------
# Die von uns benutzte API laeuft in Suuntos Portal als „SUUNTO WORKOUT API (DEPRECATED)"
# (Pfad /v2). Der Nachfolger heisst dort „SUUNTO WORKOUT API" und liegt auf /v3/workouts;
# er hat den FIT-Export ebenfalls, dazu Seitenweise-Abruf und einen Filter nach
# Aenderungszeit. Vollstaendige Herleitung samt Quellen: docs/suunto-api-v3.md.
#
# UMGESCHALTET WIRD ERST NACH GEMEINSAMER PRUEFUNG (Jan, 04.09.): ohne `SUUNTO_API_V3` in
# server/.env bleibt alles bei v2. Zum Vergleichen gibt es GET …/suunto/vergleich.
WORKOUTS_URL_V2 = f"{API}/v2/workouts"
FIT_EXPORT_V2 = API + "/v2/workout/exportFit/{key}"
WORKOUTS_URL_V3 = f"{API}/v3/workouts"
FIT_EXPORT_V3 = API + "/v3/workouts/{key}/fit"


def _v3_aktiv() -> bool:
    import os
    return (os.environ.get("SUUNTO_API_V3") or "").strip() in ("1", "true", "yes", "on")


def _workouts_url() -> str:
    return WORKOUTS_URL_V3 if _v3_aktiv() else WORKOUTS_URL_V2


def _fit_url(key: str) -> str:
    return (FIT_EXPORT_V3 if _v3_aktiv() else FIT_EXPORT_V2).format(key=key)


def _liste_lesen(payload) -> list:
    """Workout-Liste aus der Antwort ziehen — fuer v2 UND v3.

    v2 antwortet mit `{"payload": [...]}`. Fuer v3 ist die Form nicht dokumentiert (die
    Portal-Doku nennt nur „application/json"), deshalb bleibt es hier defensiv: nackte Liste,
    `payload`, `workouts`, `data` oder `items` — was zuerst passt. Lieber ein paar Zeilen mehr
    als ein Sync, der an einem umbenannten Feld scheitert.
    """
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for feld in ("payload", "workouts", "data", "items", "results"):
        wert = payload.get(feld)
        if isinstance(wert, list):
            return wert
        if isinstance(wert, dict):
            for f2 in ("payload", "workouts", "data", "items"):
                if isinstance(wert.get(f2), list):
                    return wert[f2]
    return []


def _workout_key(w: dict) -> str:
    """Schluessel eines Workouts. v2 nennt ihn `workoutKey`; v3 spricht von `workoutIdOrKey`,
    also nehmen wir beide Schreibweisen und `id` als letzten Rueckfall."""
    for feld in ("workoutKey", "workoutId", "workout_key", "key", "id"):
        wert = w.get(feld)
        if wert:
            return str(wert)
    return ""


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
        {"uid": uid, "scope": "suunto-link", "exp": int(time.time()) + 3600},
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


def _token_post(data: dict, *, who: str) -> httpx.Response:
    """Token-Tausch. Zugangsdaten im BODY statt per HTTP Basic.

    Gemessen 2026-07-28: `/oauth/token` antwortet auf JEDE Anfrage mit `Authorization: Basic …`
    pauschal `{"code":401,"message":"Unauthorized"}` — auch ohne Zugangsdaten und mit unsinnigem
    grant_type, unsere Daten werden also nicht geprüft. Ihr Gateway erwartet unter `Authorization`
    offenbar nur noch `Bearer <JWT>`. Mit den Zugangsdaten im Body antwortet der Endpunkt dagegen
    inhaltlich. Der dokumentierte Basic-Weg bleibt als Rückfall, falls sie es zurückdrehen.
    """
    cid, secret = _creds()
    hdr = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}
    r = httpx.post(TOKEN_URL, data={**data, "client_id": cid, "client_secret": secret},
                   headers=hdr, timeout=20)
    if r.status_code == 200:
        return r
    log.warning("Suunto token (%s): Body-Zugangsdaten -> %s %s", who, r.status_code, r.text[:300])
    rb = httpx.post(TOKEN_URL, data=data,
                    headers={**hdr, "Authorization": f"Basic {_basic(cid, secret)}"}, timeout=20)
    if rb.status_code != 200:
        log.warning("Suunto token (%s): Basic-Auth -> %s %s", who, rb.status_code, rb.text[:300])
    return rb if rb.status_code == 200 else r


def _fresh_token(link: models.SuuntoLink, db: Session) -> str:
    """Token bei Ablauf (täglich!) per refresh_token erneuern."""
    exp = link.token_expires_at
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp - timedelta(minutes=5) > datetime.now(timezone.utc):
        return link.access_token
    r = _token_post({"grant_type": "refresh_token", "refresh_token": link.refresh_token},
                    who=f"refresh uid={link.user_id}")
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
        "state": _state_for(user.id),   # signiertes JWT -> im /callback zurück -> user_id
        # In Suuntos Doku NICHT vorgesehen, aber ihre Login-Seite trägt genau diesen einen Parameter
        # über die Anmeldung hinweg weiter (`<form action="/uaa/login?subscription-key=…">`). Ohne Wert
        # bricht ihr Authorize-Schritt nach dem Login mit 400 ab (gemessen 2026-07-28), unser /callback
        # wird nie erreicht. Versuch, ihrem Backend die aktive Subscription mitzugeben.
        "subscription-key": _sub_key(),
    }
    return {"authorize_url": f"{AUTHORIZE_URL}?{urlencode(params)}"}


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, error: str | None = None,
             db: Session = Depends(get_db)):
    """Führt IMMER auf /konten zurück (nie roher JSON im Browser): ?suunto=connected|cancelled|error,
    die PWA zeigt dazu eine freundliche Meldung."""
    def _redir(kind: str) -> RedirectResponse:
        return RedirectResponse(f"{get_settings().base_url}/konten?suunto={kind}", status_code=303)

    if error:  # Nutzer hat im Suunto-Consent „Abbrechen"/abgelehnt
        return _redir("cancelled")
    try:
        cid, secret = _creds()
    except HTTPException:
        return _redir("error")
    uid = _uid_from_state(state or "")
    if not code or uid is None:
        return _redir("error")   # abgelaufener/fehlender state
    try:
        tr = _token_post({"grant_type": "authorization_code", "code": code,
                          "redirect_uri": _redirect_uri()}, who=f"connect uid={uid}")
        tok = tr.json() if tr.status_code == 200 else {}
        if tr.status_code != 200:
            # Suunto-Fehlerantwort loggen (sonst nicht diagnostizierbar: redirect_uri-Mismatch,
            # invalid_client, App nicht freigegeben, …). redirect_uri zum Abgleich mitloggen.
            log.warning("Suunto token-exchange fehlgeschlagen (uid=%s, redirect_uri=%s): %s %s",
                        uid, _redirect_uri(), tr.status_code, tr.text[:500])
    except Exception as e:  # noqa: BLE001
        log.warning("Suunto token-exchange Exception (uid=%s): %r", uid, e)
        return _redir("error")
    if not tok.get("access_token"):
        log.warning("Suunto token ohne access_token (uid=%s): %s", uid, str(tok)[:300])
        return _redir("error")
    link = db.query(models.SuuntoLink).filter_by(user_id=uid).first()
    if link is None:
        link = models.SuuntoLink(user_id=uid, access_token="", refresh_token="")
        db.add(link)
    _store_token(link, tok)
    db.commit()
    return _redir("connected")


# Aus den METADATEN entscheiden, ob sich der FIT-Download ueberhaupt lohnt. Hintergrund:
# 41 % der bisher importierten Suunto-Workouts waren gar kein Pumpfoil (gemessen 28.08.: 96 von
# 235) — wir haben sie geladen, analysiert und danach aussortiert. Jeder Download kostet einen
# API-Aufruf, und die Developer-API erlaubt 200 pro WOCHE fuer alle Nutzer zusammen; gerechnet
# lagen wir bei ~219. Vorfiltern spart also genau dort, wo es klemmt.
#
# Bewusst OHNE Sportart-Zuordnung: welche `activityId` jemand fuers Foilen benutzt, ist nicht
# vorhersagbar (unsere eigene COROS-Anleitung empfiehlt „Speedsurfing"). Gefiltert wird nur nach
# Bewegungsprofil, und nur wenn die Zahlen wirklich mitkommen — fehlt ein Feld, wird geladen.
# Lieber ein Download zu viel als eine verlorene Session.
# 60 km statt der zuerst gewaehlten 30: gegen die 235 bereits importierten Suunto-Sessions
# nachgerechnet haette die 30-km-Grenze 14 ECHTE Pumpfoil-Sessions abgelehnt (10 %) — lange
# Sessions kommen ueber die Gesamtstrecke weiter, als man denkt. Eine verlorene Session ist
# teurer als ein Download zu viel, also nur noch das offensichtlich Unmoegliche (Radtour, Auto).
MAX_DIST_M = 60_000
MIN_DUR_S = 60             # unter einer Minute gibt es nichts zu analysieren
FAST_AVG_MPS = 30 / 3.6    # 30 km/h Schnitt ueber >10 min = Auto/Rad/Boot, nicht gepumpt
FAST_MIN_DUR_S = 600


def _vorfilter(wo: dict) -> str | None:
    """None = holen. Sonst der Grund, warum wir es NICHT holen (fuers Log)."""
    if not isinstance(wo, dict):
        return None
    def zahl(*namen):
        for n in namen:
            v = wo.get(n)
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
        return None
    dist = zahl("totalDistance", "distance")
    dur = zahl("totalTime", "duration", "totalDuration")
    if dist is not None and dist > MAX_DIST_M:
        return "Distanz %.1f km" % (dist / 1000.0)
    if dur is not None and dur < MIN_DUR_S:
        return "Dauer %.0f s" % dur
    if dist is not None and dur is not None and dur > FAST_MIN_DUR_S and dist / dur > FAST_AVG_MPS:
        return "Schnitt %.1f km/h ueber %.0f min" % (dist / dur * 3.6, dur / 60.0)
    return None


def _quota_weg(r: httpx.Response) -> bool:
    """Kontingent erschoepft? Suunto (Azure APIM) antwortet 403 mit „Out of call volume quota".

    WICHTIG: ein nacktes 403 „Forbidden" ist etwas ANDERES — s. `_endgueltig`.
    """
    return r.status_code == 403 and "quota" in (r.text or "").lower()


# Gruende, bei denen ein weiterer Versuch nichts bringt — der Eintrag fliegt aus der
# Warteschlange, statt zehnmal Kontingent zu verbrennen. Am 28.08. an den sechs nachgeholten
# Workouts gemessen:
#   „kein gps"  — Suunto liefert die Datei, sie enthaelt aber keine Position (Indoor o. ae.)
#   „http 403"  — Body ist ein nacktes {"error":{"code":"403","description":"Forbidden"}},
#                 NICHT die Kontingent-Meldung. Trat bei EINEM Nutzer an fuenf Workouts auf,
#                 waehrend ein anderes Workout desselben Nutzers durchlief: also eine
#                 Eigenschaft des einzelnen Workouts, nicht des Zugangs. Bleibt dauerhaft.
#   „doppelt"   — haben wir schon
ENDGUELTIG = ("kein gps", "doppelt", "http 403", "http 404", "http 410")


def _endgueltig(grund: str | None) -> bool:
    return (grund or "") in ENDGUELTIG


def _vormerken(db: Session, user_id: int, key: str, grund: str) -> None:
    """Workout in die Warteschlange legen (idempotent) — wird spaeter nachgeholt."""
    p = db.query(models.SuuntoPending).filter_by(user_id=user_id, workout_key=key).first()
    if p is None:
        p = models.SuuntoPending(user_id=user_id, workout_key=key)
        db.add(p)
    p.last_error = grund[:200]
    db.commit()


def _nachholen(db: Session, user: models.User, token: str, limit: int = 5) -> int:
    """Aelteste vorgemerkte Workouts nachholen, solange das Kontingent es zulaesst.

    Bewusst gedeckelt (5 je Lauf) und opportunistisch aufgerufen — es gibt keinen Scheduler,
    also haengt es sich an das, was ohnehin passiert: jeden Webhook-Ping und jeden /sync.
    """
    offen = (db.query(models.SuuntoPending)
             .filter(models.SuuntoPending.user_id == user.id, models.SuuntoPending.tries < 10)
             .order_by(models.SuuntoPending.created_at).limit(limit).all())
    geholt = 0
    for p in offen:
        p.tries += 1
        p.last_try_at = datetime.now(timezone.utc)
        ok, grund = _hole_workout(db, user, token, p.workout_key)
        if ok:
            db.delete(p)
            geholt += 1
        elif _endgueltig(grund):
            log.info("Suunto: %s endgueltig nicht holbar (%s) — aus der Warteschlange", p.workout_key, grund)
            db.delete(p)
        else:
            p.last_error = (grund or "")[:200]
            db.commit()
            if grund == "quota":
                break        # Kontingent leer: die uebrigen bleiben liegen
    db.commit()
    return geholt


def _hole_workout(db: Session, user: models.User, token: str, key: str) -> tuple[bool, str | None]:
    """Ein Workout per FIT-Export holen + importieren. (erfolgreich?, Grund fuers Scheitern).

    Der Grund unterscheidet die Faelle, die verschieden behandelt werden muessen:
      "quota"  -> Kontingent leer, spaeter nachholen (Eintrag bleibt in der Warteschlange)
      "http N" -> Suunto mag gerade nicht, ebenfalls nachholen
      "leer"/"kein gps"/"fehler" -> an diesem Workout wird sich nichts mehr aendern
    """
    from .sessions import import_parsed_session  # lazy: vermeidet Import-Zyklus
    from ..fitimport import parse_fit_bytes
    try:
        fr = httpx.get(_fit_url(key),
                       headers={"Authorization": f"Bearer {token}", "Ocp-Apim-Subscription-Key": _sub_key()},
                       timeout=60)
        if _quota_weg(fr):
            log.warning("Suunto: Wochen-Kontingent erschoepft (key=%r) — wird nachgeholt", key)
            return False, "quota"
        if fr.status_code != 200 or not fr.content:
            return False, "http %d" % fr.status_code
        parsed = parse_fit_bytes(fr.content)
        if not parsed.get("gps_samples") or parsed.get("started_at") is None:
            return False, "kein gps"
        s = import_parsed_session(db, user, fr.content, parsed,
                                  src_label="suunto-import", uuid_prefix="suunto-")
        return (s is not None), (None if s is not None else "doppelt")
    except Exception as e:  # noqa: BLE001 — ein kaputtes Workout darf den Rest nicht stoppen
        return False, "fehler %s" % type(e).__name__


def _import_workout(db: Session, user: models.User, token: str, key: str) -> bool:
    """Bisherige Schnittstelle: nur ja/nein."""
    return _hole_workout(db, user, token, key)[0]


# v3 liefert hoechstens `limit` Workouts (Standard 50) und kennt `offset` — v2 kannte das nicht.
# Ohne Seitenweise bekaeme ein Konto mit vielen Workouts beim ersten Sync nur die ersten 50.
V3_SEITE = 100
V3_MAX_SEITEN = 20          # 2000 Workouts je Sync sind mehr als genug


def _workouts_holen(hdr: dict) -> list:
    """Workout-Liste holen — bei v3 seitenweise, bei v2 in einem Zug (dort gibt es das nicht)."""
    def seite(url: str) -> list:
        try:
            r = httpx.get(url, headers=hdr, timeout=30)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Suunto unreachable") from exc
        if r.status_code != 200:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Suunto workouts failed ({r.status_code})")
        return _liste_lesen(r.json())

    if not _v3_aktiv():
        return seite(_workouts_url())
    aus: list = []
    for i in range(V3_MAX_SEITEN):
        teil = seite(f"{_workouts_url()}?limit={V3_SEITE}&offset={i * V3_SEITE}")
        aus.extend(teil)
        if len(teil) < V3_SEITE:        # letzte Seite
            break
    else:
        log.warning("Suunto: mehr als %d Workouts — Rest kommt beim naechsten Sync",
                    V3_SEITE * V3_MAX_SEITEN)
    return aus


@router.get("/vergleich")
def vergleich(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """v2 gegen v3 stellen — rein lesend, schaltet nichts um.

    Damit prueft man vor dem Wechsel an einem ECHTEN Konto, ob der Nachfolger dasselbe liefert:
    gleiche Anzahl Workouts, gleiche Schluessel, und ob der FIT-Download antwortet. Erst wenn
    das passt, kommt `SUUNTO_API_V3=1` in die .env (Jan, 04.09.).

    Der FIT-Test laedt bewusst nur EINEN Workout und wirft die Bytes weg — das Wochenkontingent
    der Suunto-API ist knapp, und es geht hier nur um „antwortet der Pfad".
    """
    _creds()
    link = db.query(models.SuuntoLink).filter_by(user_id=user.id).first()
    if link is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Suunto not linked")
    token = _fresh_token(link, db)
    hdr = {"Authorization": f"Bearer {token}", "Ocp-Apim-Subscription-Key": _sub_key(),
           "Accept": "application/json"}

    def liste(url: str) -> dict:
        try:
            r = httpx.get(url, headers=hdr, timeout=30)
        except Exception as exc:  # noqa: BLE001
            return {"url": url, "fehler": f"{type(exc).__name__}"}
        aus: dict = {"url": url, "http": r.status_code}
        if r.status_code != 200:
            aus["text"] = r.text[:200]
            return aus
        try:
            roh = r.json()
        except Exception:  # noqa: BLE001
            aus["fehler"] = "keine JSON-Antwort"
            return aus
        w = _liste_lesen(roh)
        aus["felder_oben"] = sorted(roh.keys())[:8] if isinstance(roh, dict) else "(Liste)"
        aus["anzahl"] = len(w)
        aus["schluessel"] = [_workout_key(x) for x in w[:10] if isinstance(x, dict)]
        aus["felder_je_workout"] = sorted(w[0].keys())[:20] if w and isinstance(w[0], dict) else []
        return aus

    v2 = liste(WORKOUTS_URL_V2)
    v3 = liste(WORKOUTS_URL_V3)

    fit: dict = {}
    key = next((k for k in (v3.get("schluessel") or v2.get("schluessel") or []) if k), None)
    if key:
        for name, url in (("v2", FIT_EXPORT_V2.format(key=key)), ("v3", FIT_EXPORT_V3.format(key=key))):
            try:
                r = httpx.get(url, headers={"Authorization": f"Bearer {token}",
                                            "Ocp-Apim-Subscription-Key": _sub_key()}, timeout=60)
                fit[name] = {"http": r.status_code, "bytes": len(r.content or b"")}
            except Exception as exc:  # noqa: BLE001
                fit[name] = {"fehler": type(exc).__name__}

    gleich = (v2.get("anzahl") == v3.get("anzahl")
              and set(v2.get("schluessel") or []) == set(v3.get("schluessel") or []))
    return {"aktiv": "v3" if _v3_aktiv() else "v2", "v2": v2, "v3": v3,
            "fit_test_key": key, "fit": fit, "listen_gleich": gleich}


@router.post("/sync")
def sync(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Alle Workouts ziehen und je FIT als Session importieren (idempotent)."""
    _creds()
    link = db.query(models.SuuntoLink).filter_by(user_id=user.id).first()
    if link is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Suunto not linked")

    token = _fresh_token(link, db)
    hdr = {"Authorization": f"Bearer {token}", "Ocp-Apim-Subscription-Key": _sub_key(), "Accept": "application/json"}
    workouts = _workouts_holen(hdr)

    imported = skipped = gefiltert = 0
    for w in (workouts or []):
        key = _workout_key(w)
        if not key:
            skipped += 1
            continue
        grund = _vorfilter(w)
        if grund:
            # Gar nicht erst laden — spart den teuren FIT-Download.
            log.info("Suunto: Workout %s uebersprungen (%s)", key, grund)
            gefiltert += 1
            continue
        ok, fehler = _hole_workout(db, user, token, key)
        if ok:
            imported += 1
        else:
            skipped += 1
            if not _endgueltig(fehler) and (fehler == "quota" or (fehler or "").startswith(("http", "fehler"))):
                _vormerken(db, user.id, key, fehler or "?")
            if fehler == "quota":
                break     # Kontingent leer: Rest bleibt vorgemerkt
    # Was frueher liegengeblieben ist, hier gleich mitnehmen (solange Kontingent da ist).
    nachgeholt = _nachholen(db, user, token)
    link.last_sync_at = datetime.now(timezone.utc)
    db.commit()
    offen = db.query(models.SuuntoPending).filter_by(user_id=user.id).count()
    return {"imported": imported + nachgeholt, "skipped": skipped,
            "filtered": gefiltert, "pending": offen}


@router.post("/webhook")
async def webhook(request: Request, background: BackgroundTasks) -> dict:
    """Auto-Import: Suunto benachrichtigt bei neuem Workout.

    Vertrag laut `apizone.suunto.com/webhooks`:
    - Antwort **binnen 2 Sekunden** mit 2XX, sonst Retries mit Backoff und danach ein Circuit
      Breaker, der *alle* Benachrichtigungen für unsere App pausiert. Deshalb wird hier nur
      geprüft und sofort geantwortet; Token-Holen + FIT-Import laufen im Hintergrund.
    - `X-HMAC-SHA256-Signature` = HMAC-SHA256 über den **rohen** Body mit dem im Portal selbst
      gesetzten Notification Secret (`OAUTH_SUUNTO_NOTIFICATION_SECRET`). Ohne gesetztes Secret
      wird nicht geprüft (sonst wäre der Webhook vor dem Portal-Eintrag tot).
    - Nutzer steckt in `username`, der Workout-Key verschachtelt in `workout.workoutKey`
      (die flache Form ist nur die Legacy-Variante mit Form-Parametern).
    Immer 2XX, auch bei Unbekanntem — alles andere provoziert nur Retries.
    """
    raw = await request.body()
    secret = os.environ.get("OAUTH_SUUNTO_NOTIFICATION_SECRET", "")
    if secret:
        want = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        got = request.headers.get("X-HMAC-SHA256-Signature", "")
        if not hmac.compare_digest(want, got.strip().lower()):
            log.warning("Suunto Webhook: Signatur passt nicht (Header %r, %d Bytes Body)", got, len(raw))
            return {"ok": True}
    try:
        body = json.loads(raw or b"{}")
        if not isinstance(body, dict):
            raise ValueError("kein Objekt")
    except Exception:  # noqa: BLE001  -> Legacy-Form-Parameter
        form = await request.form()
        body = {k: v for k, v in form.items()}
    typ = str(body.get("type") or "")
    wo = body.get("workout") if isinstance(body.get("workout"), dict) else {}
    username = str(body.get("username") or body.get("user") or "")
    key = str(wo.get("workoutKey") or body.get("workoutid") or body.get("workoutKey") or "")
    # Erster echter Ping: festhalten, was tatsächlich ankommt (Feldnamen, Header). Bewusst
    # warning: für unsere Logger ist ohne Logging-Config nur root=WARNING aktiv, info verfällt.
    # Auch die Felder des WORKOUT-Objekts protokollieren: der Vorfilter unten lebt von ihnen,
    # und welche Suunto im Ping wirklich mitschickt, steht in keiner Doku (im Ping-Log standen
    # bisher nur die Felder der obersten Ebene).
    log.warning("Suunto Webhook: type=%r username=%r key=%r felder=%s workout=%s header=%s",
                typ, username, key, sorted(body.keys()),
                {k: wo.get(k) for k in sorted(wo.keys())
                 if k in ("activityId", "totalDistance", "totalTime", "duration", "distance",
                          "totalAscent", "maxSpeed", "avgSpeed", "startTime")} or sorted(wo.keys()),
                sorted(request.headers.keys()))
    if typ and typ != "WORKOUT_CREATED":
        return {"ok": True}   # Route/24-7-Benachrichtigungen interessieren uns nicht
    if username and key:
        # Vorfilter schon HIER: erkennen wir aus den Metadaten des Pings, dass es kein Pumpfoil
        # sein kann, sparen wir den FIT-Download komplett — kein API-Aufruf, kein Kontingent.
        grund = _vorfilter(wo)
        if grund:
            log.info("Suunto Webhook: %s uebersprungen (%s)", key, grund)
            return {"ok": True}
        background.add_task(_import_notified_workout, username, key)
    return {"ok": True}


def _import_notified_workout(username: str, key: str) -> None:
    """Import nach der Webhook-Antwort, in eigener DB-Session (die Request-Session ist zu)."""
    db = SessionLocal()
    try:
        link = db.query(models.SuuntoLink).filter_by(suunto_username=username).first()
        if link is None:
            log.info("Suunto Webhook: kein verknüpfter Nutzer für username=%r", username)
            return
        user = db.get(models.User, link.user_id)
        if user is None:
            return
        token = _fresh_token(link, db)
        ok, fehler = _hole_workout(db, user, token, key)
        if ok:
            link.last_sync_at = datetime.now(timezone.utc)
            db.commit()
        elif _endgueltig(fehler):
            # Endgueltig heisst: nachholen bringt nichts (kein GPS, schon vorhanden, 403/404/410).
            # Trotzdem PROTOKOLLIEREN — vorher verschwand so ein Ping voellig lautlos, und beim
            # Nachrechnen am 02.09. war dadurch nicht zu unterscheiden, ob ein Workout kein GPS
            # hatte oder ob die Verknuepfung inzwischen weg ist. Eine Zeile Log beantwortet das.
            log.info("Suunto Webhook: %s nicht importiert (%s, Nutzer %s)", key, fehler, user.id)
        elif fehler == "quota" or (fehler or "").startswith(("http", "fehler")):
            # Suunto schickt denselben Ping NICHT noch einmal — ohne Vormerkung waere die
            # Session verloren. Genau das ist bei erschoepftem Wochen-Kontingent passiert.
            _vormerken(db, user.id, key, fehler or "?")
        # Bei der Gelegenheit nachholen, was frueher liegengeblieben ist (nur wenn dieser
        # Import geklappt hat — sonst ist ohnehin gerade kein Kontingent da).
        if ok:
            n = _nachholen(db, user, token)
            if n:
                log.warning("Suunto: %d nachgeholte Workouts importiert (Nutzer %s)", n, user.id)
    except Exception as e:  # noqa: BLE001
        log.warning("Suunto Webhook-Import fehlgeschlagen (username=%r, key=%r): %r", username, key, e)
    finally:
        db.close()


@router.delete("")
def unlink(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = db.query(models.SuuntoLink).filter_by(user_id=user.id).first()
    if link is not None:
        db.delete(link)
        db.commit()
    return {"ok": True}
