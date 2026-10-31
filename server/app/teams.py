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
    for M in (models.TeamMitglied, models.TeamEinladung, models.TeamSpot, models.TeamTafel,
              models.TeamRekord, models.TeamLogbuch, models.TeamEvent):
        db.query(M).filter_by(team_id=t.id).delete()
    medien += chat_loeschen(db, t.id)
    db.delete(t)
    return medien


def chat_scope(team_id: int) -> str:
    return f"team:{team_id}"


def chat_raus(db: Session, team_id: int, uid: int) -> None:
    """Nach Austritt/Entfernen: Raum-Zustand weg — kein Push mehr, kein Eintrag in „Meine Chats".
    (Lesen und Schreiben sperrt ohnehin `chat._require_access` ueber die Mitgliedschaft.)"""
    db.query(models.ChatRoomState).filter_by(scope=chat_scope(team_id), user_id=uid).delete()


def chat_loeschen(db: Session, team_id: int) -> list[str]:
    """Team geloescht -> Team-Chat mit allen Nachrichten, Bildern, Likes, Meldungen weg. Gibt Bild-URLs zurueck."""
    sc = chat_scope(team_id)
    ids = [i for (i,) in db.query(models.ChatMessage.id).filter_by(scope=sc).all()]
    medien: list[str] = []
    if ids:
        for p in db.query(models.ChatPhoto).filter(models.ChatPhoto.message_id.in_(ids)).all():
            medien.append(p.url)
            db.delete(p)
        db.query(models.ChatLike).filter(models.ChatLike.message_id.in_(ids)).delete(synchronize_session=False)
        db.query(models.ChatReport).filter(models.ChatReport.message_id.in_(ids)).delete(synchronize_session=False)
        db.query(models.ChatMessage).filter(models.ChatMessage.reply_to_id.in_(ids)).update(
            {"reply_to_id": None}, synchronize_session=False)
        db.flush()
        db.query(models.ChatMessage).filter(models.ChatMessage.id.in_(ids)).delete(synchronize_session=False)
    db.query(models.ChatRoomState).filter_by(scope=sc).delete()
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
    # Eingefrorene Event-Ergebnisse tragen Namen/Profilbilder: die Zeilen dieser Person entfernen
    # (DSGVO-Loeschung ist absolut), die Plaetze darunter ruecken auf.
    import json as _json
    for e in db.query(models.TeamEvent).filter(models.TeamEvent.ergebnis_json.isnot(None)).all():
        tafeln_ = _json.loads(e.ergebnis_json)
        geaendert = False
        for tf in tafeln_:
            vorher = len(tf.get("zeilen", []))
            tf["zeilen"] = [z for z in tf.get("zeilen", []) if z.get("user_id") != uid]
            if len(tf["zeilen"]) != vorher:
                geaendert = True
                for i, z in enumerate(tf["zeilen"]):
                    z["rang"] = i + 1
        if geaendert:
            e.ergebnis_json = _json.dumps(tafeln_)
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
                    member_ids: list[int] | None = None, fenster: tuple[datetime, datetime] | None = None,
                    event_spots: list[int] | None = None) -> list[dict]:
    """Rangliste einer Tafel: je Person der beste Wert bzw. die Summe, absteigend.

    Events: `fenster` = [von, bis) statt des Zeitraums (Startzeit der Session zaehlt), `event_spots` = nur
    diese Spots (leer/None = alle).

    Liefert die VOLLE Zeile (mit Session, Datum, Spot) — was davon wer sehen darf, entscheidet der Aufrufer
    (`fuer_gast` streicht alles ausser Rang, Name, Initialen, Wert)."""
    from .api import community as C

    ids = member_ids if member_ids is not None else mitglieder_ids(db, team.id)
    if not ids or tf.kennzahl not in KENNZAHLEN:
        return []
    if event_spots:
        spot_ids, nur_spots = list(event_spots), True
    else:
        nur_spots = bool(tf.nur_teamspots)
        spot_ids = ([s for (s,) in db.query(models.TeamSpot.spot_id).filter_by(team_id=team.id).all()]
                    if nur_spots else [])
    key = (team.id, tf.id, tf.kennzahl, tf.sportart, tf.accel_only, tf.nur_brett, tf.foil_band,
           nur_spots, tuple(sorted(spot_ids)), period, fenster, tuple(sorted(ids)))
    hit = _cache_holen(key)
    if hit is not None:
        return hit

    S, U, AR = C.S, C.U, C.AR
    cut = C._cutoff(period)

    def filtern(q):
        q = C._band_filter(db, q, tf.foil_band, 0)
        q = q.filter(S.user_id.in_(ids))
        if fenster is not None:
            q = q.filter(S.started_at >= fenster[0], S.started_at < fenster[1])
        elif cut is not None:
            q = q.filter(S.started_at >= cut)
        if tf.nur_brett:
            q = q.filter(S.placement == "board")
        if nur_spots:
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


