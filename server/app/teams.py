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

from . import models, sportmix

ROLLEN = ("leiter", "moderator", "mitglied")
EINLADUNGS_ARTEN = ("join", "apply")
# Teamfarben: Schluessel einer vorgegebenen Palette (Werte je Hell/Dunkel im Web, `web/src/lib/teamFarben.ts`).
# Je Farbton drei Stufen (01.11.2026), Werte in web/src/lib/teamFarben.ts.
FARBEN = tuple(f"{h}{s}" for h in ("cyan", "blau", "indigo", "violett", "pink", "rot", "orange", "amber", "gelb",
                                    "limette", "gruen", "petrol") for s in ("-hell", "", "-dunkel"))
SLUG_MIN, SLUG_MAX = 3, 40
NAME_MIN, NAME_MAX = 3, 60
BESCHREIBUNG_MAX = 1000
MAX_WARTEND_JE_PERSON = 3        # Teams im Status „wartet", die jemand leitet
MAX_TEAMS_JE_PERSON = 10         # Teams, die jemand leitet
MAX_TAFELN = 20
MAX_TEAMSPOTS = 20
TAFEL_LAENGE = 50                # so viele Plaetze je Bestenliste
RESERVIERT = {"neu", "new", "admin", "join", "apply", "einladung", "teams", "team", "api", "mine", "regeln", "rules",
              "liste", "list", "settings", "einstellungen", "pumpfoil", "official", "offiziell"}

# Kennzahlen. „best_*": je Person die beste Session (Spalten wie die Rekorde). „sum_*": je Person die Summe.
BEST = ("distance", "duration", "speed", "glide", "runs", "session_distance", "session_time", "session_pumps")
SUMME = ("sum_sessions", "sum_runs", "sum_pumps", "sum_distance", "sum_time", "sum_spots")
KENNZAHLEN = BEST + SUMME
# Fliegende Sprints (09.11.2026, analysis/sprint.py): je Person die beste Session wie BEST, Wert = Tempo des besten
# Fensters (m/s). Vorerst NUR in Events waehlbar (Jan: „erstmal nur in events … noch nicht in den rekord-kacheln oder
# community-seiten") und nur an Clients, die sie kennen (`?sprint=1`) — alte Apps zeigten den Rohschluessel.
SPRINT = ("sprint_100m", "sprint_200m", "sprint_300m", "sprint_60s")
EVENT_KENNZAHLEN = KENNZAHLEN + SPRINT


def _sprint_col(kennzahl: str):
    return getattr(models.AnalysisResult, kennzahl + "_mps")
# Gesamtsummen eines Events ueber alle Teilnehmer (Jan, 01.11.2026) — dieselben Groessen wie die Teamstatistik.
EVENT_SUMMEN = ("sessions", "runs", "pumps", "distance_m", "time_s", "spots", "aktive")


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
    """(Team, umgeleitet). Alte Adressen fuehren zum Team (umgeleitet=True). Geloeschte Teams gibt es nicht."""
    Tm = models.Team
    t = db.query(Tm).filter(Tm.slug == slug, Tm.geloescht_am.is_(None)).first()
    if t is not None:
        return t, False
    alt = db.query(models.TeamSlugAlt).filter(models.TeamSlugAlt.slug == slug).first()
    if alt is not None and alt.team_id is not None:
        t = db.get(Tm, alt.team_id)
        return (t, True) if t is not None and t.geloescht_am is None else (None, False)
    # Freigegebene Adresse, waehrend intern schon eine neue gilt: aussen gilt die alte weiter.
    t = db.query(Tm).filter(Tm.frei_slug == slug, Tm.geloescht_am.is_(None)).first()
    return (t, True) if t is not None else (None, False)


def team_weich_loeschen(t: models.Team, uid: int) -> None:
    """Team ausblenden (Jan, 01.11.2026: „das gleiche auch fuer gesamte teams" — wie bei Events nur weich).
    Ab jetzt zaehlt keine Mitgliedschaft mehr (`mitglied`/`mitglieder_ids`), der Chat ist zu, Abzeichen
    verschwinden. `team_loeschen` (endgueltig, mit Medien und Chat) bleibt fuer einen spaeteren Papierkorb."""
    t.geloescht_am, t.geloescht_von = _jetzt(), uid


def slug_merken(db: Session, slug: str | None, team_id: int) -> None:
    if slug and db.query(models.TeamSlugAlt.id).filter_by(slug=slug).first() is None:
        db.add(models.TeamSlugAlt(slug=slug, team_id=team_id))


# ------------------------------------------------------------------------- Mitgliedschaft ----

def mitglied(db: Session, team_id: int, uid: int | None) -> models.TeamMitglied | None:
    if not uid:
        return None
    M, Tm = models.TeamMitglied, models.Team
    return (db.query(M).join(Tm, Tm.id == M.team_id)
            .filter(M.team_id == team_id, M.user_id == uid, Tm.geloescht_am.is_(None)).first())


def aktiv(m: models.TeamMitglied | None) -> bool:
    return m is not None and m.status == "aktiv"


def darf_verwalten(m: models.TeamMitglied | None) -> bool:
    """Mitglieder annehmen/entfernen: Leiter und Moderatoren."""
    return aktiv(m) and m.rolle in ("leiter", "moderator")


def ist_leiter(m: models.TeamMitglied | None) -> bool:
    return aktiv(m) and m.rolle == "leiter"


def mitglieder_ids(db: Session, team_id: int) -> list[int]:
    M, U, Tm = models.TeamMitglied, models.User, models.Team
    return [uid for (uid,) in db.query(M.user_id).join(U, U.id == M.user_id).join(Tm, Tm.id == M.team_id)
            .filter(M.team_id == team_id, M.status == "aktiv", U.blocked.isnot(True), Tm.geloescht_am.is_(None)).all()]


def mitglieder_team_ids(db: Session, uid: int) -> list[int]:
    """Teams, in denen jemand aktives Mitglied ist (geloeschte Teams nicht)."""
    M, Tm = models.TeamMitglied, models.Team
    return [i for (i,) in db.query(M.team_id).join(Tm, Tm.id == M.team_id)
            .filter(M.user_id == uid, M.status == "aktiv", Tm.geloescht_am.is_(None)).all()]


# Team-Herkunft (03.11.2026): ein Land (ISO 3166-1 alpha-2, gross) oder ein Kontinent bzw. die ganze Erde mit Praefix
# „k:" — die Kontinent-Kuerzel AF/AS/NA/SA sind sonst auch Laendercodes (Afghanistan, Am.-Samoa, Namibia, Saudi-Arabien).
KONTINENTE = ("k:earth", "k:eu", "k:af", "k:as", "k:na", "k:sa", "k:oc")


def land_pruefen(v: str) -> str | None:
    """"" -> keine Angabe (None); sonst Land oder Kontinent, alles andere ValueError."""
    v = (v or "").strip()
    if not v:
        return None
    if v.lower() in KONTINENTE:
        return v.lower()
    if re.fullmatch(r"[A-Za-z]{2}", v):
        return v.upper()
    raise ValueError(v)


def oeffentlich_sichtbar(t: models.Team) -> bool:
    """Steht das Team nach aussen (Community-Abschnitt, Adresse fuer Nichtmitglieder)?"""
    return t.frei_am is not None


