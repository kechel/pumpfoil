"""Teams mit eigenen Bestenlisten (31.10.2026). Plan und Jans Entscheidungen: docs/TEAMS.md.

DREI SICHTBARKEITEN, und nur diese:
  * MITGLIEDER sehen alles, was das Team intern eingestellt hat (auch vor jeder Freigabe).
  * ANGEMELDETE ohne Mitgliedschaft sehen die FREIGEGEBENE Fassung (`frei_*`) — im Community-
    Abschnitt, auf der Teamseite, und die Bestenlisten nur, wenn das Team sie oeffentlich gestellt hat.
    Die Mitgliederliste nur bei `mitglieder_sichtbar == "angemeldete"`.
  * GAESTE (ohne Login) sehen nur die Bestenlisten eines oeffentlichen, freigegebenen Teams, und dort
    nur Rang, Anzeigename, Initialen und Wert — kein Spot, kein Datum, keine Session, kein Avatar.

Die Freigabe (Admin) betrifft NUR den Auftritt nach aussen. Aendert ein freigegebenes Team Name, Adresse,
Beschreibung, Logo oder Farbe, gilt das intern sofort; aussen bleibt die alte Fassung stehen, bis ein
Admin die neue freigibt (`freigabe = "wartet"`).

BESTENLISTEN rechnen mit denselben Filtern wie die Community-Rekorde (`community._community`): was dort
nicht zaehlt (geloescht, gemeldet, unklassifiziert, laufende Aufnahme, Datenmuell, gesperrte Konten),
zaehlt hier auch nicht. Je Person nur der beste Eintrag (Jan). Alle Sessions der Mitglieder zaehlen,
auch von vor dem Beitritt. „Ort verbergen" gilt wie ueberall: Spot nur ueber `community._ort`, und eine
verborgene Aufnahme zaehlt nie fuer einen Teamspot.
"""
from __future__ import annotations

import hashlib
import re
import secrets
import time
import unicodedata
from datetime import datetime, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import models

ROLLEN = ("leiter", "moderator", "mitglied")
EINLADUNGS_ARTEN = ("join", "apply")
# Teamfarben: Schluessel einer vorgegebenen Palette (Werte je Hell/Dunkel im Web, `web/src/lib/teamFarben.ts`).
FARBEN = ("cyan", "blau", "indigo", "violett", "pink", "rot", "orange", "amber", "gelb", "limette", "gruen", "petrol")
SLUG_MIN, SLUG_MAX = 3, 40
NAME_MIN, NAME_MAX = 3, 60
BESCHREIBUNG_MAX = 1000
MAX_WARTEND_JE_PERSON = 3        # Teams im Status „wartet", die jemand leitet
MAX_TEAMS_JE_PERSON = 10         # Teams, die jemand leitet
MAX_TAFELN = 20
MAX_TEAMSPOTS = 20
TAFEL_LAENGE = 50                # so viele Plaetze je Bestenliste
RESERVIERT = {"neu", "new", "admin", "join", "apply", "einladung", "teams", "team", "api", "mine",
              "liste", "list", "settings", "einstellungen", "pumpfoil", "official", "offiziell"}

# Kennzahlen. „best_*": je Person die beste Session (Spalten wie die Rekorde). „sum_*": je Person die Summe.
BEST = ("distance", "duration", "speed", "glide", "runs", "session_distance", "session_time", "session_pumps")
SUMME = ("sum_sessions", "sum_runs", "sum_pumps", "sum_distance", "sum_time", "sum_spots")
KENNZAHLEN = BEST + SUMME


def _jetzt() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------------------- Adresse ----

_UMSCHRIFT = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "æ": "ae", "ø": "oe", "å": "aa",
                            "Ä": "ae", "Ö": "oe", "Ü": "ue", "Æ": "ae", "Ø": "oe", "Å": "aa", "ł": "l", "Ł": "l"})


def slug_aus(text: str) -> str:
    """Teamname -> Adress-Vorschlag: a-z, 0-9, Bindestrich (Jan: „ohne sonderzeichen")."""
    t = (text or "").translate(_UMSCHRIFT)
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return re.sub(r"-{2,}", "-", t)[:SLUG_MAX].strip("-")


def slug_fehler(slug: str) -> str | None:
    """None = gueltige FORM (nicht: frei). Sonst ein Fehlerschluessel."""
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", slug or ""):
        return "slug_zeichen"
    if not SLUG_MIN <= len(slug) <= SLUG_MAX:
        return "slug_laenge"
    if slug in RESERVIERT:
        return "slug_reserviert"
    return None