# -------------------------------------------------------------------------- Teamstatistik ----

def statistik(db: Session, team: models.Team, period: str, sportart: str = "pumpfoil") -> dict:
    """Teamsummen im Zeitraum (Jan, 31.10.2026: „teamsumme und stats sind super"): Sessions, Laeufe,
    Pumps, On-Foil-Strecke/-Zeit, Spots und wie viele Mitglieder aktiv waren. Gleiche Filter wie die
    Bestenlisten (Standard: nur mit Bewegungsdaten); keine Rangliste Team gegen Team."""
    from .api import community as C
    from . import pumpgleit_anzeige as PA

    ids = mitglieder_ids(db, team.id)
    leer = {"sessions": 0, "runs": 0, "pumps": 0, "distance_m": 0.0, "time_s": 0.0, "spots": 0, "aktive": 0,
            "mitglieder": len(ids)}
    if not ids:
        return leer
    key = ("statistik", team.id, period, sportart, tuple(sorted(ids)))
    hit = _cache_holen(key)
    if hit is not None:
        return hit
    S, U, AR = C.S, C.U, C.AR
    q = C._community(db.query(
        func.count(S.id), func.coalesce(func.sum(AR.num_runs), 0), func.coalesce(func.sum(PA.col_pump_count()), 0),
        func.coalesce(func.sum(AR.foiling_distance_m), 0), func.coalesce(func.sum(AR.foiling_time_s), 0),
        func.count(func.distinct(S.spot_id)), func.count(func.distinct(S.user_id)),
    ), None, True, sportart).filter(S.user_id.in_(ids))
    cut = C._cutoff(period)
    if cut is not None:
        q = q.filter(S.started_at >= cut)
    n, runs, pumps, dist, zeit, spots, aktive = q.one()
    out = {"sessions": int(n or 0), "runs": int(runs or 0), "pumps": int(pumps or 0),
           "distance_m": round(float(dist or 0), 1), "time_s": round(float(zeit or 0), 1),
           "spots": int(spots or 0), "aktive": int(aktive or 0), "mitglieder": len(ids)}
    _cache_setzen(key, out)
    return out


# ------------------------------------------------------------------------------ Logbuch ----

def schluessel(tf: models.TeamTafel) -> str:
    return "|".join([tf.kennzahl, tf.sportart, "a" if tf.accel_only else "g", "b" if tf.nur_brett else "-",
                     tf.foil_band or "all", "s" if tf.nur_teamspots else "-"])


def logbuch_snapshot(db: Session) -> int:
    """Naechtlich (record_snapshot.py): je Team und Bestenliste den Allzeit-Ersten mit dem gespeicherten
    Stand vergleichen. Neuer HOEHERER Wert -> Logbuch-Eintrag. Sinkt der Wert (Session geloescht,
    Mitglied ausgetreten), wird der Stand still nachgezogen — das ist kein gebrochener Rekord.
    Der erste Lauf je Art haelt den Stand fest (Eintrag ohne Vorgaenger). Bei Summen (Pumps gesamt …)
    zaehlt nur ein Wechsel an der Spitze."""
    neu = 0
    for t in db.query(models.Team).all():
        ids = mitglieder_ids(db, t.id)
        gesehen: set[str] = set()
        for tf in tafeln(db, t.id):
            k = schluessel(tf)
            if k in gesehen:
                continue
            gesehen.add(k)
            zeilen = tafel_berechnen(db, t, tf, "all", ids)
            stand = db.query(models.TeamRekord).filter_by(team_id=t.id, schluessel=k).first()
            if not zeilen:
                continue
            erster = zeilen[0]
            gefahren = erster.get("started_at")
            gefahren_dt = datetime.fromisoformat(gefahren) if gefahren else None
            if stand is None:
                db.add(models.TeamRekord(team_id=t.id, schluessel=k, user_id=erster["user_id"],
                                         session_id=erster.get("session_id"), wert=erster["value"]))
                db.add(models.TeamLogbuch(team_id=t.id, kennzahl=tf.kennzahl, sportart=tf.sportart, schluessel=k,
                                          user_id=erster["user_id"], session_id=erster.get("session_id"),
                                          wert=erster["value"], gefahren_am=gefahren_dt))
                neu += 1
            elif erster["value"] > stand.wert and (tf.kennzahl in BEST or erster["user_id"] != stand.user_id):
                # Summen wachsen jede Nacht — dort zaehlt nur ein Ueberholen, nicht das eigene Weiterwachsen.
                db.add(models.TeamLogbuch(team_id=t.id, kennzahl=tf.kennzahl, sportart=tf.sportart, schluessel=k,
                                          user_id=erster["user_id"], session_id=erster.get("session_id"),
                                          wert=erster["value"], vorher_user_id=stand.user_id,
                                          vorher_wert=stand.wert, gefahren_am=gefahren_dt))
                stand.user_id, stand.session_id, stand.wert, stand.stand = (
                    erster["user_id"], erster.get("session_id"), erster["value"], _jetzt())
                neu += 1
            elif erster["value"] < stand.wert or erster["user_id"] != stand.user_id:
                stand.user_id, stand.session_id, stand.wert, stand.stand = (
                    erster["user_id"], erster.get("session_id"), erster["value"], _jetzt())
        db.commit()
    return neu