def bestenlisten_oeffentlich(t: models.Team) -> bool:
    return bool(t.oeffentlich) and oeffentlich_sichtbar(t)


def auftritt(t: models.Team, intern: bool) -> dict:
    """Name/Adresse/Beschreibung/Logo/Teambild/Farbe — intern die aktuelle, aussen die freigegebene Fassung."""
    if intern:
        return {"name": t.name, "slug": t.slug, "beschreibung": t.beschreibung,
                "logo_url": t.logo_url, "banner_url": t.banner_url, "banner_fokus": t.banner_fokus, "farbe": t.farbe,
                "land": t.land}
    return {"name": t.frei_name, "slug": t.frei_slug, "beschreibung": t.frei_beschreibung,
            "logo_url": t.frei_logo_url, "banner_url": t.frei_banner_url, "banner_fokus": t.banner_fokus,
            "farbe": t.frei_farbe, "land": t.land}


AUFTRITT_FELDER = ("name", "slug", "beschreibung", "logo_url", "banner_url", "farbe")
BILD_FELDER = ("logo_url", "banner_url")


def auftritt_geaendert(t: models.Team) -> bool:
    return t.frei_am is None or any(getattr(t, f) != getattr(t, "frei_" + f) for f in AUFTRITT_FELDER)


def nach_aenderung(t: models.Team) -> None:
    """Nach jeder Aenderung am Auftritt: ein schon freigegebenes Team wartet wieder auf Freigabe."""
    if t.frei_am is None:
        return              # noch nie freigegeben: der Leiter beantragt selbst
    t.freigabe = "wartet" if auftritt_geaendert(t) else "frei"


def freigeben(db: Session, t: models.Team) -> list[str]:
    """Aktuelle Fassung nach aussen uebernehmen. Gibt nicht mehr benutzte Bild-URLs zurueck (zum Aufraeumen)."""
    alte_bilder = [getattr(t, "frei_" + f) for f in BILD_FELDER]
    alt_slug = t.frei_slug
    for f in AUFTRITT_FELDER:
        setattr(t, "frei_" + f, getattr(t, f))
    t.frei_am = _jetzt()
    t.freigabe = "frei"
    t.freigabe_notiz = None
    if alt_slug and alt_slug != t.slug:
        slug_merken(db, alt_slug, t.id)
    noch = {getattr(t, f) for f in BILD_FELDER} | {getattr(t, "frei_" + f) for f in BILD_FELDER}
    return [u for u in alte_bilder if u and u not in noch]


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
    medien = [u for u in {getattr(t, f) for f in BILD_FELDER} | {getattr(t, "frei_" + f) for f in BILD_FELDER} if u]
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
    # Festgehaltene Teamzugehoerigkeit und Teilnehmer: auch dort die Person heraus.
    for e in db.query(models.TeamEvent).filter(or_(models.TeamEvent.team_zuordnung_json.isnot(None),
                                                   models.TeamEvent.teilnehmer_json.isnot(None))).all():
        if e.team_zuordnung_json:
            z_ = _json.loads(e.team_zuordnung_json)
            if z_["mitglieder"].pop(str(uid), None) is not None:
                e.team_zuordnung_json = _json.dumps(z_)
        if e.teilnehmer_json:
            ids = _json.loads(e.teilnehmer_json)
            if uid in ids:
                e.teilnehmer_json = _json.dumps([i for i in ids if i != uid])
    db.flush()
    return medien


# ---------------------------------------------------------------------------- Bestenlisten ----

_cache: dict[tuple, tuple] = {}   # key -> (monotonic, wert, Wanduhr-Zeit der Rechnung)
_CACHE_S = 120
_CACHE_MAX = 500


def _cache_holen(key):
    t = _cache.get(key)
    if t is not None and time.monotonic() - t[0] < _CACHE_S:
        return t[1]
    return None


def _cache_stand(key) -> float | None:
    """Wann der Eintrag gerechnet wurde (Unix-Sekunden) — fuer „Stand: 14:32" auf der Event-Seite (06.11.2026)."""
    t = _cache.get(key)
    return t[2] if t is not None and len(t) > 2 else None


def _cache_setzen(key, wert):
    if len(_cache) >= _CACHE_MAX:
        _cache.clear()
    _cache[key] = (time.monotonic(), wert, time.time())


# Von Hand hochgeladene Dateien (api/sessions.py: „fit-" fuer FIT, „imp-" fuer GPX/TCX). Kontoverknuepfungen
# (suunto-/polar-/coros-/strava-) und Uhr-/App-Aufnahmen (Geraete-Token) sind KEINE Dateien in diesem Sinn: die kommen
# direkt vom Anbieter bzw. Geraet, der Nutzer kann sie nicht nachbauen. Jan, 01.11.2026: Events koennen Dateien
# ausschliessen, „aber einstellbar je event" — und Kontoverknuepfungen sollen weiter zaehlen.
DATEI_PRAEFIXE = ("fit-", "imp-")


ALLE = "alle"   # member_ids fuer globale Events: jeder, der passende Sessions hat (06.11.2026)


def strittige_sessions(db: Session) -> set[int]:
    """Sessions mit offener Meldung „nicht Pumpfoil" (Jan, 08.11.2026: „direkt bei der session in der bestenliste selber
    … in dispute"): gemeldet und noch nicht von einem Admin entschieden. Sie zaehlen, solange sie in der Wertung stehen,
    tragen in Bestenlisten aber den Vermerk `strittig`. Die Tabelle ist klein — jedes Mal frisch gelesen."""
    S, F = models.Session, models.SessionFlag
    return {sid for (sid,) in db.query(F.session_id).join(S, S.id == F.session_id).filter(
        S.deleted.isnot(True), S.pumpfoil_override.isnot(True),
        or_(S.sport_source.is_(None), S.sport_source != "admin"),
        # Hat der Besitzer nach der Meldung eine andere Sportart gewaehlt, ist die Meldung damit beantwortet.
        or_(S.sport_class.is_(None), S.sport_class == "pumpfoil")).distinct().all()}


