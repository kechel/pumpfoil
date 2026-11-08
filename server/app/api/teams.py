"""Teams: anlegen, einstellen, beitreten, Bestenlisten, Freigabe (31.10.2026). Regeln: app/teams.py,
Plan: docs/TEAMS.md.

Drei Router:
  * `router` (/api/teams) — angemeldet, hinter `require_social` (main.py).
  * `public_router` (/api/public/teams) — OHNE Login, nur die Bestenlisten oeffentlicher, freigegebener
    Teams in Gast-Form (Rang, Name, Initialen, Wert).
  * `admin_router` (/api/admin/teams) — Freigabe-Warteschlange.

Antworten verraten nichts Ueberfluessiges: ein Team, das man nicht sehen darf, ist 404 wie eines, das es
nicht gibt.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from .. import models, teams as T
from ..db import get_db
from ..ratelimit import rate_limit
from .deps import current_admin, current_user

router = APIRouter(prefix="/api/teams", tags=["teams"])
public_router = APIRouter(prefix="/api/public/teams", tags=["teams"])
admin_router = APIRouter(prefix="/api/admin/teams", tags=["admin"])


def _404() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "not found")


def _sportarten() -> set[str]:
    from ..sportarten import FOIL
    return set(FOIL) | {"pumpfoil", "all"}


def _team_fuer(db: Session, slug: str, user: models.User | None) -> tuple[models.Team, models.TeamMitglied | None]:
    """Team zu einer Adresse — nur, wenn der Betrachter es sehen darf."""
    t, _um = T.finde(db, slug)
    if t is None:
        raise _404()
    m = T.mitglied(db, t.id, user.id if user else None)
    if m is None and not T.oeffentlich_sichtbar(t):
        raise _404()
    return t, m


def _leiter(db: Session, slug: str, user: models.User) -> models.Team:
    t, m = _team_fuer(db, slug, user)
    if not T.ist_leiter(m):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nur_leiter")
    return t


def _verwalter(db: Session, slug: str, user: models.User) -> tuple[models.Team, models.TeamMitglied]:
    t, m = _team_fuer(db, slug, user)
    if not T.darf_verwalten(m):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nur_verwalter")
    return t, m


def _kurz(t: models.Team, intern: bool, db: Session, sportarten: list[str] | None = None) -> dict:
    if sportarten is None:
        sportarten = T.sportarten(db, [t.id])[t.id]
    return {"id": t.id, **T.auftritt(t, intern), "sportarten": sportarten}


def _team_out(db: Session, t: models.Team, m: models.TeamMitglied | None) -> dict:
    intern = T.aktiv(m) or (m is not None and m.status == "angefragt")
    mitglied_aktiv = T.aktiv(m)
    anzahl = int(db.query(func.count(models.TeamMitglied.id))
                 .filter_by(team_id=t.id, status="aktiv").scalar() or 0)
    out = {
        **_kurz(t, intern, db),
        "mitglieder_anzahl": anzahl,
        "oeffentlich": bool(t.oeffentlich),
        "bestenlisten_oeffentlich": T.bestenlisten_oeffentlich(t),
        "anmeldungen_zulassen": bool(t.anmeldungen_zulassen),
        "automatisch_akzeptieren": bool(t.automatisch_akzeptieren),
        "mitglieder_sichtbar": t.mitglieder_sichtbar,
        "meine_rolle": m.rolle if mitglied_aktiv else None,
        "mein_status": m.status if m is not None else None,
        "darf_bestenlisten": mitglied_aktiv or T.bestenlisten_oeffentlich(t),
        # Offizielles Team (server/.env TEAM_GLOBAL): nur hier gibt es beim Event-Anlegen „global" (06.11.2026).
        "offiziell": t.id == T.offizielles_team_id(db),
        "darf_mitglieder": mitglied_aktiv or (T.oeffentlich_sichtbar(t) and t.mitglieder_sichtbar == "angemeldete"),
        # Team-Chat nur fuer aktive Mitglieder (Zugriff prueft chat._require_access).
        "chat_scope": T.chat_scope(t.id) if mitglied_aktiv else None,
        # Offene Beitrittsanfragen — nur fuer Leitung/Moderatoren (Badge auf der Teamseite, Jan 01.11.2026).
        "anfragen_offen": int(db.query(func.count(models.TeamMitglied.id))
                              .filter_by(team_id=t.id, status="angefragt").scalar() or 0) if T.darf_verwalten(m) else 0,
    }
    if T.ist_leiter(m):
        spots = (db.query(models.Spot.id, models.Spot.name)
                 .join(models.TeamSpot, models.TeamSpot.spot_id == models.Spot.id)
                 .filter(models.TeamSpot.team_id == t.id).all())
        out.update({
            "freigabe": t.freigabe, "freigabe_notiz": t.freigabe_notiz,
            "auftritt_geaendert": T.auftritt_geaendert(t),
            "frei": T.auftritt(t, False) if t.frei_am else None,
            "spots": [{"id": i, "name": n} for i, n in spots],
        })
    elif mitglied_aktiv:
        spots = (db.query(models.Spot.id, models.Spot.name)
                 .join(models.TeamSpot, models.TeamSpot.spot_id == models.Spot.id)
                 .filter(models.TeamSpot.team_id == t.id).all())
        out["spots"] = [{"id": i, "name": n} for i, n in spots]
    return out


# ------------------------------------------------------------------------- Anlegen/Liste ----

class NeuIn(BaseModel):
    name: str = Field(min_length=T.NAME_MIN, max_length=T.NAME_MAX)
    slug: str | None = Field(default=None, max_length=T.SLUG_MAX)


def _name_pruefen(db: Session, name: str, team_id: int | None = None) -> str:
    name = " ".join((name or "").split())
    if not T.NAME_MIN <= len(name) <= T.NAME_MAX:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "name_laenge")
    belegt = (db.query(models.Team.id)
              .filter(func.lower(models.Team.name) == name.lower(), models.Team.id != (team_id or 0),
                      models.Team.geloescht_am.is_(None)).first())
    if belegt is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "name_belegt")
    return name


def _slug_pruefen(db: Session, slug: str, team_id: int | None = None, admin: bool = False) -> str:
    slug = (slug or "").strip().lower()
    fehler = T.slug_fehler(slug)
    # Reservierte Adressen („pumpfoil", „official" …) nur fuer Admins — fuers offizielle Team (06.11.2026).
    if fehler == "slug_reserviert" and admin:
        fehler = None
    if fehler:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, fehler)
    if not T.slug_frei(db, slug, team_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "slug_belegt")
    return slug


@router.get("/slug")
def slug_vorschlag(name: str = "", slug: str = "", team_id: int | None = None,
                   _u: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Vorschlag aus dem Namen bzw. Pruefung einer Wunschadresse."""
    if slug:
        s = slug.strip().lower()
        fehler = T.slug_fehler(s) or (None if T.slug_frei(db, s, team_id) else "slug_belegt")
        return {"slug": s, "frei": fehler is None, "fehler": fehler}
    return {"slug": T.freier_slug(db, name), "frei": True, "fehler": None}