def logbuch(db: Session, team_id: int, limit: int = 50) -> list[dict]:
    L, U = models.TeamLogbuch, models.User
    namen: dict[int, tuple[str | None, str | None]] = {}

    def name(uid: int | None):
        if uid is None:
            return None, None
        if uid not in namen:
            u = db.get(U, uid)
            namen[uid] = ((u.display_name or f"User #{u.id}"), u.avatar_url) if u else (None, None)
        return namen[uid]

    out = []
    for e in db.query(L).filter_by(team_id=team_id).order_by(L.erfasst_am.desc(), L.id.desc()).limit(limit).all():
        n, av = name(e.user_id)
        vn, _ = name(e.vorher_user_id)
        out.append({"kennzahl": e.kennzahl, "sportart": e.sportart, "user_id": e.user_id, "name": n,
                    "avatar_url": av, "session_id": e.session_id, "wert": e.wert,
                    "vorher_user_id": e.vorher_user_id, "vorher_name": vn, "vorher_wert": e.vorher_wert,
                    "gefahren_am": e.gefahren_am.isoformat() if e.gefahren_am else None,
                    "erfasst_am": e.erfasst_am.isoformat() if e.erfasst_am else None})
    return out


# ------------------------------------------------------------------------------- Events ----
# Stufe 3 (docs/TEAMS.md). Gewertet wird, was im Fenster [start, ende) GESTARTET ist; hochladen darf man
# bis ende + EINFRIEREN_NACH, dann steht das Ergebnis fest (sonst verschoebe ein spaeteres Zuschneiden
# den Sieger). Je Person zaehlt wie ueberall der beste Wert bzw. die Summe.

from datetime import timedelta  # noqa: E402
import json  # noqa: E402

EINFRIEREN_NACH = timedelta(hours=24)
EVENT_MAX_DAUER = timedelta(days=62)
EVENT_MAX_OFFEN = 20             # kommende + laufende Events je Team
EVENT_MAX_TAFELN = 6
ABZEICHEN_PLAETZE = 3