def tafel_berechnen(db: Session, team: models.Team, tf: models.TeamTafel, period: str,
                    member_ids: list[int] | str | None = None, fenster: tuple[datetime, datetime] | None = None,
                    event_spots: list[int] | None = None, ohne_dateien: bool = False,
                    laenge: int | None = TAFEL_LAENGE, stand: list | None = None) -> list[dict]:
    """Rangliste einer Tafel: je Person der beste Wert bzw. die Summe, absteigend.

    `ohne_dateien` (Events, 01.11.2026): keine von Hand hochgeladenen Dateien (FIT/GPX/TCX, s. DATEI_PRAEFIXE).

    Events: `fenster` = [von, bis) statt des Zeitraums (Startzeit der Session zaehlt), `event_spots` = nur
    diese Spots (leer/None = alle).

    Liefert die VOLLE Zeile (mit Session, Datum, Spot) — was davon wer sehen darf, entscheidet der Aufrufer
    (`fuer_gast` streicht alles ausser Rang, Name, Initialen, Wert)."""
    from .api import community as C

    alle = member_ids == ALLE
    ids = [] if alle else (member_ids if member_ids is not None else mitglieder_ids(db, team.id))
    if (not alle and not ids) or tf.kennzahl not in EVENT_KENNZAHLEN:
        return []
    if event_spots:
        spot_ids, nur_spots = list(event_spots), True
    else:
        nur_spots = bool(tf.nur_teamspots)
        spot_ids = ([s for (s,) in db.query(models.TeamSpot.spot_id).filter_by(team_id=team.id).all()]
                    if nur_spots else [])
    key = (team.id, tf.id, tf.kennzahl, tf.sportart, tf.accel_only, tf.nur_brett, tf.foil_band,
           nur_spots, tuple(sorted(spot_ids)), period, fenster, ALLE if alle else tuple(sorted(ids)), ohne_dateien,
           laenge, tuple(sorted(global_aus(db))) if alle else ())
    hit = _cache_holen(key)
    if hit is not None:
        if stand is not None:
            stand.append(_cache_stand(key) or time.time())
        return hit
    if stand is not None:
        stand.append(time.time())

    S, U, AR = C.S, C.U, C.AR
    cut = C._cutoff(period)

    def filtern(q):
        q = C._band_filter(db, q, tf.foil_band, 0)
        if not alle:
            q = q.filter(S.user_id.in_(ids))
        else:
            aus = global_aus(db)
            if aus:
                q = q.filter(S.user_id.notin_(list(aus)))
        if fenster is not None:
            q = q.filter(S.started_at >= fenster[0], S.started_at < fenster[1])
        elif cut is not None:
            q = C._ab(q, cut, S.started_at)
        if tf.nur_brett:
            q = q.filter(S.placement == "board")
        if ohne_dateien:
            q = q.filter(*[~S.session_uuid.like(f"{p}%") for p in DATEI_PRAEFIXE])
        if nur_spots:
            if not spot_ids:
                return None
            q = q.filter(or_(*[C._spot_cond(str(s), db) for s in spot_ids]))
        return q

    out: list[dict] = []
    strittig = strittige_sessions(db)
    if tf.kennzahl in BEST or tf.kennzahl in SPRINT:
        valcol = _sprint_col(tf.kennzahl) if tf.kennzahl in SPRINT else C.REC_COL[tf.kennzahl][0]
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
                            "spot": spot, "tz": tz, **({"strittig": True} if sid in strittig else {})})
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
        # Summen: die Zeile ist strittig, sobald eine der mitgezaehlten Sessions es ist.
        strittige_nutzer: set[int] = set()
        if q is not None and strittig:
            qs = filtern(C._community(db.query(U.id), None, tf.accel_only, tf.sportart))
            if qs is not None:
                strittige_nutzer = {u for (u,) in qs.filter(S.id.in_(list(strittig))).distinct().all()}
        if q is not None:
            for uid, name, av, val in q.group_by(U.id, U.display_name, U.avatar_url).all():
                if val and float(val) > 0:
                    out.append({"user_id": uid, "name": name, "avatar_url": av,
                                "value": round(float(val), 2), **({"strittig": True} if uid in strittige_nutzer else {})})
    out.sort(key=lambda r: (-r["value"], r.get("started_at") or "", r["user_id"]))
    if laenge is not None:
        out = out[:laenge]
    # Nationalitaet -> Flagge im geteilten Bild (02.11.2026); Gaeste bekommen sie nicht (fuer_gast).
    laender = C._laender(db, {r["user_id"] for r in out})
    for i, r in enumerate(out):
        r["rang"] = i + 1
        r["initialen"] = initialen(r["name"])
        r["land"] = laender.get(r["user_id"])
    if sportmix.ist_mix(tf.sportart) and out:
        # Gemischte Bestenliste (app/sportmix.py): Abzeichen der Sportart je Zeile — beste Session: deren Sportart,
        # Summen: alle gefahrenen. Steht in der Zeile und wird mit eingefroren.
        nq = filtern(C._community(db.query(S.user_id, S.sport_class), None, tf.accel_only, tf.sportart))
        C.mix_abzeichen(db, tf.sportart, out, nq)
    _cache_setzen(key, out)
    return out


def fuer_gast(zeilen: list[dict]) -> list[dict]:
    """Ohne Login nur Rang, Anzeigename, Initialen, Wert (Jan, 31.10.2026). Bei globalen Events dazu die Wappen der
    Teams (`teams`) — dieselben, die auch Gaeste in der Team-Wertung sehen."""
    return [{"rang": r["rang"], "name": r["name"], "initialen": r["initialen"], "value": r["value"],
             **({"teams": r["teams"]} if "teams" in r else {}),
             **({"strittig": True} if r.get("strittig") else {}),
             **({"sportarten": r["sportarten"]} if r.get("sportarten") else {})} for r in zeilen]


def tafel_out(tf: models.TeamTafel) -> dict:
    return {"id": tf.id, "kennzahl": tf.kennzahl, "sportart": tf.sportart, "accel_only": tf.accel_only,
            "nur_brett": tf.nur_brett, "foil_band": tf.foil_band, "nur_teamspots": tf.nur_teamspots}


def tafeln(db: Session, team_id: int) -> list[models.TeamTafel]:
    T = models.TeamTafel
    return db.query(T).filter_by(team_id=team_id).order_by(T.reihenfolge, T.id).all()


STANDARD_TAFELN = ("session_pumps", "distance", "speed", "sum_pumps")


def anfrage_profil(db: Session, uid: int, spots_max: int = 10) -> dict:
    """Wo und was jemand bisher gefahren ist — fuer die Teamleitung beim Pruefen einer Beitrittsanfrage (Jan,
    01.11.2026). Nur Zaehlungen je Spot und Sportart aus den eigenen fertigen Sessions (dieselben Filter wie die
    Community: nicht geloescht/gemeldet/unklassifiziert/Datenmuell), keine Daten, keine Sessionliste. Wer anfragt,
    wird im Beitritts-Dialog darauf hingewiesen."""
    from sqlalchemy import func, or_
    S, Sp = models.Session, models.Spot
    basis = (db.query(S).filter(S.user_id == uid, S.deleted.isnot(True), S.flagged.isnot(True),
                                S.status.notin_(("recording", "live")), S.needs_classification.isnot(True),
                                or_(S.data_quality.is_(None), S.data_quality == "ok")))
    sport = func.coalesce(S.sport_class, "pumpfoil")
    sportarten = [{"sport": sp, "n": int(n)} for sp, n in
                  basis.with_entities(sport, func.count(S.id)).group_by(sport).order_by(func.count(S.id).desc()).all()]
    name = func.coalesce(Sp.name, S.place_name)
    spots = [{"name": nm, "n": int(n)} for nm, n in
             basis.outerjoin(Sp, Sp.id == S.spot_id).with_entities(name, func.count(S.id))
             .filter(name.isnot(None)).group_by(name).order_by(func.count(S.id).desc()).limit(spots_max).all()]
    return {"sessions": sum(x["n"] for x in sportarten), "sportarten": sportarten, "spots": spots}


def sportarten(db: Session, team_ids: list[int]) -> dict[int, list[str]]:
    """Welche Sportarten ein Team misst (Jan, 01.11.2026: Uebersicht und Community-Karte sollen „ganz kurz
    und knapp auflisten welche sportarten darin vorkommen"): die Sportarten seiner Bestenlisten, ohne Doppelte."""
    T = models.TeamTafel
    out: dict[int, list[str]] = {i: [] for i in team_ids}
    if not team_ids:
        return out
    for tid, sp in (db.query(T.team_id, T.sportart).filter(T.team_id.in_(team_ids))
                    .order_by(T.team_id, T.reihenfolge, T.id).all()):
        if sp not in out[tid]:
            out[tid].append(sp)
    return out