@router.post("")
def anlegen(body: NeuIn, user: models.User = Depends(current_user), db: Session = Depends(get_db),
            _rl: None = Depends(rate_limit(10, 3600, "team-neu"))) -> dict:
    geleitet = int(db.query(func.count(models.TeamMitglied.id))
                   .join(models.Team, models.Team.id == models.TeamMitglied.team_id)
                   .filter(models.TeamMitglied.user_id == user.id, models.TeamMitglied.rolle == "leiter",
                           models.Team.geloescht_am.is_(None)).scalar() or 0)
    if geleitet >= T.MAX_TEAMS_JE_PERSON:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "zu_viele_teams")
    name = _name_pruefen(db, body.name)
    slug = _slug_pruefen(db, body.slug, admin=bool(user.is_admin)) if body.slug else T.freier_slug(db, name)
    t = models.Team(name=name, slug=slug, angelegt_von=user.id, farbe="cyan")
    db.add(t)
    db.flush()
    db.add(models.TeamMitglied(team_id=t.id, user_id=user.id, rolle="leiter", status="aktiv",
                               zustimmung_am=T._jetzt()))
    for i, k in enumerate(T.STANDARD_TAFELN):
        db.add(models.TeamTafel(team_id=t.id, kennzahl=k, reihenfolge=i))
    db.commit()
    return {"slug": t.slug, "id": t.id}