def slug_frei(db: Session, slug: str, team_id: int | None = None) -> bool:
    t = db.query(models.Team.id).filter(models.Team.slug == slug).first()
    if t is not None and t[0] != team_id:
        return False
    alt = db.query(models.TeamSlugAlt.team_id).filter(models.TeamSlugAlt.slug == slug).first()
    return alt is None or (team_id is not None and alt[0] == team_id)


def freier_slug(db: Session, wunsch: str) -> str:
    basis = slug_aus(wunsch) or "team"
    if len(basis) < SLUG_MIN:
        basis = (basis + "-team")[:SLUG_MAX]
    kandidat, n = basis, 2
    while slug_fehler(kandidat) or not slug_frei(db, kandidat):
        endung = f"-{n}"
        kandidat = basis[:SLUG_MAX - len(endung)] + endung
        n += 1
    return kandidat


def finde(db: Session, slug: str) -> tuple[models.Team | None, bool]:
    """(Team, umgeleitet). Alte Adressen fuehren zum Team (umgeleitet=True)."""
    t = db.query(models.Team).filter(models.Team.slug == slug).first()
    if t is not None:
        return t, False
    alt = db.query(models.TeamSlugAlt).filter(models.TeamSlugAlt.slug == slug).first()
    if alt is not None and alt.team_id is not None:
        return db.get(models.Team, alt.team_id), True
    # Freigegebene Adresse, waehrend intern schon eine neue gilt: aussen gilt die alte weiter.
    t = db.query(models.Team).filter(models.Team.frei_slug == slug).first()
    return (t, True) if t is not None else (None, False)


def slug_merken(db: Session, slug: str | None, team_id: int) -> None:
    if slug and db.query(models.TeamSlugAlt.id).filter_by(slug=slug).first() is None:
        db.add(models.TeamSlugAlt(slug=slug, team_id=team_id))


# ------------------------------------------------------------------------- Mitgliedschaft ----

def mitglied(db: Session, team_id: int, uid: int | None) -> models.TeamMitglied | None:
    if not uid:
        return None
    return db.query(models.TeamMitglied).filter_by(team_id=team_id, user_id=uid).first()


def aktiv(m: models.TeamMitglied | None) -> bool:
    return m is not None and m.status == "aktiv"


def darf_verwalten(m: models.TeamMitglied | None) -> bool:
    """Mitglieder annehmen/entfernen: Leiter und Moderatoren."""
    return aktiv(m) and m.rolle in ("leiter", "moderator")


def ist_leiter(m: models.TeamMitglied | None) -> bool:
    return aktiv(m) and m.rolle == "leiter"


def mitglieder_ids(db: Session, team_id: int) -> list[int]:
    M, U = models.TeamMitglied, models.User
    return [uid for (uid,) in db.query(M.user_id).join(U, U.id == M.user_id)
            .filter(M.team_id == team_id, M.status == "aktiv", U.blocked.isnot(True)).all()]


def oeffentlich_sichtbar(t: models.Team) -> bool:
    """Steht das Team nach aussen (Community-Abschnitt, Adresse fuer Nichtmitglieder)?"""
    return t.frei_am is not None


def bestenlisten_oeffentlich(t: models.Team) -> bool:
    return bool(t.oeffentlich) and oeffentlich_sichtbar(t)


def auftritt(t: models.Team, intern: bool) -> dict:
    """Name/Adresse/Beschreibung/Logo/Farbe — intern die aktuelle, aussen die freigegebene Fassung."""
    if intern:
        return {"name": t.name, "slug": t.slug, "beschreibung": t.beschreibung,
                "logo_url": t.logo_url, "farbe": t.farbe}
    return {"name": t.frei_name, "slug": t.frei_slug, "beschreibung": t.frei_beschreibung,
            "logo_url": t.frei_logo_url, "farbe": t.frei_farbe}


AUFTRITT_FELDER = ("name", "slug", "beschreibung", "logo_url", "farbe")


def auftritt_geaendert(t: models.Team) -> bool:
    return t.frei_am is None or any(getattr(t, f) != getattr(t, "frei_" + f) for f in AUFTRITT_FELDER)


def nach_aenderung(t: models.Team) -> None:
    """Nach jeder Aenderung am Auftritt: ein schon freigegebenes Team wartet wieder auf Freigabe."""
    if t.frei_am is None:
        return              # noch nie freigegeben: der Leiter beantragt selbst
    t.freigabe = "wartet" if auftritt_geaendert(t) else "frei"