# -------------------------------------------------------------------------- Teamstatistik ----

def statistik(db: Session, team: models.Team, period: str, sportart: str = "pumpfoil") -> dict:
    """Teamsummen im Zeitraum (Jan, 31.10.2026: „teamsumme und stats sind super"): Sessions, Laeufe,
    Pumps, On-Foil-Strecke/-Zeit, Spots und wie viele Mitglieder aktiv waren; keine Rangliste Team gegen Team.
    Bewegungsdaten: „so wie eingestellt im Team" (Jan, 31.10.2026) — nur mit Bewegungsdaten, wenn ALLE
    Bestenlisten des Teams das verlangen, sonst auch Laeufe ohne (der Standard fuer neue Bestenlisten)."""
    from .api import community as C
    from . import pumpgleit_anzeige as PA

    ids = mitglieder_ids(db, team.id)
    leer = {"sessions": 0, "runs": 0, "pumps": 0, "distance_m": 0.0, "time_s": 0.0, "spots": 0, "aktive": 0,
            "mitglieder": len(ids)}
    if not ids:
        return leer
    tf_ = tafeln(db, team.id)
    accel_only = bool(tf_) and all(tf.accel_only for tf in tf_)
    key = ("statistik", team.id, period, sportart, accel_only, tuple(sorted(ids)))
    hit = _cache_holen(key)
    if hit is not None:
        return hit
    S, U, AR = C.S, C.U, C.AR
    q = C._community(db.query(
        func.count(S.id), func.coalesce(func.sum(AR.num_runs), 0), func.coalesce(func.sum(PA.col_pump_count()), 0),
        func.coalesce(func.sum(AR.foiling_distance_m), 0), func.coalesce(func.sum(AR.foiling_time_s), 0),
        func.count(func.distinct(S.spot_id)), func.count(func.distinct(S.user_id)),
    ), None, accel_only, sportart).filter(S.user_id.in_(ids))
    q = C._ab(q, C._cutoff(period), S.started_at)
    n, runs, pumps, dist, zeit, spots, aktive = q.one()
    out = {"sessions": int(n or 0), "runs": int(runs or 0), "pumps": int(pumps or 0),
           "distance_m": round(float(dist or 0), 1), "time_s": round(float(zeit or 0), 1),
           "spots": int(spots or 0), "aktive": int(aktive or 0), "mitglieder": len(ids)}
    _cache_setzen(key, out)
    return out


VERGLEICH_KENNZAHLEN = ("pumps", "distance_m", "time_s", "sessions", "runs")
VERGLEICH_TOP = (3, 5, 10)


def vergleich(db: Session, period: str, top: int, sportart: str = "pumpfoil") -> list[dict]:
    """Team-Bestenlisten (Jan, 03.11.2026: „leaderboards, aber eben nicht mit einzelpersonen sondern mit teams"):
    je Kennzahl die Summe der besten `top` Fahrer eines Teams — so gewinnt ein grosses Team nicht allein durch seine
    Groesse (Vorschlag u963, WOO Sports). Je Kennzahl zaehlen die jeweils besten N, nicht ueber alle dieselben.
    Nur freigegebene Teams mit oeffentlichen Bestenlisten (wer nur Mitgliedern zeigt, zeigt auch hier nichts) und fuer
    alle gleich gemessen: die eigenen Filter der Teams gelten nicht, Laeufe ohne Bewegungsdaten zaehlen mit.
    Mitglied in zwei Teams zaehlt fuer beide; Sessions vor dem Beitritt zaehlen wie in den Team-Tafeln."""
    from .api import community as C
    from . import pumpgleit_anzeige as PA

    key = ("vergleich", period, top, sportart)
    hit = _cache_holen(key)
    if hit is not None:
        return hit
    offiziell = offizielles_team_id(db)
    teams = [t for t in db.query(models.Team).filter(models.Team.frei_am.isnot(None),
                                                     models.Team.geloescht_am.is_(None)).all()
             if bestenlisten_oeffentlich(t) and t.id != offiziell]
    mitglieder = {t.id: mitglieder_ids(db, t.id) for t in teams}
    alle = sorted({u for ids in mitglieder.values() for u in ids})
    je_person: dict[int, dict] = {}
    if alle:
        S, AR = C.S, C.AR
        q = C._community(db.query(
            S.user_id, func.count(S.id), func.coalesce(func.sum(AR.num_runs), 0),
            func.coalesce(func.sum(PA.col_pump_count()), 0), func.coalesce(func.sum(AR.foiling_distance_m), 0),
            func.coalesce(func.sum(AR.foiling_time_s), 0),
        ), None, False, sportart).filter(S.user_id.in_(alle))
        q = C._ab(q, C._cutoff(period), S.started_at).group_by(S.user_id)
        for uid, n, runs, pumps, dist, zeit in q.all():
            je_person[uid] = {"sessions": int(n or 0), "runs": int(runs or 0), "pumps": int(pumps or 0),
                              "distance_m": float(dist or 0), "time_s": float(zeit or 0)}
        if sportmix.ist_mix(sportart):
            # Gemischte Ansicht (app/sportmix.py): welche Sportarten die Mitglieder gefahren sind -> Abzeichen am Team.
            nq = C._ab(C._community(db.query(S.user_id, S.sport_class), None, False, sportart)
                       .filter(S.user_id.in_(alle)), C._cutoff(period), S.started_at).distinct()
            for uid, sc in nq.all():
                if uid in je_person:
                    je_person[uid].setdefault("_sp", set()).add(sc or "pumpfoil")
    out = []
    for t in teams:
        werte = [je_person[u] for u in mitglieder[t.id] if u in je_person]
        if not werte:
            continue
        summe = {}
        for k in VERGLEICH_KENNZAHLEN:
            beste = sorted((w[k] for w in werte if w[k] > 0), reverse=True)[:top]
            summe[k] = round(sum(beste), 1) if k in ("distance_m", "time_s") else int(sum(beste))
            summe[f"{k}_fahrer"] = len(beste)
        a = auftritt(t, False)
        mix = {}
        if sportmix.ist_mix(sportart):
            gefahren = set().union(*(w.get("_sp", set()) for w in werte))
            mix = {"sportarten": [x for x in sportmix.teile(sportart) if x in gefahren]}
        out.append({"slug": a["slug"], "name": a["name"], "logo_url": a["logo_url"], "farbe": a["farbe"],
                    "land": a["land"], "mitglieder": len(mitglieder[t.id]), "aktive": len(werte), **summe, **mix})
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
    for t in db.query(models.Team).filter(models.Team.geloescht_am.is_(None)).all():
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
EVENT_VORSCHAU = timedelta(days=3)  # Community-Seite: kommende Events, die so bald beginnen (Jan, 01.11.2026)
EVENT_MAX_TAFELN = 10   # 6 -> 10 am 09.11.2026 (Jan: Ranglisten ans Limit gestossen), nach dem Einfrieren von Event 4
ABZEICHEN_PLAETZE = 3