@router.get("/mine")
def meine(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Meine Teams (aktiv + angefragt) — fuer Home-Links und die Profilseite."""
    M = models.TeamMitglied
    out = []
    zeilen = (db.query(M, models.Team).join(models.Team, models.Team.id == M.team_id)
              .filter(M.user_id == user.id, models.Team.geloescht_am.is_(None)).order_by(M.seit.asc()).all())
    sp = T.sportarten(db, [t.id for _m, t in zeilen])
    for m, t in zeilen:
        offen = 0
        if T.darf_verwalten(m):
            offen = int(db.query(func.count(M.id)).filter_by(team_id=t.id, status="angefragt").scalar() or 0)
        out.append({**_kurz(t, True, db, sp[t.id]), "rolle": m.rolle, "status": m.status, "anfragen": offen,
                    "freigabe": t.freigabe if T.ist_leiter(m) else None})
    return out


@router.get("/liste")
def liste(_u: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Community-Abschnitt: nur freigegebene Teams, in ihrer freigegebenen Fassung."""
    M = models.TeamMitglied
    zahl = dict(db.query(M.team_id, func.count(M.id)).filter(M.status == "aktiv").group_by(M.team_id).all())
    offiziell = T.offizielles_team_id(db)
    teams = [t for t in db.query(models.Team).filter(models.Team.frei_am.isnot(None), models.Team.geloescht_am.is_(None)).all()
             if t.id != offiziell]   # das offizielle Team ist der Ort der globalen Events, kein Team zum Mitmachen
    sp = T.sportarten(db, [t.id for t in teams])
    out = [{**_kurz(t, False, db, sp[t.id]), "mitglieder_anzahl": int(zahl.get(t.id, 0)),
            "anmeldungen_zulassen": bool(t.anmeldungen_zulassen),
            "bestenlisten_oeffentlich": T.bestenlisten_oeffentlich(t)} for t in teams]
    # Aktivitaet (Jan, 02.11.2026: „die 10 most active teams"): Sessions der aktiven Mitglieder in den letzten 30 Tagen.
    # Gezaehlt wie die Team-Summen sonst auch nur sichtbare (nicht geloeschte, nicht gemeldete, fertige) Aufnahmen.
    S = models.Session
    seit = datetime.now(timezone.utc) - timedelta(days=30)
    aktiv = dict(db.query(M.team_id, func.count(func.distinct(S.id)))
                 .join(S, S.user_id == M.user_id)
                 .filter(M.status == "aktiv", M.team_id.in_([t.id for t in teams]),
                         S.started_at >= seit, S.deleted.isnot(True), S.flagged.isnot(True),
                         S.status.notin_(("recording", "live")))
                 .group_by(M.team_id).all()) if teams else {}
    for x, t in zip(out, teams):
        x["sessions_30d"] = int(aktiv.get(t.id, 0))
    out.sort(key=lambda x: (-x["mitglieder_anzahl"], (x["name"] or "").lower()))
    return out


def _event_kurz(db: Session, e: models.TeamEvent, t: models.Team, intern: bool, jetzt) -> dict:
    """Event ohne Bestenlisten, fuer Community-Seite und Event-Uebersicht."""
    tafeln_ = T.event_tafeln(e)
    sportarten = list(dict.fromkeys(tf.sportart for tf in tafeln_)) or [e.summen_sportart or "pumpfoil"]
    ids = T.event_spots(e)
    spots = ([{"id": i, "name": n} for i, n in db.query(models.Spot.id, models.Spot.name)
              .filter(models.Spot.id.in_(ids)).all()] if ids else [])
    a = T.auftritt(t, intern)
    return {"id": e.id, "titel": e.titel, "beschreibung": e.beschreibung, "start": T._aware(e.start).isoformat(),
            "ende": T._aware(e.ende).isoformat(), "zeitzone": e.zeitzone, "status": T.event_status(e, jetzt),
            "sportarten": sportarten, "spots": spots, "global": T.ist_global(e),
            "team": {"slug": a["slug"], "name": a["name"], "logo_url": a["logo_url"], "farbe": a["farbe"], "land": a["land"]}}


def _events_sichtbar(db: Session, uid: int):
    """Events fuer die Community-Seite und „Alle Events": seit 06.11.2026 NUR globale (Jan: „team-interne events
    interessieren niemanden ausser den team-mitgliedern") — Team-Events stehen auf der Teamseite. Liefert (Abfrage,
    eigene Team-IDs)."""
    E, Tm = models.TeamEvent, models.Team
    eigene = set(T.mitglieder_team_ids(db, uid))
    q = (db.query(E, Tm).join(Tm, Tm.id == E.team_id)
         .filter(E.geloescht_am.is_(None), Tm.geloescht_am.is_(None), E.global_event.is_(True)))
    return q, eigene


@router.get("/liste/vergleich")
def vergleich(period: str = "30d", top: int = 5, sport: str = "pumpfoil", region: str = "all",
              _u: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Team-Bestenlisten der Community: je Kennzahl die Summe der besten 3/5/10 Fahrer eines Teams (T.vergleich).
    `sport` seit 05.11.2026 (Jan: „es wird auch teams nur fuer foilscoot oder gemischt geben, es soll halt jeweils
    immer nur die gleiche sportart verglichen werden") — dieselbe Sportart-Wahl wie die Bestenliste der Mitglieder."""
    from .community import PERIODS
    from ..sportarten import SPORTS
    period = period if period in PERIODS else "30d"
    top = top if top in T.VERGLEICH_TOP else 5
    from .. import sportmix
    sport = sportmix.gueltig(sport if sport != "all" else "pumpfoil")   # auch Mischungen (08.11.2026)
    # Region (05.11.2026, app/regionen.py): Teams nach ihrer Herkunft — ein polnisches Team steht unter Polen und unter
    # Europa, ein Team mit Herkunft „Europa" nur unter Europa, eines mit „Erde" nur in Global.
    from .. import regionen
    region = regionen.pruefen(region)
    teams = [z for z in T.vergleich(db, period, top, sport) if regionen.passt(z.get("land"), region)]
    # Quellen klein unter der Liste (community.quellen): womit die Mitglieder der gezeigten Teams im Zeitraum fuhren.
    from .community import _cutoff, quellen
    mitglieder = {u for z in teams for u in T.mitglieder_ids(db, z["team_id"])} if teams and "team_id" in teams[0] else set()
    if not mitglieder and teams:
        slugs = {z["slug"] for z in teams}
        for t in db.query(models.Team).filter(models.Team.frei_slug.in_(slugs)).all():
            mitglieder |= set(T.mitglieder_ids(db, t.id))
    q = quellen(db, user_ids=mitglieder, sport=sport, cut=_cutoff(period)) if mitglieder else []
    return {"period": period, "top": top, "sport": sport, "region": region, "teams": teams, "quellen": q}


@router.get("/liste/events")
def liste_events(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Community-Abschnitt (Jan, 01.11.2026): laufende Events und solche, die in den naechsten Tagen beginnen
    (T.EVENT_VORSCHAU), alle. Ohne Bestenlisten — die stehen auf der Event-Seite. Seit 08.11.2026 auch beendete, die
    noch nicht eingefroren sind („Results pending", Jan: „zeigen wir da trotzdem noch mit an"). Reihenfolge: laufende,
    dann in Auswertung, dann kommende."""
    jetzt = T._jetzt()
    E = models.TeamEvent
    q, eigene = _events_sichtbar(db, user.id)
    rows = (q.filter(E.eingefroren_am.is_(None), E.start <= jetzt + T.EVENT_VORSCHAU)
            .order_by(E.start).limit(200).all())   # alle zeigen (Jan); die Grenze ist nur ein Notanker
    rang = {"laeuft": 0, "auswertung": 1, "kommend": 2}
    rows.sort(key=lambda r: rang.get(T.event_status(r[0], jetzt), 3))   # stabil: innerhalb nach Start
    return [_event_kurz(db, e, t, t.id in eigene, jetzt) for e, t in rows]


@router.get("/liste/events/meine")
def liste_events_meine(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Community, unter den globalen (Jan, 06.11.2026: „das sollte zusaetzlich wieder rein unter Global events … ruhig
    alle events"): Team-Events der eigenen Teams (aktive Mitgliedschaft) — laufende, kommende und die der letzten 7 Tage,
    laufende zuerst, dann kommende, dann vergangene."""
    eigene = T.mitglieder_team_ids(db, user.id)
    if not eigene:
        return []
    jetzt = T._jetzt()
    E, Tm = models.TeamEvent, models.Team
    rows = (db.query(E, Tm).join(Tm, Tm.id == E.team_id)
            .filter(E.team_id.in_(eigene), E.geloescht_am.is_(None), Tm.geloescht_am.is_(None),
                    E.global_event.isnot(True), E.ende > jetzt - timedelta(days=7))
            .order_by(E.start).limit(200).all())
    gruppe = lambda e: 0 if T._aware(e.start) <= jetzt < T._aware(e.ende) else (1 if T._aware(e.start) > jetzt else 2)
    rows.sort(key=lambda r: (gruppe(r[0]), T._aware(r[0].start) if gruppe(r[0]) < 2 else -T._aware(r[0].ende).timestamp()))
    return [_event_kurz(db, e, t, True, jetzt) for e, t in rows]


@router.get("/liste/events/alle")
def liste_events_alle(offset: int = 0, n: int = 20, user: models.User = Depends(current_user),
                      db: Session = Depends(get_db)) -> list[dict]:
    """Event-Uebersicht, seitenweise (Endlos-Scrollen, Jan 01.11.2026): erst laufende (frueheste zuerst), dann
    kommende (naechste zuerst), dann vergangene (zuletzt beendete zuerst)."""
    jetzt = T._jetzt()
    E = models.TeamEvent
    n = max(1, min(n, 50))
    q, eigene = _events_sichtbar(db, user.id)
    gruppe = case((and_(E.start <= jetzt, E.ende > jetzt), 0), (E.start > jetzt, 1), else_=2)
    # Innerhalb der Gruppen: 0/1 nach Start aufsteigend, 2 nach Ende absteigend (Epoch-Sekunden, Vorzeichen).
    sek = case((E.ende <= jetzt, -func.extract("epoch", E.ende)), else_=func.extract("epoch", E.start))
    rows = q.order_by(gruppe, sek, E.id).offset(max(0, offset)).limit(n).all()
    return [_event_kurz(db, e, t, t.id in eigene, jetzt) for e, t in rows]


# ------------------------------------------------------------------------------ Teamseite ----

@router.get("/einladung/{token}")
def einladung_ansehen(token: str, user: models.User = Depends(current_user), db: Session = Depends(get_db),
                      _rl: None = Depends(rate_limit(60, 900, "team-einladung"))) -> dict:
    """Was ein Einladungslink bewirkt — fuer den Beitritts-Dialog (zeigt die INTERNE Fassung: wer den
    Link hat, wurde vom Team eingeladen)."""
    e = T.einladung_finden(db, token)
    if e is None:
        raise _404()
    t = db.get(models.Team, e.team_id)
    if t is None or t.geloescht_am is not None:
        raise _404()
    m = T.mitglied(db, t.id, user.id)
    return {**_kurz(t, True, db), "art": e.art, "oeffentlich": bool(t.oeffentlich),
            "mein_status": m.status if m else None}


@router.post("/einladung/{token}")
def einladung_annehmen(token: str, user: models.User = Depends(current_user), db: Session = Depends(get_db),
                       _rl: None = Depends(rate_limit(30, 900, "team-einladung-an"))) -> dict:
    e = T.einladung_finden(db, token)
    if e is None:
        raise _404()
    t = db.get(models.Team, e.team_id)
    if t is None or t.geloescht_am is not None:
        raise _404()
    return _beitreten(db, t, user, "aktiv" if e.art == "join" else "angefragt", e)


def _beitreten(db: Session, t: models.Team, user: models.User, ziel: str,
               e: models.TeamEinladung | None = None) -> dict:
    m = T.mitglied(db, t.id, user.id)
    if ziel == "aktiv":
        T.events_teilnehmer_sichern(db, t.id)
    if m is not None:
        if m.status == "angefragt" and ziel == "aktiv":
            m.status, m.seit, m.zustimmung_am = "aktiv", T._jetzt(), T._jetzt()
            db.commit()
        return {"status": m.status, "slug": t.slug}
    db.add(models.TeamMitglied(team_id=t.id, user_id=user.id, rolle="mitglied", status=ziel,
                               zustimmung_am=T._jetzt()))
    if e is not None:
        e.genutzt = (e.genutzt or 0) + 1
    db.commit()
    return {"status": ziel, "slug": t.slug}


@router.get("/{slug}")
def ansehen(slug: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    t, m = _team_fuer(db, slug, user)
    return _team_out(db, t, m)


@router.post("/{slug}/beitreten")
def beitreten(slug: str, user: models.User = Depends(current_user), db: Session = Depends(get_db),
              _rl: None = Depends(rate_limit(30, 900, "team-beitreten"))) -> dict:
    """Knopf auf der Teamseite (Jan: nur wenn „Anmeldungen zulassen"; „automatisch akzeptieren" entscheidet)."""
    t, _m = _team_fuer(db, slug, user)
    if not t.anmeldungen_zulassen:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "anmeldungen_aus")
    return _beitreten(db, t, user, "aktiv" if t.automatisch_akzeptieren else "angefragt")


@router.post("/{slug}/austreten")
def austreten(slug: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Austreten bzw. Anfrage zurueckziehen. Der Leiter muss erst uebergeben (oder das Team loeschen)."""
    t, m = _team_fuer(db, slug, user)
    if m is None:
        raise _404()
    if m.rolle == "leiter":
        raise HTTPException(status.HTTP_409_CONFLICT, "leiter_erst_uebergeben")
    T.events_teilnehmer_sichern(db, t.id)
    db.delete(m)
    T.chat_raus(db, t.id, user.id)
    db.commit()
    return {"ok": True}


@router.get("/{slug}/bestenlisten")
def bestenlisten(slug: str, period: str = "30d", user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)) -> dict:
    t, m = _team_fuer(db, slug, user)
    if not (T.aktiv(m) or T.bestenlisten_oeffentlich(t)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nur_mitglieder")
    from .community import PERIODS
    period = period if period in PERIODS else "30d"
    ids = T.mitglieder_ids(db, t.id)
    return {"period": period, "tafeln": [{**T.tafel_out(tf), "zeilen": T.tafel_berechnen(db, t, tf, period, ids)}
                                         for tf in T.tafeln(db, t.id)]}


def _darf_tafeln(t: models.Team, m: models.TeamMitglied | None) -> None:
    if not (T.aktiv(m) or T.bestenlisten_oeffentlich(t)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nur_mitglieder")


@router.get("/{slug}/statistik")
def statistik(slug: str, period: str = "30d", user: models.User = Depends(current_user),
              db: Session = Depends(get_db)) -> dict:
    """Teamsummen im Zeitraum — wer die Bestenlisten sehen darf, sieht auch die Summen."""
    from .community import PERIODS
    t, m = _team_fuer(db, slug, user)
    _darf_tafeln(t, m)
    return T.statistik(db, t, period if period in PERIODS else "30d")


@router.get("/{slug}/logbuch")
def logbuch(slug: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Wer wann welchen Teamrekord gebrochen hat (naechtlich nachgefuehrt)."""
    t, m = _team_fuer(db, slug, user)
    _darf_tafeln(t, m)
    return T.logbuch(db, t.id)


# --------------------------------------------------------------------------------- Events ----

class EventTafelIn(BaseModel):
    kennzahl: str
    sportart: str = "pumpfoil"
    accel_only: bool = False   # Standard: auch Laeufe ohne Bewegungsdaten (Jan, 31.10.2026)
    nur_brett: bool = False
    foil_band: str = Field(default="all", max_length=30)


class EventIn(BaseModel):
    titel: str = Field(min_length=2, max_length=80)
    beschreibung: str | None = Field(default=None, max_length=1000)
    start: datetime
    ende: datetime
    zeitzone: str | None = Field(default=None, max_length=64)
    # Auch ganz ohne Bestenliste, wenn Gesamtsummen gewaehlt sind (Jan, 01.11.2026) — s. _event_pruefen.
    tafeln: list[EventTafelIn] = Field(default_factory=list, max_length=T.EVENT_MAX_TAFELN)
    spot_ids: list[int] = Field(default_factory=list, max_length=T.MAX_TEAMSPOTS)
    vorlage: str | None = Field(default=None, max_length=40)
    ohne_dateien: bool = False
    teambild_zeigen: bool = True
    summen: list[str] = Field(default_factory=list, max_length=len(T.EVENT_SUMMEN))
    # Nur fuer Events ohne Bestenliste: Sportart und Bewegungsdaten der Gesamtsummen (sonst aus den Bestenlisten).
    summen_sportart: str = "pumpfoil"
    summen_accel_only: bool = False
    # Globales Event (06.11.2026): nur im offiziellen Team; Team-Rangliste aus den besten N (0 = alle, None = Standard 5).
    global_event: bool = False
    team_wertung_n: int | None = Field(default=None, ge=0, le=50)


def _event_summen(body: EventIn) -> str | None:
    if any(k not in T.EVENT_SUMMEN for k in body.summen):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "summe")
    # In der festen Reihenfolge speichern, dann steht es auf der Seite immer gleich.
    return json.dumps([k for k in T.EVENT_SUMMEN if k in body.summen]) if body.summen else None


def _event_pruefen(db: Session, body: EventIn) -> tuple[str, str | None]:
    if body.start.tzinfo is None or body.ende.tzinfo is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "event_zeitzone")
    if body.ende <= body.start or body.ende - body.start > T.EVENT_MAX_DAUER:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "event_zeitraum")
    sporte = _sportarten()
    if not body.tafeln and not body.summen:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "event_leer")
    if body.summen_sportart not in sporte:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "tafel")
    for x in body.tafeln:
        if x.kennzahl not in T.KENNZAHLEN or x.sportart not in sporte:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "tafel")
    ids = list(dict.fromkeys(body.spot_ids))
    if ids:
        gueltig = {i for (i,) in db.query(models.Spot.id).filter(models.Spot.id.in_(ids)).all()}
        ids = [i for i in ids if i in gueltig]
    return json.dumps([x.model_dump() for x in body.tafeln]), (json.dumps(ids) if ids else None)