def freigeben(db: Session, t: models.Team) -> list[str]:
    """Aktuelle Fassung nach aussen uebernehmen. Gibt nicht mehr benutzte Logo-URLs zurueck (zum Aufraeumen)."""
    alt_logo = t.frei_logo_url
    alt_slug = t.frei_slug
    for f in AUFTRITT_FELDER:
        setattr(t, "frei_" + f, getattr(t, f))
    t.frei_am = _jetzt()
    t.freigabe = "frei"
    t.freigabe_notiz = None
    if alt_slug and alt_slug != t.slug:
        slug_merken(db, alt_slug, t.id)
    return [alt_logo] if alt_logo and alt_logo not in (t.logo_url, t.frei_logo_url) else []


def initialen(name: str | None) -> str:
    teile = [p for p in re.split(r"[\s._-]+", (name or "").strip()) if p]
    if not teile:
        return "?"
    if len(teile) == 1:
        return teile[0][:2].upper()
    return (teile[0][0] + teile[-1][0]).upper()


# ---------------------------------------------------------------------------- Einladungen ----

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def einladung(db: Session, team_id: int, art: str, neu: bool = False) -> models.TeamEinladung:
    """Die (einzige) Einladung dieser Art — wird beim ersten Abruf angelegt; `neu` ersetzt den Token."""
    e = db.query(models.TeamEinladung).filter_by(team_id=team_id, art=art).first()
    if e is not None and not neu:
        return e
    token = secrets.token_urlsafe(9)
    if e is None:
        e = models.TeamEinladung(team_id=team_id, art=art, token=token, token_hash=_hash(token))
        db.add(e)
    else:
        e.token, e.token_hash, e.erzeugt_am, e.genutzt = token, _hash(token), _jetzt(), 0
    db.flush()
    return e


def einladung_finden(db: Session, token: str) -> models.TeamEinladung | None:
    if not token or len(token) > 64:
        return None
    return db.query(models.TeamEinladung).filter_by(token_hash=_hash(token)).first()


# ----------------------------------------------------------------------------- Loeschungen ----

def team_loeschen(db: Session, t: models.Team) -> list[str]:
    """Team mit allem entfernen. Adressen bleiben gesperrt (team_id NULL). Gibt Medien-URLs zurueck."""
    medien = [u for u in {t.logo_url, t.frei_logo_url} if u]
    for slug in {t.slug, t.frei_slug} - {None}:
        slug_merken(db, slug, t.id)
    db.flush()
    db.query(models.TeamSlugAlt).filter_by(team_id=t.id).update({"team_id": None})
    for M in (models.TeamMitglied, models.TeamEinladung, models.TeamSpot, models.TeamTafel):
        db.query(M).filter_by(team_id=t.id).delete()
    db.delete(t)
    return medien


def vor_konto_loeschen(db: Session, uid: int) -> list[str]:
    """DSGVO-Loeschung: geleitete Teams an den dienstaeltesten Moderator, sonst das dienstaelteste Mitglied
    uebergeben; ohne weitere Mitglieder wird das Team geloescht. Die Mitgliedschaft selbst raeumt
    `loeschung.konto_loeschen` ueber den Fremdschluessel ab."""
    M = models.TeamMitglied
    medien: list[str] = []
    for m in db.query(M).filter_by(user_id=uid, rolle="leiter").all():
        rest = (db.query(M).filter(M.team_id == m.team_id, M.user_id != uid, M.status == "aktiv")
                .order_by((M.rolle != "moderator"), M.seit.asc(), M.id.asc()).first())
        if rest is None:
            t = db.get(models.Team, m.team_id)
            if t is not None:
                medien += team_loeschen(db, t)
        else:
            rest.rolle = "leiter"
    db.flush()
    return medien


# ---------------------------------------------------------------------------- Bestenlisten ----

_cache: dict[tuple, tuple[float, list]] = {}
_CACHE_S = 120
_CACHE_MAX = 500


def _cache_holen(key):
    t = _cache.get(key)
    if t is not None and time.monotonic() - t[0] < _CACHE_S:
        return t[1]
    return None


def _cache_setzen(key, wert):
    if len(_cache) >= _CACHE_MAX:
        _cache.clear()
    _cache[key] = (time.monotonic(), wert)