# --- Globale Events (Jan, 06.11.2026) -------------------------------------------------------------------------------
# „ein neues 'global events' konzept, an dem automatisch jeder teilnimmt wenn er entsprechende stats sammelt, mit
# leaderboards, und auch einem eigenen leaderboard je team, aber ganz ohne teilnahme zusage". Gebaut als Option am
# Team-Event: angelegt im offiziellen Team (server/.env TEAM_GLOBAL=<slug>, Leitung und Moderatoren), gewertet wird
# JEDER mit passenden Sessions (wie die Community-Bestenlisten: ohne versteckte/gesperrte Konten), dazu je Kennzahl
# eine Team-Rangliste (Summe der besten N Mitglieder, `team_wertung_n`, 0 = alle; Mitglied in zwei Teams zaehlt fuer
# beide; nur Teams, die auch im Team-Vergleich stehen) und auf Wunsch die Zeilen nur eines Teams. Team-Events
# erscheinen seitdem NICHT mehr auf der Community-Seite (Jan: „team-interne events interessieren niemanden ausser den
# team-mitgliedern"), globale dort in einem eigenen Abschnitt. Das offizielle Team selbst taucht nirgends als Team auf.
TEAM_GLOBAL_ENV = "TEAM_GLOBAL"
WERTUNG_N_STANDARD = 5
GLOBAL_ZEILEN_MAX = 5000      # so viele Zeilen je Bestenliste werden fuer Team-Wertung und Team-Filter festgehalten


def offizielles_team_id(db: Session) -> int | None:
    import os
    slug = (os.environ.get(TEAM_GLOBAL_ENV) or "").strip().lower()
    if not slug:
        return None
    t, _umbenannt = finde(db, slug)
    return t.id if t is not None and t.geloescht_am is None else None


_GLOBAL_AUS = {"zeit": 0.0, "ids": frozenset()}


def global_aus(db: Session) -> frozenset:
    """Wer nicht an globalen Events teilnehmen will (Profil › Privatsphaere, settings.global_events_aus). 60 s gemerkt."""
    if time.time() - float(_GLOBAL_AUS["zeit"]) < 60:
        return _GLOBAL_AUS["ids"]
    ids = set()
    for uid, roh in db.query(models.User.id, models.User.settings_json).filter(
            models.User.settings_json.ilike("%global_events_aus%")).all():
        try:
            if json.loads(roh or "{}").get("global_events_aus"):
                ids.add(uid)
        except ValueError:
            continue
    _GLOBAL_AUS.update({"zeit": time.time(), "ids": frozenset(ids)})
    return _GLOBAL_AUS["ids"]


def ist_global(e: models.TeamEvent) -> bool:
    return bool(getattr(e, "global_event", False))


def wertung_n(e: models.TeamEvent) -> int:
    n = getattr(e, "team_wertung_n", None)
    return WERTUNG_N_STANDARD if n is None else max(0, int(n))


def team_zuordnung(db: Session, ausser_team_id: int | None = None) -> dict:
    """Wer jetzt fuer welches Team zaehlt — dieselben Teams wie im Team-Vergleich (freigegeben, Bestenlisten
    oeffentlich, nicht geloescht), ohne `ausser_team_id`. Mit dem freigegebenen Auftritt jedes Teams (Name, Logo,
    Farbe, Land), damit ein festgehaltener Stand auch spaetere Umbenennungen uebersteht.
    Form: {"mitglieder": {"<uid>": [team_id, ...]}, "teams": {"<team_id>": {slug, name, logo_url, farbe, land}}}"""
    M, Tm = models.TeamMitglied, models.Team
    mitglieder: dict[str, list[int]] = {}
    teams: dict[str, dict] = {}
    for t, uid in (db.query(Tm, M.user_id).join(M, M.team_id == Tm.id)
                   .filter(M.status == "aktiv", Tm.frei_am.isnot(None), Tm.geloescht_am.is_(None),
                           Tm.oeffentlich.is_(True)).order_by(Tm.id, M.user_id).all()):
        if t.id == ausser_team_id:
            continue
        mitglieder.setdefault(str(uid), []).append(t.id)
        if str(t.id) not in teams:
            a = auftritt(t, False)
            # banner_* seit 09.11.2026 (Siegertreppchen); aeltere festgehaltene Staende haben sie nicht.
            teams[str(t.id)] = {k: a[k] for k in ("slug", "name", "logo_url", "farbe", "land", "banner_url", "banner_fokus")}
    return {"mitglieder": mitglieder, "teams": teams}


def event_zuordnung(db: Session, e: models.TeamEvent) -> dict:
    """Teamzugehoerigkeit fuer ein globales Event: festgehalten zum Ende (`team_zuordnung_json`), sonst die aktuelle."""
    if e.team_zuordnung_json:
        return json.loads(e.team_zuordnung_json)
    return team_zuordnung(db, e.team_id)


def events_zuordnung_sichern(db: Session, jetzt: datetime | None = None) -> None:
    """VOR jeder Aenderung, die die Team-Wertung globaler Events verschiebt (Beitritt, Austritt, Entfernen, Annehmen,
    Freigabe, Sichtbarkeit, Land, Team loeschen): bei beendeten, noch nicht eingefrorenen globalen Events festhalten,
    wer fuer welches Team angetreten ist. Jan, 08.11.2026: „der snapshot muss alles snapshotten" — wer nach dem Ende
    das Team wechselt, zaehlt fuer das alte. Ohne Aenderung bis zum Einfrieren ist der Stand dort derselbe."""
    j = jetzt or _jetzt()
    E = models.TeamEvent
    offen = (db.query(E).filter(E.ende <= j, E.eingefroren_am.is_(None), E.geloescht_am.is_(None),
                                E.team_zuordnung_json.is_(None), E.global_event.is_(True)).all())
    for e in offen:
        e.team_zuordnung_json = json.dumps(team_zuordnung(db, e.team_id))