def _global_pruefen(db: Session, t: models.Team, body: EventIn) -> None:
    if body.global_event and t.id != T.offizielles_team_id(db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nur_offiziell")


def _nur_team(db: Session, slug: str | None, user: models.User) -> list[int] | None:
    """Filter „mein Team" an globalen Events: die Mitglieder dieses Teams — nur, wenn der Betrachter das Team sehen
    darf wie seine Bestenlisten (Mitglied oder oeffentlich)."""
    if not slug:
        return None
    t, m = _team_fuer(db, slug, user)
    _darf_tafeln(t, m)
    return T.mitglieder_ids(db, t.id)


def _event(db: Session, t: models.Team, event_id: int) -> models.TeamEvent:
    e = db.get(models.TeamEvent, event_id)
    if e is None or e.team_id != t.id or e.geloescht_am is not None:
        raise _404()
    return e


@router.get("/{slug}/events")
def events(slug: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    t, m = _team_fuer(db, slug, user)
    _darf_tafeln(t, m)
    liste = T.events_liste(db, t.id, beendete=20)
    if any(T.event_einfrieren(db, e) for e in liste):
        db.commit()
    return [T.event_out(db, t, e) for e in liste]


@router.post("/{slug}/events")
def event_anlegen(slug: str, body: EventIn, user: models.User = Depends(current_user),
                  db: Session = Depends(get_db)) -> dict:
    t, _m = _verwalter(db, slug, user)   # Events auch fuer Moderatoren (Jan, 01.11.2026)
    offen = int(db.query(func.count(models.TeamEvent.id))
                .filter(models.TeamEvent.team_id == t.id, models.TeamEvent.eingefroren_am.is_(None),
                        models.TeamEvent.geloescht_am.is_(None)).scalar() or 0)
    if offen >= T.EVENT_MAX_OFFEN:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "zu_viele_events")
    tafeln_json, spots_json = _event_pruefen(db, body)
    _global_pruefen(db, t, body)
    e = models.TeamEvent(team_id=t.id, global_event=body.global_event, team_wertung_n=body.team_wertung_n, titel=body.titel.strip(), beschreibung=(body.beschreibung or "").strip() or None,
                         start=body.start, ende=body.ende, zeitzone=body.zeitzone, tafeln_json=tafeln_json,
                         spots_json=spots_json, vorlage=body.vorlage, ohne_dateien=body.ohne_dateien,
                         teambild_zeigen=body.teambild_zeigen, summen_json=_event_summen(body),
                         summen_sportart=body.summen_sportart, summen_accel_only=body.summen_accel_only)
    db.add(e)
    db.commit()
    return T.event_out(db, t, e)


@router.get("/{slug}/events/{event_id}")
def event_einzeln(slug: str, event_id: int, team: str | None = None, user: models.User = Depends(current_user),
                  db: Session = Depends(get_db)) -> dict:
    """Ein Event direkt (Event-Seite), unabhaengig davon, wie weit es in der Liste zurueckliegt. Globale Events sieht
    jeder; `team` = nur die Zeilen der Mitglieder dieses Teams (Filter „mein Team")."""
    t, m = _team_fuer(db, slug, user)
    e = _event(db, t, event_id)
    if not T.ist_global(e):
        _darf_tafeln(t, m)
    if T.event_einfrieren(db, e):
        db.commit()
    return T.event_out(db, t, e, nur_team_ids=_nur_team(db, team, user) if T.ist_global(e) else None,
                       betrachter=user.id)


class FokusIn(BaseModel):
    fokus: str = Field(pattern=r"^\d{1,3},\d{1,3}$")


@router.post("/{slug}/events/{event_id}/banner")
async def event_banner(slug: str, event_id: int, file: UploadFile = File(...), user: models.User = Depends(current_user),
                       db: Session = Depends(get_db)) -> dict:
    """Eventbild, gleiche Regeln wie das Teambild (01.11.2026). Leitung und Moderatoren."""
    from ..media import MAX_UPLOAD_BYTES, ImageError, delete_media, save_image
    t, _m = _verwalter(db, slug, user)
    e = _event(db, t, event_id)
    _nicht_eingefroren(e)
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        url = save_image(raw, subdir="teams", max_dim=1600, min_breite=800, min_verhaeltnis=1.5)
    except ImageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    alt, e.banner_url, e.banner_fokus = e.banner_url, url, "50,50"
    db.commit()
    if alt:
        delete_media(alt)
    return {"banner_url": url, "banner_fokus": e.banner_fokus}


@router.put("/{slug}/events/{event_id}/banner")
def event_banner_fokus(slug: str, event_id: int, body: FokusIn, user: models.User = Depends(current_user),
                       db: Session = Depends(get_db)) -> dict:
    t, _m = _verwalter(db, slug, user)
    e = _event(db, t, event_id)
    _nicht_eingefroren(e)
    x, y = (min(100, int(v)) for v in body.fokus.split(","))
    e.banner_fokus = f"{x},{y}"
    db.commit()
    return {"banner_fokus": e.banner_fokus}


@router.delete("/{slug}/events/{event_id}/banner")
def event_banner_entfernen(slug: str, event_id: int, user: models.User = Depends(current_user),
                           db: Session = Depends(get_db)) -> dict:
    from ..media import delete_media
    t, _m = _verwalter(db, slug, user)
    e = _event(db, t, event_id)
    _nicht_eingefroren(e)
    alt, e.banner_url = e.banner_url, None
    db.commit()
    if alt:
        delete_media(alt)
    return {"banner_url": None}


def _nicht_eingefroren(e: models.TeamEvent) -> None:
    """Eingefrorene Events stehen fest, auch das Eventbild (Jan, 08.11.2026: „der snapshot muss alles snapshotten")."""
    if e.eingefroren_am is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "event_eingefroren")