def _aware(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def event_status(e: models.TeamEvent, jetzt: datetime | None = None) -> str:
    """kommend | laeuft | auswertung (vorbei, Uploads noch offen) | beendet (eingefroren)."""
    j = jetzt or _jetzt()
    if e.eingefroren_am is not None:
        return "beendet"
    if j < _aware(e.start):
        return "kommend"
    if j < _aware(e.ende):
        return "laeuft"
    return "auswertung"


def event_tafeln(e: models.TeamEvent) -> list[models.TeamTafel]:
    """Die Bestenlisten eines Events als (nicht gespeicherte) Tafel-Objekte — dieselbe Rechnung wie sonst."""
    out = []
    for i, x in enumerate(json.loads(e.tafeln_json or "[]")):
        out.append(models.TeamTafel(id=-(e.id * 100 + i), team_id=e.team_id, kennzahl=x["kennzahl"],
                                    sportart=x.get("sportart", "pumpfoil"), accel_only=x.get("accel_only", True),
                                    nur_brett=x.get("nur_brett", False), foil_band=x.get("foil_band", "all"),
                                    nur_teamspots=False, reihenfolge=i))
    return out


def event_spots(e: models.TeamEvent) -> list[int]:
    return [int(i) for i in json.loads(e.spots_json or "[]")]


def event_berechnen(db: Session, t: models.Team, e: models.TeamEvent) -> list[dict]:
    """Bestenlisten des Events — eingefroren aus `ergebnis_json`, sonst live."""
    if e.ergebnis_json:
        return json.loads(e.ergebnis_json)
    ids = mitglieder_ids(db, t.id)
    fenster = (_aware(e.start), _aware(e.ende))
    return [{**tafel_out(tf), "zeilen": tafel_berechnen(db, t, tf, "all", ids, fenster=fenster,
                                                         event_spots=event_spots(e))}
            for tf in event_tafeln(e)]


def event_einfrieren(db: Session, e: models.TeamEvent, jetzt: datetime | None = None) -> bool:
    """Ergebnis festschreiben, sobald ende + EINFRIEREN_NACH vorbei ist. True = gerade eingefroren."""
    j = jetzt or _jetzt()
    if e.eingefroren_am is not None or j < _aware(e.ende) + EINFRIEREN_NACH:
        return False
    t = db.get(models.Team, e.team_id)
    if t is None:
        return False
    # Frisch rechnen, nicht aus dem 2-Minuten-Cache.
    for k in [k for k in _cache if k and k[0] == t.id]:
        _cache.pop(k, None)
    e.ergebnis_json = json.dumps(event_berechnen(db, t, e))
    e.eingefroren_am = j
    return True


def events_einfrieren(db: Session) -> int:
    """Naechtlich (record_snapshot.py) und beim Abruf: alle faelligen Events festschreiben."""
    n = 0
    grenze = _jetzt() - EINFRIEREN_NACH
    for e in db.query(models.TeamEvent).filter(models.TeamEvent.eingefroren_am.is_(None),
                                               models.TeamEvent.ende <= grenze).all():
        n += event_einfrieren(db, e)
    db.commit()
    return n


def event_out(db: Session, t: models.Team, e: models.TeamEvent, gast: bool = False) -> dict:
    tafeln_ = event_berechnen(db, t, e)
    if gast:
        tafeln_ = [{**tf, "zeilen": fuer_gast(tf["zeilen"])} for tf in tafeln_]
    spots = []
    if not gast:
        ids = event_spots(e)
        if ids:
            spots = [{"id": i, "name": n} for i, n in db.query(models.Spot.id, models.Spot.name)
                     .filter(models.Spot.id.in_(ids)).all()]
    return {"id": e.id, "titel": e.titel, "beschreibung": e.beschreibung, "start": _aware(e.start).isoformat(),
            "ende": _aware(e.ende).isoformat(), "zeitzone": e.zeitzone, "vorlage": e.vorlage,
            "status": event_status(e), "spots": spots, "spot_ids": [] if gast else event_spots(e),
            "einfrieren_am": (_aware(e.ende) + EINFRIEREN_NACH).isoformat(), "tafeln": tafeln_}


def events_liste(db: Session, team_id: int, beendete: int = 10) -> list[models.TeamEvent]:
    """Laufende, in Auswertung und kommende Events, dazu die letzten `beendete` eingefrorenen."""
    E = models.TeamEvent
    offen = db.query(E).filter(E.team_id == team_id, E.eingefroren_am.is_(None)).order_by(E.start).all()
    alt = (db.query(E).filter(E.team_id == team_id, E.eingefroren_am.isnot(None))
           .order_by(E.ende.desc()).limit(beendete).all())
    return offen + alt


def abzeichen(db: Session, uid: int) -> list[dict]:
    """Event-Abzeichen fuer die Foiler-Seite: Plaetze 1–3 eingefrorener Events. NUR Teams mit freigegebenem
    Auftritt und dann deren freigegebener Name — ein internes Team wuerde sonst ueber die Foiler-Seite
    bekannt (Name und Mitgliedschaft)."""
    out = []
    E, Tm = models.TeamEvent, models.Team
    for e, t in (db.query(E, Tm).join(Tm, Tm.id == E.team_id)
                 .filter(E.eingefroren_am.isnot(None), Tm.frei_am.isnot(None))
                 .order_by(E.ende.desc()).limit(500).all()):
        for tf in json.loads(e.ergebnis_json or "[]"):
            for z in tf.get("zeilen", [])[:ABZEICHEN_PLAETZE]:
                if z.get("user_id") == uid:
                    out.append({"rang": z["rang"], "event": e.titel, "team": t.frei_name, "team_slug": t.frei_slug,
                                "farbe": t.frei_farbe, "kennzahl": tf["kennzahl"], "wert": z["value"],
                                "datum": _aware(e.ende).date().isoformat()})
    return out[:30]