def team_wertung(db: Session, zeilen: list[dict], n: int, ausser_team_id: int | None,
                 zuordnung: dict | None = None, schnitt: bool = False) -> list[dict]:
    """Team-Rangliste einer Bestenliste: je Team die Summe der besten `n` Werte seiner Mitglieder (0 = alle).
    `schnitt` (Sprint-Kennzahlen, Jan 09.11.2026 „mach es so das es sinn ergibt"): Geschwindigkeiten addiert man nicht —
    dort zaehlt der Durchschnitt der besten `n` (ueber die tatsaechlich mitgezaehlten, `fahrer` steht daneben).
    Dieselben Teams wie im Team-Vergleich (freigegeben, Bestenlisten oeffentlich), ohne das offizielle Team.
    `zuordnung` (s. `team_zuordnung`): festgehaltener Stand statt der aktuellen Mitgliedschaft."""
    if not zeilen:
        return []
    z_ = zuordnung if zuordnung is not None else team_zuordnung(db, ausser_team_id)
    wert = {z["user_id"]: float(z["value"]) for z in zeilen}
    strittig = {z["user_id"] for z in zeilen if z.get("strittig")}
    sp_je = {z["user_id"]: z["sportarten"] for z in zeilen if z.get("sportarten")}   # gemischte Bestenliste
    je: dict[int, list[tuple[float, int]]] = {}
    # Mitglieder je Team zum festgehaltenen Stand (Siegertreppchen, 09.11.2026: „wie gross das team war").
    groesse: dict[str, int] = {}
    for tids in z_["mitglieder"].values():
        for tid in tids:
            groesse[str(tid)] = groesse.get(str(tid), 0) + 1
    for uid in wert:
        for tid in z_["mitglieder"].get(str(uid), []):
            if tid != ausser_team_id:
                je.setdefault(tid, []).append((wert[uid], uid))
    out = []
    for tid in je:
        werte = sorted(je[tid], reverse=True)
        beste = werte if n == 0 else werte[:n]
        a = z_["teams"][str(tid)]
        out.append({"slug": a["slug"], "name": a["name"], "logo_url": a["logo_url"], "farbe": a["farbe"],
                    "land": a["land"], "value": round(sum(v for v, _ in beste) / (len(beste) if schnitt else 1), 3 if schnitt else 2),
                    "fahrer": len(beste),
                    "teilnehmer": len(werte), "mitglieder": groesse.get(str(tid), len(werte)),
                    "banner_url": a.get("banner_url"), "banner_fokus": a.get("banner_fokus"),
                    # Strittig, sobald ein MITGEZAEHLTES Mitglied eine offene Meldung hat (Jan, 08.11.2026).
                    **({"strittig": True} if any(u in strittig for _, u in beste) else {}),
                    # Gemischte Bestenliste: die Sportarten der mitgezaehlten Fahrer als Abzeichen am Team (08.11.2026).
                    **({"sportarten": list(dict.fromkeys(sp for _, u in beste for sp in sp_je.get(u, [])))}
                       if sp_je else {})})
    out.sort(key=lambda x: (-x["value"], (x["name"] or "").lower()))
    for i, x in enumerate(out):
        x["rang"] = i + 1
    return out


def zeilen_teams(db: Session, uids: list[int], ausser_team_id: int | None,
                 zuordnung: dict | None = None) -> dict[int, list[dict]]:
    """Wappen je Person fuer die Bestenlisten globaler Events (Jan, 07.11.2026: „dritte spalte mit dem team-wappen …
    team-name als hover"). Dieselben Teams wie in `team_wertung`; `zuordnung` = festgehaltener Stand, sonst aktuell."""
    if not uids:
        return {}
    z_ = zuordnung if zuordnung is not None else team_zuordnung(db, ausser_team_id)
    out: dict[int, list[dict]] = {}
    for uid in uids:
        for tid in z_["mitglieder"].get(str(uid), []):
            if tid != ausser_team_id:
                a = z_["teams"][str(tid)]
                out.setdefault(uid, []).append({k: a[k] for k in ("slug", "name", "logo_url", "farbe")})
    return out


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


def event_tafeln_mit_mix(e: models.TeamEvent) -> list[models.TeamTafel]:
    """Bestenlisten eines Events samt gemischten (Jan, 08.11.2026): gibt es dieselbe Bestenliste (Kennzahl und Filter)
    fuer ALLE Teile einer angebotenen Mischung (app/sportmix.py — Pumpfoil und Foil Scoot je „Total distance"), kommt
    die Kombination als weitere Bestenliste direkt hinter die letzte ihrer Teile. Nicht gespeichert, aus den Tafeln
    abgeleitet; IDs -(Event-ID*100 + 50 + i), hinter denen der echten Tafeln."""
    tafeln_ = event_tafeln(e)
    filt = lambda x: (x.kennzahl, x.accel_only, x.nur_brett, x.foil_band)   # noqa: E731
    nach: dict[int, list[models.TeamTafel]] = {}   # Index der letzten Teil-Tafel -> Mischungen dahinter
    n = 0
    for m in sportmix.MIXE:
        teile = sportmix.teile(m)
        gesehen = set()
        for tf in tafeln_:
            k = filt(tf)
            if tf.sportart not in teile or k in gesehen:
                continue
            idx = [i for i, x in enumerate(tafeln_) if filt(x) == k and x.sportart in teile]
            if {tafeln_[i].sportart for i in idx} != set(teile):
                continue
            gesehen.add(k)
            nach.setdefault(max(idx), []).append(models.TeamTafel(
                id=-(e.id * 100 + 50 + n), team_id=e.team_id, kennzahl=tf.kennzahl, sportart=m,
                accel_only=tf.accel_only, nur_brett=tf.nur_brett, foil_band=tf.foil_band, nur_teamspots=False,
                reihenfolge=100 + n))
            n += 1
    out = []
    for i, tf in enumerate(tafeln_):
        out.append(tf)
        out.extend(nach.get(i, []))
    return out


def event_spots(e: models.TeamEvent) -> list[int]:
    return [int(i) for i in json.loads(e.spots_json or "[]")]


def event_teilnehmer(db: Session, t: models.Team, e: models.TeamEvent) -> list[int]:
    """Wer im Event zaehlt: bis zum Ende die aktuellen Mitglieder, danach die beim Ende festgehaltenen
    (`teilnehmer_json`, s. `events_teilnehmer_sichern`) — gesperrte Konten fallen trotzdem raus.
    Globale Events: jeder (ALLE)."""
    if ist_global(e):
        return ALLE
    if e.teilnehmer_json is None:
        return mitglieder_ids(db, t.id)
    ids = [int(i) for i in json.loads(e.teilnehmer_json)]
    if not ids:
        return []
    gesperrt = {u for (u,) in db.query(models.User.id).filter(models.User.id.in_(ids), models.User.blocked.is_(True))}
    return [i for i in ids if i not in gesperrt]


def events_teilnehmer_sichern(db: Session, team_id: int, jetzt: datetime | None = None) -> None:
    """VOR jeder Mitgliederaenderung aufrufen (Austritt, Entfernen, Beitritt, Annehmen): bei beendeten, noch nicht
    eingefrorenen Events die Teilnehmer festhalten. Jan, 01.11.2026: wer nach dem Event austritt, darf die
    Bestenlisten nicht mehr aendern — und wer danach beitritt, kommt nicht mehr hinein. Eingefrorene Events
    stehen ohnehin fest; nur die DSGVO-Loeschung nimmt dort noch Zeilen heraus."""
    j = jetzt or _jetzt()
    events_zuordnung_sichern(db, j)
    E = models.TeamEvent
    offen = (db.query(E).filter(E.team_id == team_id, E.ende <= j, E.eingefroren_am.is_(None),
                                E.geloescht_am.is_(None), E.teilnehmer_json.is_(None),
                                E.global_event.isnot(True)).all())
    if offen:
        ids = json.dumps(sorted(mitglieder_ids(db, team_id)))
        for e in offen:
            e.teilnehmer_json = ids