@router.put("/{slug}/events/{event_id}")
def event_aendern(slug: str, event_id: int, body: EventIn, user: models.User = Depends(current_user),
                  db: Session = Depends(get_db)) -> dict:
    """Aenderbar bis zum Einfrieren — danach steht das Ergebnis."""
    t, _m = _verwalter(db, slug, user)   # Events auch fuer Moderatoren (Jan, 01.11.2026)
    e = _event(db, t, event_id)
    if e.eingefroren_am is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "event_eingefroren")
    e.tafeln_json, e.spots_json = _event_pruefen(db, body)
    _global_pruefen(db, t, body)
    e.global_event, e.team_wertung_n = body.global_event, body.team_wertung_n
    e.titel, e.beschreibung = body.titel.strip(), (body.beschreibung or "").strip() or None
    e.start, e.ende, e.zeitzone, e.vorlage = body.start, body.ende, body.zeitzone, body.vorlage
    e.ohne_dateien, e.teambild_zeigen = body.ohne_dateien, body.teambild_zeigen
    e.summen_json = _event_summen(body)
    e.summen_sportart, e.summen_accel_only = body.summen_sportart, body.summen_accel_only
    # Wieder laufend (Ende in die Zukunft verlegt): die beim frueheren Ende festgehaltenen Teilnehmer gelten nicht mehr,
    # es zaehlen wieder die aktuellen Mitglieder. Sonst fehlte jeder, der nach dem ALTEN Ende beigetreten ist (Jan,
    # 02.11.2026: Foil Scoot im Event leer, in der Team-Ansicht nicht — das Ende war verlaengert worden).
    if T._aware(e.ende) > T._jetzt():
        e.teilnehmer_json = None
    db.commit()
    return T.event_out(db, t, e)


