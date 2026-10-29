"""Verknuepfen mit Polar/Suunto/Strava/COROS: Rueckweg an die Anmeldung im Browser binden.

WARUM (Security-Review 29.10.2026, S-014): Der Hersteller schickt den Browser mit Einmal-Code und
unserem `state` (signiertes JWT mit der uid) zurueck. Diese Weiterleitung traegt KEINE Anmeldung —
pumpfoil.org setzt keine Cookies, das Login-Token liegt im localStorage und reist nur bei
fetch-Aufrufen der PWA mit. Bisher hat der Callback deshalb blind die uid aus dem `state`
genommen. Wer jemandem seinen eigenen Verbinden-Link unterschob, bekam so dessen Hersteller-Konto
(GPS-Strecken, Puls) an das EIGENE Pumpfoil-Konto gehaengt.

Jetzt in zwei Schritten:
  1. `GET …/callback` (vom Hersteller) tauscht NICHTS ein, sondern leitet mit code/state/error auf
     `/konten?verknuepfen=<anbieter>&…` weiter.
  2. Die PWA ruft dort `POST …/abschliessen` MIT ihrem Login auf. Erst hier wird eingetauscht —
     und nur, wenn die angemeldete Person die aus dem `state` ist. Sonst 403, nichts passiert.

Kein Cookie, kein zusaetzlicher Klick fuer angemeldete Nutzer.

OHNE Anmeldung im Browser (29.10.2026, nachgezogen): die Apps oeffnen den Hersteller im externen
Browser (Android) bzw. im In-App-Safari (iOS) — dort ist meist niemand bei pumpfoil.org angemeldet.
Dann zeigt /konten eine Bestaetigung MIT dem Namen des Ziel-Kontos („Polar mit dem Pumpfoil-Konto
‚X' verbinden?"), und erst der Klick schliesst ab (`…/abschliessen-bestaetigt`). Ein untergeschobener
Link zeigt so den Namen des fremden Kontos — informierte Zustimmung statt blindem Verknuepfen.
"""
from __future__ import annotations

from typing import Callable
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field

from ..config import get_settings
from .. import models


class AbschlussIn(BaseModel):
    code: str | None = Field(default=None, max_length=4096)
    state: str | None = Field(default=None, max_length=8192)
    error: str | None = Field(default=None, max_length=200)


def zur_bestaetigung(anbieter: str, request: Request) -> RedirectResponse:
    """Schritt 1: Hersteller-Rueckweg unveraendert an die PWA durchreichen."""
    q = {"verknuepfen": anbieter}
    for k in ("code", "state", "error"):
        v = request.query_params.get(k)
        if v:
            q[k] = v
    return RedirectResponse(f"{get_settings().base_url}/konten?{urlencode(q)}", status_code=303)


def abschliessen(user: models.User, uid_aus_state: int | None,
                 ausfuehren: Callable[[], Response]) -> dict:
    """Schritt 2: nur fuer die Person, die den Verbinden-Link selbst angefordert hat.

    `uid_aus_state is None` (abgelaufen, kaputt, Abbruch beim Hersteller) laeuft durch: der
    bisherige Callback meldet das selbst als Fehler/Abbruch und verknuepft dann nichts."""
    if uid_aus_state is not None and uid_aus_state != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "fremd")
    return als_json(ausfuehren())


def als_json(resp: Response) -> dict:
    """Antwort des bisherigen Callbacks fuer die PWA: Weiterleitung -> Ziel (Pfad + Query),
    Fehlerseite -> Titel/Text (sofern die Seite sie mitgibt)."""
    if isinstance(resp, RedirectResponse):
        ziel = urlsplit(resp.headers.get("location", "/konten"))
        return {"weiter": ziel.path + (f"?{ziel.query}" if ziel.query else "")}
    fehler = getattr(resp, "fehler", None) or {}
    return {"weiter": None, "titel": fehler.get("titel"), "text": fehler.get("text")}


def routen_ohne_login(router: APIRouter, uid_aus_state: Callable[[str], int | None],
                      ausfuehren: Callable[[AbschlussIn, object], Response]) -> None:
    """Zwei Routen fuer den Rueckweg ohne Anmeldung (s. Kopf): wem gehoert der Link, und der
    ausdruecklich bestaetigte Abschluss."""
    from sqlalchemy.orm import Session as DbSession

    from ..db import get_db
    from ..ratelimit import rate_limit

    @router.get("/ziel")
    def ziel(state: str, db: DbSession = Depends(get_db),
             _rl: None = Depends(rate_limit(60, 900, "verkn-ziel"))) -> dict:
        uid = uid_aus_state(state or "")
        u = db.get(models.User, uid) if uid is not None else None
        if u is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "abgelaufen")
        return {"name": u.display_name or "?", "avatar_url": u.avatar_url}

    @router.post("/abschliessen-bestaetigt")
    def abschliessen_bestaetigt(body: AbschlussIn, db: DbSession = Depends(get_db),
                                _rl: None = Depends(rate_limit(20, 900, "verkn-bestaetigt"))) -> dict:
        return als_json(ausfuehren(body, db))