def _event_voll(db: Session, t: models.Team, e: models.TeamEvent) -> list[dict]:
    """Bestenlisten des Events — eingefroren aus `ergebnis_json`, sonst live. Bei globalen Events mit ALLEN Zeilen
    (bis GLOBAL_ZEILEN_MAX) und der Team-Rangliste je Bestenliste (`teams`); gekuerzt wird erst in `event_berechnen`."""
    if e.ergebnis_json:
        voll = json.loads(e.ergebnis_json)
        # Endstaende von vor dem 09.11.2026 haben keine Teamgroesse: aus der MIT festgehaltenen Zuordnung ergaenzen
        # (derselbe Stand wie das Ergebnis, nichts Aktuelles).
        if e.team_zuordnung_json and any("mitglieder" not in x for tf in voll for x in tf.get("teams") or []):
            z_ = json.loads(e.team_zuordnung_json)
            groesse: dict[str, int] = {}
            for tids in z_.get("mitglieder", {}).values():
                for tid in tids:
                    slug_ = (z_.get("teams", {}).get(str(tid)) or {}).get("slug")
                    if slug_:
                        groesse[slug_] = groesse.get(slug_, 0) + 1
            for tf in voll:
                for x in tf.get("teams") or []:
                    if "mitglieder" not in x and x.get("slug") in groesse:
                        x["mitglieder"] = groesse[x["slug"]]
        return voll
    ids = event_teilnehmer(db, t, e)
    glob = ist_global(e)
    zuordnung = event_zuordnung(db, e) if glob else None
    fenster = (_aware(e.start), _aware(e.ende))
    out = []
    zeiten: list[float] = []
    for tf in event_tafeln_mit_mix(e):
        zeilen = tafel_berechnen(db, t, tf, "all", ids, fenster=fenster, event_spots=event_spots(e),
                                 ohne_dateien=bool(e.ohne_dateien), laenge=GLOBAL_ZEILEN_MAX if glob else TAFEL_LAENGE,
                                 stand=zeiten)
        x = {**tafel_out(tf), "zeilen": zeilen}
        if glob:
            x["teams"] = team_wertung(db, zeilen, wertung_n(e), t.id, zuordnung, schnitt=tf.kennzahl in SPRINT)
        # Stand dieser Bestenliste: wann gerechnet (aus dem 2-Minuten-Cache ggf. etwas frueher).
        x["stand"] = datetime.fromtimestamp(min(zeiten[-1:] or [time.time()]), timezone.utc).isoformat()
        out.append(x)
    return out


def event_berechnen(db: Session, t: models.Team, e: models.TeamEvent, nur_team_ids: list[int] | None = None,
                    betrachter: int | None = None) -> list[dict]:
    """Bestenlisten fuer die Ausgabe: je Tafel hoechstens TAFEL_LAENGE Zeilen. `nur_team_ids` (globale Events, Filter
    „mein Team"): nur die Zeilen dieser Personen, mit ihrem Rang in der Gesamtwertung. `betrachter` (globale Events):
    seine eigene Zeile als `eigene`, auch wenn er weiter hinten steht (Anzeige Top 10 + man selbst, wie die Community)."""
    voll = _event_voll(db, t, e)
    if not ist_global(e):
        return voll
    erlaubt = set(nur_team_ids) if nur_team_ids is not None else None
    aus = global_aus(db)
    out = []
    for tf in voll:
        # Wer nach dem Einfrieren ausgestiegen ist (Profil-Schalter), fehlt auch im Endstand; Raenge rutschen nach.
        if e.ergebnis_json and aus:
            tf = {**tf, "zeilen": [{**z, "rang": i + 1} for i, z in enumerate(z for z in tf["zeilen"] if z["user_id"] not in aus)]}
        x = {**tf, "zeilen": [z for z in tf["zeilen"] if erlaubt is None or z["user_id"] in erlaubt][:TAFEL_LAENGE]}
        if betrachter is not None:
            x["eigene"] = next((z for z in tf["zeilen"] if z["user_id"] == betrachter), None)
        out.append(x)
    # Eingefroren: die Wappen stehen schon in der Zeile (beim Einfrieren aus der festgehaltenen Zuordnung).
    uids = sorted({z["user_id"] for x in out for z in x["zeilen"] + ([x["eigene"]] if x.get("eigene") else [])
                   if "teams" not in z})
    wappen = zeilen_teams(db, uids, t.id, event_zuordnung(db, e)) if uids else {}

    def mit(z: dict) -> dict:
        return z if "teams" in z else {**z, "teams": wappen.get(z["user_id"], [])}

    for x in out:
        x["zeilen"] = [mit(z) for z in x["zeilen"]]
        if x.get("eigene"):
            x["eigene"] = mit(x["eigene"])
    return out


def event_summen_auswahl(e: models.TeamEvent) -> list[str]:
    return [k for k in json.loads(e.summen_json or "[]") if k in EVENT_SUMMEN]


def event_summen(db: Session, t: models.Team, e: models.TeamEvent) -> dict:
    """Gesamtsummen ueber alle Teilnehmer — nur die angeklickten. Eingefroren aus `summen_ergebnis_json`.

    Dieselben Filter wie die Bestenlisten des Events (Zeitfenster, Spots, ohne Dateien); Sportart = die der
    ersten Bestenliste, Bewegungsdaten nur Pflicht, wenn ALLE Bestenlisten sie verlangen (wie `statistik`); ohne
    Bestenliste aus `summen_sportart`/`summen_accel_only`."""
    auswahl = event_summen_auswahl(e)
    if not auswahl:
        return {}
    if e.summen_ergebnis_json:
        fest = json.loads(e.summen_ergebnis_json)
        return {k: fest[k] for k in auswahl if k in fest}
    from .api import community as C
    from . import pumpgleit_anzeige as PA

    ids = event_teilnehmer(db, t, e)
    alle = ids == ALLE
    tf_ = event_tafeln(e)
    if tf_:
        sportart, accel_only = tf_[0].sportart, all(tf.accel_only for tf in tf_)
    else:   # Event nur mit Gesamtsummen: eigene Einstellung
        sportart, accel_only = e.summen_sportart or "pumpfoil", bool(e.summen_accel_only)
    spots = event_spots(e)
    fenster = (_aware(e.start), _aware(e.ende))
    leer = {k: 0 for k in auswahl}
    if not alle and not ids:
        return leer
    key = (t.id, "event_summen", e.id, sportart, accel_only, fenster, tuple(sorted(spots)), bool(e.ohne_dateien),
           ALLE if alle else tuple(sorted(ids)), tuple(sorted(global_aus(db))) if alle else ())
    hit = _cache_holen(key)
    if hit is None:
        S, AR = C.S, C.AR
        q = C._community(db.query(
            func.count(S.id), func.coalesce(func.sum(AR.num_runs), 0), func.coalesce(func.sum(PA.col_pump_count()), 0),
            func.coalesce(func.sum(AR.foiling_distance_m), 0), func.coalesce(func.sum(AR.foiling_time_s), 0),
            func.count(func.distinct(S.spot_id)), func.count(func.distinct(S.user_id)),
        ), None, accel_only, sportart).filter(S.started_at >= fenster[0], S.started_at < fenster[1])
        if not alle:
            q = q.filter(S.user_id.in_(ids))
        elif global_aus(db):
            q = q.filter(S.user_id.notin_(list(global_aus(db))))
        if e.ohne_dateien:
            q = q.filter(*[~S.session_uuid.like(f"{p}%") for p in DATEI_PRAEFIXE])
        if spots:
            q = q.filter(or_(*[C._spot_cond(str(s), db) for s in spots]))
        n, runs, pumps, dist, zeit, nspots, aktive = q.one()
        hit = {"sessions": int(n or 0), "runs": int(runs or 0), "pumps": int(pumps or 0),
               "distance_m": round(float(dist or 0), 1), "time_s": round(float(zeit or 0), 1),
               "spots": int(nspots or 0), "aktive": int(aktive or 0)}
        _cache_setzen(key, hit)
    return {k: hit[k] for k in auswahl}