@router.delete("/{slug}/events/{event_id}")
def event_loeschen(slug: str, event_id: int, user: models.User = Depends(current_user),
                   db: Session = Depends(get_db)) -> dict:
    """Weich loeschen: ausgeblendet, aber noch in der DB (spaeter Papierkorb). Abzeichen daraus verschwinden."""
    t, _m = _verwalter(db, slug, user)   # Events auch fuer Moderatoren (Jan, 01.11.2026)
    e = _event(db, t, event_id)
    e.geloescht_am, e.geloescht_von = T._jetzt(), user.id
    db.commit()
    return {"ok": True}


@router.get("/{slug}/mitglieder")
def mitglieder(slug: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    t, m = _team_fuer(db, slug, user)
    darf = T.aktiv(m) or (T.oeffentlich_sichtbar(t) and t.mitglieder_sichtbar == "angemeldete")
    if not darf:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nur_mitglieder")
    M, U = models.TeamMitglied, models.User
    rang = {"leiter": 0, "moderator": 1, "mitglied": 2}
    aktive, anfragen = [], []
    for mm, u in (db.query(M, U).join(U, U.id == M.user_id)
                  .filter(M.team_id == t.id, U.blocked.isnot(True)).order_by(M.seit.asc()).all()):
        z = {"user_id": u.id, "name": u.display_name or f"User #{u.id}", "avatar_url": u.avatar_url,
             "rolle": mm.rolle, "seit": mm.seit.isoformat() if mm.seit else None}
        if mm.status == "aktiv":
            aktive.append(z)
        elif T.darf_verwalten(m):
            anfragen.append({**z, "profil": T.anfrage_profil(db, u.id)})
    aktive.sort(key=lambda z: rang.get(z["rolle"], 9))
    return {"mitglieder": aktive, "anfragen": anfragen}


@router.post("/{slug}/mitglieder/{uid}/annehmen")
def annehmen(slug: str, uid: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    t, _m = _verwalter(db, slug, user)
    z = T.mitglied(db, t.id, uid)
    if z is None:
        raise _404()
    if z.status == "angefragt":
        T.events_teilnehmer_sichern(db, t.id)
        z.status, z.seit = "aktiv", T._jetzt()
        db.commit()
    return {"ok": True}


@router.delete("/{slug}/mitglieder/{uid}")
def entfernen(slug: str, uid: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Anfrage ablehnen oder Mitglied entfernen. Moderatoren duerfen nur einfache Mitglieder/Anfragen."""
    t, m = _verwalter(db, slug, user)
    z = T.mitglied(db, t.id, uid)
    if z is None:
        raise _404()
    if z.rolle == "leiter" or (z.rolle == "moderator" and m.rolle != "leiter"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nicht_erlaubt")
    T.events_teilnehmer_sichern(db, t.id)
    db.delete(z)
    T.chat_raus(db, t.id, uid)
    db.commit()
    return {"ok": True}


class RolleIn(BaseModel):
    rolle: str


@router.put("/{slug}/mitglieder/{uid}/rolle")
def rolle_setzen(slug: str, uid: int, body: RolleIn, user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)) -> dict:
    """Leiter: Moderator ernennen/zuruecknehmen, oder die Leitung uebergeben (`rolle = "leiter"`)."""
    t = _leiter(db, slug, user)
    z = T.mitglied(db, t.id, uid)
    if not T.aktiv(z) or uid == user.id or body.rolle not in T.ROLLEN:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "rolle")
    if body.rolle == "leiter":
        T.mitglied(db, t.id, user.id).rolle = "moderator"
    z.rolle = body.rolle
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- Einstellungen ----

class EinstellungenIn(BaseModel):
    name: str | None = Field(default=None, max_length=T.NAME_MAX)
    slug: str | None = Field(default=None, max_length=T.SLUG_MAX)
    beschreibung: str | None = Field(default=None, max_length=T.BESCHREIBUNG_MAX)
    farbe: str | None = None
    anmeldungen_zulassen: bool | None = None
    automatisch_akzeptieren: bool | None = None
    oeffentlich: bool | None = None
    mitglieder_sichtbar: str | None = None
    banner_fokus: str | None = Field(default=None, pattern=r"^\d{1,3},\d{1,3}$")
    land: str | None = Field(default=None, max_length=10)     # "" = keine Angabe


@router.put("/{slug}")
def einstellen(slug: str, body: EinstellungenIn, user: models.User = Depends(current_user),
               db: Session = Depends(get_db)) -> dict:
    t = _leiter(db, slug, user)
    T.events_zuordnung_sichern(db)   # Sichtbarkeit/Land aendern die Team-Wertung globaler Events
    if body.name is not None:
        t.name = _name_pruefen(db, body.name, t.id)
    if body.slug is not None and body.slug != t.slug:
        neu = _slug_pruefen(db, body.slug, t.id, admin=bool(user.is_admin))
        # Die alte Adresse bleibt gesperrt und leitet weiter — ausser sie ist die freigegebene, die
        # gilt aussen ohnehin weiter (`finde`) und wird erst bei der naechsten Freigabe gemerkt.
        if t.slug != t.frei_slug:
            T.slug_merken(db, t.slug, t.id)
        t.slug = neu
    if body.beschreibung is not None:
        t.beschreibung = body.beschreibung.strip() or None
    if body.farbe is not None:
        if body.farbe not in T.FARBEN:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "farbe")
        t.farbe = body.farbe
    for f in ("anmeldungen_zulassen", "automatisch_akzeptieren", "oeffentlich"):
        v = getattr(body, f)
        if v is not None:
            setattr(t, f, v)
    if body.banner_fokus is not None:
        x, y = (min(100, int(v)) for v in body.banner_fokus.split(","))
        t.banner_fokus = f"{x},{y}"
    if body.land is not None:
        try:
            t.land = T.land_pruefen(body.land)
        except ValueError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "land") from None
    if body.mitglieder_sichtbar is not None:
        if body.mitglieder_sichtbar not in ("mitglieder", "angemeldete"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "mitglieder_sichtbar")
        t.mitglieder_sichtbar = body.mitglieder_sichtbar
    T.nach_aenderung(t)
    db.commit()
    return _team_out(db, t, T.mitglied(db, t.id, user.id))


@router.post("/{slug}/logo")
async def logo(slug: str, file: UploadFile = File(...), user: models.User = Depends(current_user),
               db: Session = Depends(get_db)) -> dict:
    from ..media import MAX_UPLOAD_BYTES, ImageError, delete_media, save_image
    t = _leiter(db, slug, user)
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        url = save_image(raw, subdir="teams", max_dim=512, square=True, transparenz=True)
    except ImageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    alt = t.logo_url
    t.logo_url = url
    T.nach_aenderung(t)
    db.commit()
    if alt and alt != t.frei_logo_url:
        delete_media(alt)       # das freigegebene Logo bleibt, bis eine neue Fassung freigegeben ist
    return {"logo_url": url}


@router.post("/{slug}/banner")
async def banner(slug: str, file: UploadFile = File(...), user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)) -> dict:
    """Teambild ueber dem Kopf (01.11.2026): nie zugeschnitten, hoechstens 1600 px breit; mindestens 800 px breit und
    1,5-mal so breit wie hoch. Welcher Ausschnitt sichtbar bleibt, sagt `banner_fokus` (Einstellungen)."""
    from ..media import MAX_UPLOAD_BYTES, ImageError, delete_media, save_image
    t = _leiter(db, slug, user)
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        url = save_image(raw, subdir="teams", max_dim=1600, min_breite=800, min_verhaeltnis=1.5)
    except ImageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    alt = t.banner_url
    t.banner_url, t.banner_fokus = url, "50,50"
    T.nach_aenderung(t)
    db.commit()
    if alt and alt != t.frei_banner_url:
        delete_media(alt)       # das freigegebene Bild bleibt, bis eine neue Fassung freigegeben ist
    return {"banner_url": url, "banner_fokus": t.banner_fokus}


@router.delete("/{slug}/banner")
def banner_entfernen(slug: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Teambild weg — innen UND aussen sofort: Entfernen braucht keine Freigabe, und wer ein Bild zurueckzieht,
    soll nicht warten muessen, bis es auch oeffentlich verschwindet."""
    from ..media import delete_media
    t = _leiter(db, slug, user)
    weg = [u for u in {t.banner_url, t.frei_banner_url} if u]
    t.banner_url = t.frei_banner_url = None
    T.nach_aenderung(t)
    db.commit()
    for u in weg:
        delete_media(u)
    return {"banner_url": None}


@router.post("/{slug}/freigabe")
def freigabe_beantragen(slug: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    t = _leiter(db, slug, user)
    if t.freigabe != "frei" or T.auftritt_geaendert(t):
        wartend = int(db.query(func.count(models.Team.id))
                      .join(models.TeamMitglied, models.TeamMitglied.team_id == models.Team.id)
                      .filter(models.TeamMitglied.user_id == user.id, models.TeamMitglied.rolle == "leiter",
                              models.Team.freigabe == "wartet", models.Team.id != t.id,
                              models.Team.geloescht_am.is_(None)).scalar() or 0)
        if wartend >= T.MAX_WARTEND_JE_PERSON:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "zu_viele_wartend")
        t.freigabe, t.freigabe_notiz = "wartet", None
        db.commit()
    return {"freigabe": t.freigabe}


class TafelIn(BaseModel):
    kennzahl: str
    sportart: str = "pumpfoil"
    accel_only: bool = False
    nur_brett: bool = False
    foil_band: str = Field(default="all", max_length=30)
    nur_teamspots: bool = False


@router.put("/{slug}/tafeln")
def tafeln_setzen(slug: str, body: list[TafelIn], user: models.User = Depends(current_user),
                  db: Session = Depends(get_db)) -> dict:
    t = _leiter(db, slug, user)
    if len(body) > T.MAX_TAFELN:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "zu_viele_tafeln")
    sporte = _sportarten()
    for x in body:
        if x.kennzahl not in T.KENNZAHLEN or x.sportart not in sporte:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "tafel")
    db.query(models.TeamTafel).filter_by(team_id=t.id).delete()
    for i, x in enumerate(body):
        db.add(models.TeamTafel(team_id=t.id, reihenfolge=i, **x.model_dump()))
    db.commit()
    return {"tafeln": [T.tafel_out(tf) for tf in T.tafeln(db, t.id)]}


@router.put("/{slug}/spots")
def spots_setzen(slug: str, body: list[int], user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)) -> dict:
    t = _leiter(db, slug, user)
    ids = list(dict.fromkeys(body))[:T.MAX_TEAMSPOTS]
    gueltig = {i for (i,) in db.query(models.Spot.id).filter(models.Spot.id.in_(ids),
                                                             models.Spot.merged_into.is_(None)).all()} if ids else set()
    db.query(models.TeamSpot).filter_by(team_id=t.id).delete()
    for i in ids:
        if i in gueltig:
            db.add(models.TeamSpot(team_id=t.id, spot_id=i))
    db.commit()
    return {"spots": [i for i in ids if i in gueltig]}


