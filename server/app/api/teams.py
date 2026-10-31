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

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func
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


def _kurz(t: models.Team, intern: bool) -> dict:
    return {"id": t.id, **T.auftritt(t, intern)}


def _team_out(db: Session, t: models.Team, m: models.TeamMitglied | None) -> dict:
    intern = T.aktiv(m) or (m is not None and m.status == "angefragt")
    mitglied_aktiv = T.aktiv(m)
    anzahl = int(db.query(func.count(models.TeamMitglied.id))
                 .filter_by(team_id=t.id, status="aktiv").scalar() or 0)
    out = {
        **_kurz(t, intern),
        "mitglieder_anzahl": anzahl,
        "oeffentlich": bool(t.oeffentlich),
        "bestenlisten_oeffentlich": T.bestenlisten_oeffentlich(t),
        "anmeldungen_zulassen": bool(t.anmeldungen_zulassen),
        "automatisch_akzeptieren": bool(t.automatisch_akzeptieren),
        "mitglieder_sichtbar": t.mitglieder_sichtbar,
        "meine_rolle": m.rolle if mitglied_aktiv else None,
        "mein_status": m.status if m is not None else None,
        "darf_bestenlisten": mitglied_aktiv or T.bestenlisten_oeffentlich(t),
        "darf_mitglieder": mitglied_aktiv or (T.oeffentlich_sichtbar(t) and t.mitglieder_sichtbar == "angemeldete"),
        # Team-Chat nur fuer aktive Mitglieder (Zugriff prueft chat._require_access).
        "chat_scope": T.chat_scope(t.id) if mitglied_aktiv else None,
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
              .filter(func.lower(models.Team.name) == name.lower(), models.Team.id != (team_id or 0)).first())
    if belegt is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "name_belegt")
    return name


def _slug_pruefen(db: Session, slug: str, team_id: int | None = None) -> str:
    slug = (slug or "").strip().lower()
    fehler = T.slug_fehler(slug)
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
                   .filter_by(user_id=user.id, rolle="leiter").scalar() or 0)
    if geleitet >= T.MAX_TEAMS_JE_PERSON:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "zu_viele_teams")
    name = _name_pruefen(db, body.name)
    slug = _slug_pruefen(db, body.slug) if body.slug else T.freier_slug(db, name)
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
    for m, t in (db.query(M, models.Team).join(models.Team, models.Team.id == M.team_id)
                 .filter(M.user_id == user.id).order_by(M.seit.asc()).all()):
        offen = 0
        if T.darf_verwalten(m):
            offen = int(db.query(func.count(M.id)).filter_by(team_id=t.id, status="angefragt").scalar() or 0)
        out.append({**_kurz(t, True), "rolle": m.rolle, "status": m.status, "anfragen": offen,
                    "freigabe": t.freigabe if T.ist_leiter(m) else None})
    return out


@router.get("/liste")
def liste(_u: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Community-Abschnitt: nur freigegebene Teams, in ihrer freigegebenen Fassung."""
    M = models.TeamMitglied
    zahl = dict(db.query(M.team_id, func.count(M.id)).filter(M.status == "aktiv").group_by(M.team_id).all())
    teams = db.query(models.Team).filter(models.Team.frei_am.isnot(None)).all()
    out = [{**_kurz(t, False), "mitglieder_anzahl": int(zahl.get(t.id, 0)),
            "anmeldungen_zulassen": bool(t.anmeldungen_zulassen),
            "bestenlisten_oeffentlich": T.bestenlisten_oeffentlich(t)} for t in teams]
    out.sort(key=lambda x: (-x["mitglieder_anzahl"], (x["name"] or "").lower()))
    return out


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
    m = T.mitglied(db, t.id, user.id)
    return {**_kurz(t, True), "art": e.art, "oeffentlich": bool(t.oeffentlich),
            "mein_status": m.status if m else None}


@router.post("/einladung/{token}")
def einladung_annehmen(token: str, user: models.User = Depends(current_user), db: Session = Depends(get_db),
                       _rl: None = Depends(rate_limit(30, 900, "team-einladung-an"))) -> dict:
    e = T.einladung_finden(db, token)
    if e is None:
        raise _404()
    t = db.get(models.Team, e.team_id)
    return _beitreten(db, t, user, "aktiv" if e.art == "join" else "angefragt", e)


def _beitreten(db: Session, t: models.Team, user: models.User, ziel: str,
               e: models.TeamEinladung | None = None) -> dict:
    m = T.mitglied(db, t.id, user.id)
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
            anfragen.append(z)
    aktive.sort(key=lambda z: rang.get(z["rolle"], 9))
    return {"mitglieder": aktive, "anfragen": anfragen}


@router.post("/{slug}/mitglieder/{uid}/annehmen")
def annehmen(slug: str, uid: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    t, _m = _verwalter(db, slug, user)
    z = T.mitglied(db, t.id, uid)
    if z is None:
        raise _404()
    if z.status == "angefragt":
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


@router.put("/{slug}")
def einstellen(slug: str, body: EinstellungenIn, user: models.User = Depends(current_user),
               db: Session = Depends(get_db)) -> dict:
    t = _leiter(db, slug, user)
    if body.name is not None:
        t.name = _name_pruefen(db, body.name, t.id)
    if body.slug is not None and body.slug != t.slug:
        neu = _slug_pruefen(db, body.slug, t.id)
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


@router.post("/{slug}/freigabe")
def freigabe_beantragen(slug: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    t = _leiter(db, slug, user)
    if t.freigabe != "frei" or T.auftritt_geaendert(t):
        wartend = int(db.query(func.count(models.Team.id))
                      .join(models.TeamMitglied, models.TeamMitglied.team_id == models.Team.id)
                      .filter(models.TeamMitglied.user_id == user.id, models.TeamMitglied.rolle == "leiter",
                              models.Team.freigabe == "wartet", models.Team.id != t.id).scalar() or 0)
        if wartend >= T.MAX_WARTEND_JE_PERSON:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "zu_viele_wartend")
        t.freigabe, t.freigabe_notiz = "wartet", None
        db.commit()
    return {"freigabe": t.freigabe}


class TafelIn(BaseModel):
    kennzahl: str
    sportart: str = "pumpfoil"
    accel_only: bool = True
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
    """Nur der Leiter, und nur mit dem eingetippten Teamnamen (Jan: „sicher, nicht aus Versehen")."""
    from ..media import delete_media
    t = _leiter(db, slug, user)
    if " ".join(body.name.split()).lower() != t.name.lower():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "name_falsch")
    medien = T.team_loeschen(db, t)
    db.commit()
    for u in medien:
        delete_media(u)
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
    return {**_kurz(t, False), "mitglieder_anzahl": len(ids), "period": period,
            "tafeln": [{**T.tafel_out(tf), "zeilen": T.fuer_gast(T.tafel_berechnen(db, t, tf, period, ids))}
                       for tf in T.tafeln(db, t.id)]}


# ---------------------------------------------------------------------------------- Admin ----

@admin_router.get("")
def admin_liste(_a: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> list[dict]:
    """Warteschlange: wartende Teams mit alter (freigegebener) und neuer Fassung."""
    out = []
    for t in db.query(models.Team).filter(models.Team.freigabe == "wartet").order_by(models.Team.id).all():
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
    if t is None:
        raise _404()
    weg: list[str] = []
    if body.ok:
        weg = T.freigeben(db, t)
    else:
        t.freigabe, t.freigabe_notiz = "abgelehnt", (body.notiz or "").strip() or None
    db.commit()
    for u in weg:
        delete_media(u)
    return {"freigabe": t.freigabe}