def event_einfrieren(db: Session, e: models.TeamEvent, jetzt: datetime | None = None) -> bool:
    """Ergebnis festschreiben, sobald ende + EINFRIEREN_NACH vorbei ist. True = gerade eingefroren."""
    j = jetzt or _jetzt()
    if e.eingefroren_am is not None or j < _aware(e.ende) + EINFRIEREN_NACH:
        return False
    t = db.get(models.Team, e.team_id)
    if t is None or t.geloescht_am is not None:
        return False
    # Frisch rechnen, nicht aus dem 2-Minuten-Cache.
    for k in [k for k in _cache if k and k[0] == t.id]:
        _cache.pop(k, None)
    if ist_global(e) and not e.team_zuordnung_json:
        e.team_zuordnung_json = json.dumps(team_zuordnung(db, e.team_id))   # keine Aenderung seit dem Ende
    voll = _event_voll(db, t, e)
    if ist_global(e):
        # Wappen je Zeile mit festschreiben (sonst kaemen sie beim Abruf aus der aktuellen Mitgliedschaft).
        z_ = json.loads(e.team_zuordnung_json)
        for tf in voll:
            w = zeilen_teams(db, [z["user_id"] for z in tf["zeilen"]], t.id, z_)
            tf["zeilen"] = [{**z, "teams": w.get(z["user_id"], [])} for z in tf["zeilen"]]
    # Spots des Events mit Namen (Umbenennungen spaeter aendern den Endstand nicht).
    ids = event_spots(e)
    e.spots_fest_json = json.dumps([{"id": i, "name": n} for i, n in db.query(models.Spot.id, models.Spot.name)
                                    .filter(models.Spot.id.in_(ids)).all()] if ids else [])
    e.ergebnis_json = json.dumps(voll)
    if event_summen_auswahl(e):
        e.summen_ergebnis_json = json.dumps(event_summen(db, t, e))
    e.eingefroren_am = j
    return True


def events_einfrieren(db: Session) -> int:
    """Naechtlich (record_snapshot.py) und beim Abruf: alle faelligen Events festschreiben."""
    n = 0
    grenze = _jetzt() - EINFRIEREN_NACH
    events_zuordnung_sichern(db)
    for e in db.query(models.TeamEvent).filter(models.TeamEvent.eingefroren_am.is_(None),
                                               models.TeamEvent.geloescht_am.is_(None),
                                               models.TeamEvent.ende <= grenze).all():
        n += event_einfrieren(db, e)
    db.commit()
    return n


def event_out(db: Session, t: models.Team, e: models.TeamEvent, gast: bool = False,
              nur_team_ids: list[int] | None = None, betrachter: int | None = None, mix: bool = False,
              sprint: bool = False) -> dict:
    tafeln_ = event_berechnen(db, t, e, nur_team_ids, None if gast else betrachter)
    if not sprint:
        # Sprint-Bestenlisten (09.11.2026) wie die gemischten nur fuer Clients, die sie kennen (`?sprint=1`).
        tafeln_ = [tf for tf in tafeln_ if tf.get("kennzahl") not in SPRINT]
    if not mix:
        # Gemischte Bestenlisten (08.11.2026) nur fuer Clients, die sie kennen (`?mix=1`, Web) — die Apps zeigten den
        # Schluessel „pumpfoil+foil_scoot" sonst roh.
        tafeln_ = [tf for tf in tafeln_ if not sportmix.ist_mix(tf.get("sportart"))]
    if gast:
        tafeln_ = [{**tf, "zeilen": fuer_gast(tf["zeilen"])} for tf in tafeln_]
    spots = []
    if not gast:
        ids = event_spots(e)
        if e.spots_fest_json is not None:
            spots = json.loads(e.spots_fest_json)
        elif ids:
            spots = [{"id": i, "name": n} for i, n in db.query(models.Spot.id, models.Spot.name)
                     .filter(models.Spot.id.in_(ids)).all()]
    return {"id": e.id, "titel": e.titel, "beschreibung": e.beschreibung, "start": _aware(e.start).isoformat(),
            "ende": _aware(e.ende).isoformat(), "zeitzone": e.zeitzone, "vorlage": e.vorlage,
            "status": event_status(e), "spots": spots, "ohne_dateien": bool(e.ohne_dateien),
            "teambild_zeigen": e.teambild_zeigen is not False, "spot_ids": [] if gast else event_spots(e),
            "einfrieren_am": (_aware(e.ende) + EINFRIEREN_NACH).isoformat(), "tafeln": tafeln_,
            # Nur Summen, keine Namen — darum auch fuer Gaeste.
            "summen_auswahl": event_summen_auswahl(e), "summen": event_summen(db, t, e),
            "summen_sportart": e.summen_sportart or "pumpfoil", "summen_accel_only": bool(e.summen_accel_only),
            # Eventbild auch fuer Gaeste, OHNE Freigabe (anders als das Teambild) — Jan, 01.11.2026: „das risiko gehe
            # ich erstmal ein". Titel und Beschreibung von Events sind ebenso ohne Freigabe oeffentlich.
            "banner_url": e.banner_url, "banner_fokus": e.banner_fokus,
            "global": ist_global(e), "team_wertung_n": wertung_n(e)}


def events_liste(db: Session, team_id: int, beendete: int = 10) -> list[models.TeamEvent]:
    """Laufende, in Auswertung und kommende Events, dazu die letzten `beendete` eingefrorenen."""
    E = models.TeamEvent
    offen = (db.query(E).filter(E.team_id == team_id, E.eingefroren_am.is_(None), E.geloescht_am.is_(None))
             .order_by(E.start).all())
    alt = (db.query(E).filter(E.team_id == team_id, E.eingefroren_am.isnot(None), E.geloescht_am.is_(None))
           .order_by(E.ende.desc()).limit(beendete).all())
    return offen + alt


def abzeichen(db: Session, uid: int) -> list[dict]:
    """Event-Abzeichen fuer die Foiler-Seite: Plaetze 1–3 eingefrorener Events. NUR Teams mit freigegebenem
    Auftritt und dann deren freigegebener Name — ein internes Team wuerde sonst ueber die Foiler-Seite
    bekannt (Name und Mitgliedschaft)."""
    out = []
    E, Tm = models.TeamEvent, models.Team
    for e, t in (db.query(E, Tm).join(Tm, Tm.id == E.team_id)
                 .filter(E.eingefroren_am.isnot(None), E.geloescht_am.is_(None), Tm.frei_am.isnot(None),
                         Tm.geloescht_am.is_(None))
                 .order_by(E.ende.desc()).limit(500).all()):
        if ist_global(e) and uid in global_aus(db):
            continue
        for tf in json.loads(e.ergebnis_json or "[]"):
            for z in tf.get("zeilen", [])[:ABZEICHEN_PLAETZE]:
                if z.get("user_id") == uid:
                    out.append({"rang": z["rang"], "event": e.titel, "team": t.frei_name, "team_slug": t.frei_slug,
                                "farbe": t.frei_farbe, "kennzahl": tf["kennzahl"], "sportart": tf.get("sportart"), "wert": z["value"],
                                "datum": _aware(e.ende).date().isoformat(), "global": ist_global(e),
                                "event_id": e.id})
    return out[:30]