@router.get("/{slug}/einladungen")
def einladungen(slug: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Beide Links (Leiter und Moderatoren — sie duerfen ohnehin Mitglieder aufnehmen)."""
    t, _m = _verwalter(db, slug, user)
    out = {a: T.einladung(db, t.id, a).token for a in T.EINLADUNGS_ARTEN}
    db.commit()
    return out


@router.post("/{slug}/einladungen/{art}/neu")
def einladung_neu(slug: str, art: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    t = _leiter(db, slug, user)
    if art not in T.EINLADUNGS_ARTEN:
        raise _404()
    token = T.einladung(db, t.id, art, neu=True).token
    db.commit()
    return {art: token}


class LoeschenIn(BaseModel):
    name: str


@router.post("/{slug}/loeschen")
def loeschen(slug: str, body: LoeschenIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Nur der Leiter, und nur mit dem eingetippten Teamnamen (Jan: „sicher, nicht aus Versehen"). Seit 01.11.2026
    nur weich (`T.team_weich_loeschen`): ueberall weg, aber noch in der DB fuer einen spaeteren Papierkorb."""
    t = _leiter(db, slug, user)
    if " ".join(body.name.split()).lower() != t.name.lower():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "name_falsch")
    T.events_zuordnung_sichern(db)
    T.team_weich_loeschen(t, user.id)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------------------- Oeffentlich ----

