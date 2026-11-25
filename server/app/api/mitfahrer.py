"""Media-Overlay mit mehreren Fahrern (docs/MEDIA.md, Schritt 6; Jan 25.11.2026): wen kann ich zu einem Lauf dazuholen?

`GET /api/sessions/{id}/mitfahrer?quelle=…` liefert Feed-Zeilen (`community._brief`) als Auswahl fuer das Popup
„+ Fahrer". Gezeichnet wird spaeter mit den normalen Session-Abrufen — hier wird nur gesucht, nichts neu gerechnet.

Quellen:
  gleichzeitig  am selben Spot, zeitlich ueberlappend (fuer „Echtzeit wie es war")
  tag           am selben Spot, am selben Tag (Ortszeit des Spots), ueberlappend oder nicht
  freunde       Sessions der bestaetigten Freunde der letzten 90 Tage, die am selben Spot zuerst
  eigene        eigene Sessions, die am selben Spot zuerst

DATENSCHUTZ (Jan 25.11.2026):
  * Sichtbarkeit wie der Community-Feed (`community._community`: geloescht, gemeldet, gesperrt, versteckt, laufend).
  * „Ort verbergen": der Spot-Filter (`_spot_cond`) laesst verborgene Aufnahmen bei ihrem echten Spot weg — sonst
    verriete die Suche den Ort.
  * „Uhrzeit verbergen": fremde Aufnahmen mit `hide_time` fehlen bei `gleichzeitig` ganz (die Ueberlappung selbst
    verriete die Uhrzeit) und tragen nirgends ein `ueberlappt`. Ihre Zeilen werden wie ueberall auf 12:00 geschoben
    (`zeitverbergen.liste_anwenden`). Das gilt auch fuer Freunde — der Schalter verbirgt die Uhrzeit vor ALLEN
    anderen. Die Oberflaeche sperrt den Echtzeit-Versatz, sobald ein gewaehlter Fahrer `zeit_verborgen` hat.
  * Ist die AUSGANGS-Session fuer den Betrachter zeitverborgen (fremde Session), gibt es weder `gleichzeitig` noch
    `ueberlappt`.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, case, or_
from sqlalchemy.orm import Session

from .. import models, zeitverbergen
from ..db import get_db
from ..freunde import freund_ids
from ..tzlookup import tz_name
from .community import BRIEF_COLS, S_STARTED_IDX, S_USER_ID_IDX, _brief, _community, _spot_cond, _verbergende_nutzer
from .deps import current_user

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

QUELLEN = ("gleichzeitig", "tag", "freunde", "eigene")
MAX_ZEILEN = 40
FREUNDE_TAGE = 90
S = models.Session
S_ENDED_IDX = next(i for i, c in enumerate(BRIEF_COLS) if c is S.ended_at)


def _aware(t: datetime | None) -> datetime | None:
    if t is None:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _ende(s) -> datetime | None:
    return _aware(s.ended_at) or (_aware(s.started_at) + timedelta(hours=3) if s.started_at else None)


def _tag_fenster(s) -> tuple[datetime, datetime]:
    """Lokaler Kalendertag der Session (Zeitzone des Ortes) als UTC-Fenster."""
    try:
        zone = ZoneInfo(tz_name(s.place_lat, s.place_lon) or "UTC")
    except Exception:  # noqa: BLE001
        zone = ZoneInfo("UTC")
    tag = _aware(s.started_at).astimezone(zone).date()
    von = datetime.combine(tag, time(0, 0), tzinfo=zone)
    return von.astimezone(timezone.utc), (von + timedelta(days=1)).astimezone(timezone.utc)


@router.get("/{session_id}/mitfahrer")
def mitfahrer(session_id: int, quelle: str = "gleichzeitig", user: models.User = Depends(current_user),
              db: Session = Depends(get_db)) -> dict:
    if quelle not in QUELLEN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "quelle")
    from .sessions import _readable
    s = _readable(db, session_id, user)
    if s.started_at is None:
        return {"quelle": quelle, "zeilen": [], "echtzeit": False}
    start, ende = _aware(s.started_at), _ende(s)
    zv_ids = zeitverbergen.nutzer_ids(db)
    # Ausgangs-Session fremd und zeitverborgen -> keine Aussage ueber Gleichzeitigkeit.
    echtzeit = not zeitverbergen.gilt(s.user, user.id)

    q = _community(db.query(*BRIEF_COLS), user.id, accel_only=False, sport="all").filter(S.id != s.id)
    hat_spot = s.spot_id is not None
    am_spot = _spot_cond(str(s.spot_id), db) if hat_spot else None
    fremd_verborgen = and_(S.user_id.in_(list(zv_ids)), S.user_id != user.id) if zv_ids else None

    if quelle == "gleichzeitig":
        if not (echtzeit and hat_spot):
            return {"quelle": quelle, "zeilen": [], "echtzeit": echtzeit}
        q = q.filter(am_spot, S.started_at < ende, or_(S.ended_at.is_(None), S.ended_at > start))
        if fremd_verborgen is not None:
            q = q.filter(~fremd_verborgen)
        q = q.order_by(S.started_at)
    elif quelle == "tag":
        if not hat_spot:
            return {"quelle": quelle, "zeilen": [], "echtzeit": echtzeit}
        von, bis = _tag_fenster(s)
        q = q.filter(am_spot, S.started_at >= von, S.started_at < bis)
        q = q.order_by(zeitverbergen.sortier_start(S.started_at, S.user_id, zv_ids))
    else:
        if quelle == "freunde":
            ids = freund_ids(db, user.id)
            if not ids:
                return {"quelle": quelle, "zeilen": [], "echtzeit": echtzeit}
            q = q.filter(S.user_id.in_(list(ids)), S.started_at >= datetime.now(timezone.utc) - timedelta(days=FREUNDE_TAGE))
        else:
            q = q.filter(S.user_id == user.id)
        erst_spot = case((am_spot, 0), else_=1) if hat_spot else None
        ordnung = [zeitverbergen.sortier_start(S.started_at, S.user_id, zv_ids).desc()]
        q = q.order_by(*([erst_spot] if erst_spot is not None else []), *ordnung)

    rows = q.limit(MAX_ZEILEN).all()
    verb = _verbergende_nutzer(db)
    zeilen = []
    for r in rows:
        z = _brief(*r, verbergende=verb)
        uid = r[S_USER_ID_IDX]
        verborgen = uid in zv_ids and uid != user.id
        r_start = _aware(r[S_STARTED_IDX])
        r_ende = _aware(r[S_ENDED_IDX])
        # Ueberlappung nur, wenn beide Uhrzeiten fuer den Betrachter sichtbar sind.
        z["ueberlappt"] = (None if (verborgen or not echtzeit or r_start is None)
                           else bool(r_start < ende and (r_ende is None or r_ende > start)))
        z["eigene"] = uid == user.id
        z["gleicher_spot"] = bool(hat_spot and quelle in ("gleichzeitig", "tag")) or None
        zeilen.append(z)
    zeitverbergen.liste_anwenden(db, zeilen, user.id)
    if quelle in ("freunde", "eigene") and hat_spot:
        # Wer am selben Spot war, ohne dass der Ort verborgen ist (eine Zeile pro Abfrage, MAX_ZEILEN klein).
        ids_spot = {i for (i,) in db.query(S.id).filter(S.id.in_([z["session_id"] for z in zeilen]), am_spot)}
        for z in zeilen:
            z["gleicher_spot"] = z["session_id"] in ids_spot
    return {"quelle": quelle, "zeilen": zeilen, "echtzeit": echtzeit}