def tafel_berechnen(db: Session, team: models.Team, tf: models.TeamTafel, period: str,
                    member_ids: list[int] | None = None) -> list[dict]:
    """Rangliste einer Tafel: je Person der beste Wert bzw. die Summe, absteigend.

    Liefert die VOLLE Zeile (mit Session, Datum, Spot) — was davon wer sehen darf, entscheidet der Aufrufer
    (`fuer_gast` streicht alles ausser Rang, Name, Initialen, Wert)."""
    from .api import community as C

    ids = member_ids if member_ids is not None else mitglieder_ids(db, team.id)
    if not ids or tf.kennzahl not in KENNZAHLEN:
        return []
    spot_ids = ([s for (s,) in db.query(models.TeamSpot.spot_id).filter_by(team_id=team.id).all()]
                if tf.nur_teamspots else [])
    key = (team.id, tf.id, tf.kennzahl, tf.sportart, tf.accel_only, tf.nur_brett, tf.foil_band,
           tf.nur_teamspots, tuple(sorted(spot_ids)), period, tuple(sorted(ids)))
    hit = _cache_holen(key)
    if hit is not None:
        return hit

    S, U, AR = C.S, C.U, C.AR
    cut = C._cutoff(period)

    def filtern(q):
        q = C._band_filter(db, q, tf.foil_band, 0)
        q = q.filter(S.user_id.in_(ids))
        if cut is not None:
            q = q.filter(S.started_at >= cut)
        if tf.nur_brett:
            q = q.filter(S.placement == "board")
        if tf.nur_teamspots:
            if not spot_ids:
                return None
            q = q.filter(or_(*[C._spot_cond(str(s), db) for s in spot_ids]))
        return q

    out: list[dict] = []
    if tf.kennzahl in BEST:
        valcol, _idx = C.REC_COL[tf.kennzahl]
        q = C._community(db.query(U.id, valcol, S.id, S.started_at, C.NAME, U.avatar_url, S.place_name,
                                  S.place_lat, S.place_lon, S.ort_sichtbarkeit),
                         None, tf.accel_only, tf.sportart)
        q = filtern(q)
        if q is not None:
            q = q.filter(valcol > 0)
            # Je Person die beste Session; Gleichstand: wer zuerst gefahren ist (wie die Rekorde).
            rows = (q.order_by(U.id, valcol.desc(), S.started_at.asc(), S.id.asc())
                    .distinct(U.id).all())
            for uid, val, sid, ts, name, av, place, lat, lon, sicht in rows:
                spot, tz = C._ort(db, sicht, uid, place, lat, lon)
                out.append({"user_id": uid, "name": name, "avatar_url": av, "value": round(float(val), 2),
                            "session_id": sid, "started_at": ts.isoformat() if ts else None,
                            "spot": spot, "tz": tz})
    else:
        from . import pumpgleit_anzeige as PA
        wert = {
            "sum_sessions": func.count(S.id),
            "sum_runs": func.coalesce(func.sum(AR.num_runs), 0),
            "sum_pumps": func.coalesce(func.sum(PA.col_pump_count()), 0),
            "sum_distance": func.coalesce(func.sum(AR.foiling_distance_m), 0),
            "sum_time": func.coalesce(func.sum(AR.foiling_time_s), 0),
            "sum_spots": func.count(func.distinct(S.spot_id)),
        }[tf.kennzahl]
        q = C._community(db.query(U.id, C.NAME, U.avatar_url, wert), None, tf.accel_only, tf.sportart)
        q = filtern(q)
        if q is not None:
            for uid, name, av, val in q.group_by(U.id, U.display_name, U.avatar_url).all():
                if val and float(val) > 0:
                    out.append({"user_id": uid, "name": name, "avatar_url": av,
                                "value": round(float(val), 2)})
    out.sort(key=lambda r: (-r["value"], r.get("started_at") or "", r["user_id"]))
    out = out[:TAFEL_LAENGE]
    for i, r in enumerate(out):
        r["rang"] = i + 1
        r["initialen"] = initialen(r["name"])
    _cache_setzen(key, out)
    return out


def fuer_gast(zeilen: list[dict]) -> list[dict]:
    """Ohne Login nur Rang, Anzeigename, Initialen, Wert (Jan, 31.10.2026)."""
    return [{"rang": r["rang"], "name": r["name"], "initialen": r["initialen"], "value": r["value"]}
            for r in zeilen]


def tafel_out(tf: models.TeamTafel) -> dict:
    return {"id": tf.id, "kennzahl": tf.kennzahl, "sportart": tf.sportart, "accel_only": tf.accel_only,
            "nur_brett": tf.nur_brett, "foil_band": tf.foil_band, "nur_teamspots": tf.nur_teamspots}


def tafeln(db: Session, team_id: int) -> list[models.TeamTafel]:
    T = models.TeamTafel
    return db.query(T).filter_by(team_id=team_id).order_by(T.reihenfolge, T.id).all()


STANDARD_TAFELN = ("session_pumps", "distance", "speed", "sum_pumps")