@public_router.get("/{slug}")
def oeffentlich(slug: str, response: Response, period: str = "30d", db: Session = Depends(get_db),
                _rl: None = Depends(rate_limit(120, 900, "team-oeffentlich"))) -> dict:
    """Ohne Login: nur oeffentliche, freigegebene Teams; Bestenlisten in Gast-Form. Nicht fuer Suchmaschinen."""
    from .community import PERIODS
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    t, _um = T.finde(db, slug)
    if t is None or not T.bestenlisten_oeffentlich(t):
        raise _404()
    period = period if period in PERIODS else "30d"
    ids = T.mitglieder_ids(db, t.id)
    return {**_kurz(t, False, db), "mitglieder_anzahl": len(ids), "period": period,
            "tafeln": [{**T.tafel_out(tf), "zeilen": T.fuer_gast(T.tafel_berechnen(db, t, tf, period, ids))}
                       for tf in T.tafeln(db, t.id)],
            # Events sind Bestenlisten mit Zeitfenster -> in derselben Gastform (ohne Spots).
            "events": [T.event_out(db, t, e, gast=True) for e in T.events_liste(db, t.id, beendete=10)]}


@public_router.get("/{slug}/events/{event_id}")
def oeffentliches_event(slug: str, event_id: int, response: Response, db: Session = Depends(get_db),
                        _rl: None = Depends(rate_limit(120, 900, "team-oeffentlich"))) -> dict:
    """Ein Event ohne Login (Teilen-Link, 01.11.2026): nur bei oeffentlichem, freigegebenem Team, in Gastform."""
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    t, _um = T.finde(db, slug)
    if t is None or t.geloescht_am is not None:
        raise _404()
    e = _event(db, t, event_id)
    # Globale Events auch aus einem nicht oeffentlichen offiziellen Team (06.11.2026); sonst wie bisher.
    if not (T.bestenlisten_oeffentlich(t) or (T.ist_global(e) and T.oeffentlich_sichtbar(t))):
        raise _404()
    if T.event_einfrieren(db, e):
        db.commit()
    # anmeldungen_zulassen: fuer den Knopf „Anmelden und beitreten" auf der Event-Seite (01.11.2026).
    return {"team": {**_kurz(t, False, db), "bestenlisten_oeffentlich": True,
                     "anmeldungen_zulassen": bool(t.anmeldungen_zulassen)},
            "event": T.event_out(db, t, e, gast=True)}


# ---------------------------------------------------------------------------------- Admin ----

@admin_router.get("")
def admin_liste(_a: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> list[dict]:
    """Warteschlange: wartende Teams mit alter (freigegebener) und neuer Fassung."""
    out = []
    for t in (db.query(models.Team).filter(models.Team.freigabe == "wartet", models.Team.geloescht_am.is_(None))
              .order_by(models.Team.id).all()):
        leiter = (db.query(models.User).join(models.TeamMitglied, models.TeamMitglied.user_id == models.User.id)
                  .filter(models.TeamMitglied.team_id == t.id, models.TeamMitglied.rolle == "leiter").first())
        out.append({"id": t.id, "neu": T.auftritt(t, True), "alt": T.auftritt(t, False) if t.frei_am else None,
                    "oeffentlich": bool(t.oeffentlich),
                    "leiter": {"user_id": leiter.id, "name": leiter.display_name} if leiter else None})
    return out


class FreigabeIn(BaseModel):
    ok: bool
    notiz: str | None = Field(default=None, max_length=1000)


@admin_router.post("/{team_id}")
def admin_entscheiden(team_id: int, body: FreigabeIn, _a: models.User = Depends(current_admin),
                      db: Session = Depends(get_db)) -> dict:
    from ..media import delete_media
    t = db.get(models.Team, team_id)
    if t is None or t.geloescht_am is not None:
        raise _404()
    weg: list[str] = []
    T.events_zuordnung_sichern(db)   # Freigabe aendert Auftritt und Team-Wertung globaler Events
    if body.ok:
        weg = T.freigeben(db, t)
    else:
        t.freigabe, t.freigabe_notiz = "abgelehnt", (body.notiz or "").strip() or None
    db.commit()
    for u in weg:
        delete_media(u)
    return {"freigabe": t.freigabe}
