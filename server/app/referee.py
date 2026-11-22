"""Referee Board (Jan, 16.11.2026): Laeufe aus der Wertung eines Events nehmen — kontrolliert, nachvollziehbar, oeffentlich.

Jan: „vernuenftig und uebersichtlich und mit kontrollierten schritten … damit man nicht einfach etwas festlegt und oeffentlich
bekannt gibt ohne bestaetigung und kontrolle". Darum ein Statusablauf (models.EventKorrektur):

    entwurf ──> offen ──> veroeffentlicht ──> aufgehoben
       ^          │  └──> abgelehnt
       └──────────┘

* entwurf: nur Referees sehen sie, keine Wirkung, frei aenderbar.
* offen („zur Pruefung"): zur Diskussion gestellt (interne Kommentare), Felder noch aenderbar.
* veroeffentlicht: nur aus „offen" und mit ausdruecklicher Bestaetigung (Dialog zeigt, was oeffentlich wird). EIN Referee
  reicht (Jan, 16.11.2026: „wir haben keine 2 referees derzeit, ich muss das alleine koennen … die team-admins & moderatoren
  genauso"); wer bestaetigt hat, steht im Protokoll. Erst jetzt nimmt die Wertung den Lauf heraus, die Korrektur steht
  oeffentlich am Event (Grund + oeffentlicher Kommentar, nie die interne Notiz) und der Fahrer bekommt eine Nachricht.
* abgelehnt / aufgehoben: bleiben im Protokoll; aufgehoben steht auch oeffentlich (der Lauf zaehlt wieder).

Wer ist Referee? Team-Events: Leiter und Moderatoren des ausrichtenden Teams; globale Events: Admins. Admins duerfen immer.
Zeitrahmen: Aenderungen mit Wirkung (veroeffentlichen/aufheben) bis 24 h nach dem Festschreiben; danach steht der Endstand.
Ist das Event schon festgeschrieben, wird der Endstand bei jeder Veroeffentlichung/Aufhebung neu geschrieben.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from . import models

log = logging.getLogger("referee")

GRUENDE = ("andere_sportart", "messfehler", "doppelte_aufnahme", "fremdkraft", "ausserhalb_fenster", "sonstiges")
STATUS = ("entwurf", "offen", "veroeffentlicht", "abgelehnt", "aufgehoben")
UEBERGAENGE = {
    "entwurf": ("offen", "abgelehnt"),       # Entwurf direkt verwerfen (16.11.2026)
    "offen": ("entwurf", "veroeffentlicht", "abgelehnt"),
    "veroeffentlicht": ("aufgehoben",),
    "abgelehnt": (),
    "aufgehoben": (),
}
FRIST_NACH_FESTSCHREIBEN = timedelta(hours=24)
TOLERANZ_MS = 3000           # Laufstart nach einer Neuauswertung (A5 verlaengert Laeufe um <= 2 Punkte)
KANDIDATEN_JE_TAFEL = 20


def push_aus(e: models.TeamEvent) -> bool:
    """Test-Events ohne Push (Env REFEREE_PUSH_AUS = Event-IDs, kommagetrennt). Jan, 16.11.2026: Durchlauf mit echten
    Team-Mitgliedern als Testern — sie sollen dabei keine Nachrichten bekommen."""
    import os
    return str(e.id) in {x.strip() for x in (os.environ.get("REFEREE_PUSH_AUS") or "").split(",") if x.strip()}


def _jetzt() -> datetime:
    return datetime.now(timezone.utc)


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def referee_ids(db: Session, t: models.Team, e: models.TeamEvent) -> set[int]:
    from . import teams as T
    admins = {u for (u,) in db.query(models.User.id).filter(models.User.is_admin.is_(True), models.User.blocked.isnot(True))}
    M = models.TeamMitglied

    def leitung(tid):
        return {u for (u,) in db.query(M.user_id).filter(M.team_id == tid, M.status == "aktiv",
                                                         M.rolle.in_(("leiter", "moderator")))} if tid else set()
    if T.ist_global(e):
        # Globale Events (Jan, 16.11.2026): Admins + Leitung/Moderation des offiziellen Teams (= globale Moderatoren) +
        # bei einem vorgeschlagenen Event das ausrichtende Team.
        og = T.offizielles_team_id(db)
        return admins | leitung(og) | (leitung(t.id) if t.id != og else set())
    return leitung(t.id) | admins


def darf(db: Session, user: models.User, t: models.Team, e: models.TeamEvent) -> bool:
    return bool(user.is_admin) or user.id in referee_ids(db, t, e)


def frist_bis(e: models.TeamEvent) -> datetime | None:
    """Bis wann Korrekturen wirken duerfen; None = Event noch nicht festgeschrieben (laeuft/Auswertung)."""
    return _aware(e.eingefroren_am) + FRIST_NACH_FESTSCHREIBEN if e.eingefroren_am else None


def wirkung_erlaubt(e: models.TeamEvent) -> bool:
    f = frist_bis(e)
    return f is None or _jetzt() <= f


def ausgenommen(db: Session, e: models.TeamEvent) -> frozenset:
    """Veroeffentlichte Korrekturen des Events -> {(session_id, lauf_start_ms)}."""
    K = models.EventKorrektur
    return frozenset((sid, int(ms)) for sid, ms in
                     db.query(K.session_id, K.lauf_start_ms).filter(K.event_id == e.id, K.status == "veroeffentlicht"))


def ist_ausgenommen(aus: frozenset | None, session_id: int, lauf_start_ms: float) -> bool:
    if not aus:
        return False
    return any(sid == session_id and abs(ms - lauf_start_ms) <= TOLERANZ_MS for sid, ms in aus)


# ---------------------------------------------------------------------------------------- Teilnehmer melden ----
# Jan, 16.11.2026: wer in der Wertung steht, darf Laeufe ANDERER zur Pruefung markieren — als Entwurf im Board, nur einmal je
# Lauf (gibt es schon irgendeine Korrektur dazu, ist er gesperrt), nur bis zum Festschreiben (Ende + 4 h; die 24 h danach
# gehoeren den Referees), hoechstens MELDUNGEN_MAX je Teilnehmer und Event.
MELDUNGEN_MAX = 10


def melden_offen(e: models.TeamEvent) -> bool:
    from . import teams as T
    return e.eingefroren_am is None and _jetzt() < _aware(e.ende) + T.EINFRIEREN_NACH


def in_wertung(db: Session, t: models.Team, e: models.TeamEvent, uid: int) -> bool:
    from . import teams as T
    return any(z.get("user_id") == uid for tf in T._event_voll(db, t, e) for z in tf.get("zeilen") or [])


def gemeldete(db: Session, e: models.TeamEvent, nur_offen: bool = False) -> list[list[int]]:
    """[[session_id, run_idx]] der Laeufe mit einer Korrektur. Alle Status = gesperrt fuer weitere Meldungen;
    `nur_offen` (entwurf/offen) = „wird geprueft" an der Zeile."""
    K = models.EventKorrektur
    out = []
    q = db.query(K).filter(K.event_id == e.id)
    if nur_offen:
        q = q.filter(K.status.in_(("entwurf", "offen")))
    for k in q.all():
        idx = korrektur_out(db, k, intern=False).get("run_idx")
        if idx is not None:
            out.append([k.session_id, idx])
    return out


def referees_benachrichtigen(db: Session, t: models.Team, e: models.TeamEvent, ausser: int) -> None:
    from .push import push_enabled, send_push
    try:
        if not push_enabled() or push_aus(e):
            return
        from .push import wants
        for uid in referee_ids(db, t, e) - {ausser}:
            if not wants(db, uid, "referee"):   # eigener Schalter im Profil (Jan 22.11.2026)
                continue
            u = db.get(models.User, uid)
            de = ((getattr(u, "language", None) or "en").lower()).startswith(("de", "gsw"))
            send_push(db, uid, "Pumpfoil", (f"Neue Prüfbitte im Referee Board: „{e.titel}“" if de
                                            else f"New review request in the referee board: “{e.titel}”"),
                      f"/teams/{t.slug}/events/{e.id}/referee")
    except Exception:  # noqa: BLE001
        log.exception("Referee-Hinweis Event %s", e.id)


# ------------------------------------------------------------------------------------------------- Ausgabe ----

def korrektur_out(db: Session, k: models.EventKorrektur, intern: bool) -> dict:
    namen = {}
    for uid in {k.user_id, k.erstellt_von, k.bestaetigt_von, k.abgeschlossen_von} - {None}:
        u = db.get(models.User, uid)
        namen[uid] = (u.display_name if u else None) or f"#{uid}"
    out = {"id": k.id, "status": k.status, "session_id": k.session_id, "user_id": k.user_id, "fahrer": namen.get(k.user_id),
           "lauf_start_ms": k.lauf_start_ms, "grund": k.grund, "kommentar_oeffentlich": k.kommentar_oeffentlich,
           "veroeffentlicht_am": k.veroeffentlicht_am.isoformat() if k.veroeffentlicht_am else None,
           "abgeschlossen_am": k.abgeschlossen_am.isoformat() if k.abgeschlossen_am else None,
           "bearbeitet_am": k.bearbeitet_am.isoformat() if k.bearbeitet_am else None,
           "wirkung": json.loads(k.wirkung_json) if k.wirkung_json else None}
    s = db.get(models.Session, k.session_id)
    if s is not None:
        try:
            segs = json.loads(s.result.segments_json or "[]") if s.result else []
        except ValueError:
            segs = []
        from .event_laeufe import lauf_ms
        trim = int(s.trim_start_ms or 0)
        idx = next((i for i, g in enumerate(segs) if lauf_ms(g, trim) is not None
                    and abs(lauf_ms(g, trim)[0] - k.lauf_start_ms) <= TOLERANZ_MS), None)
        out["run_idx"] = idx
    if intern:
        out.update({"notiz_intern": k.notiz_intern, "erstellt_von": namen.get(k.erstellt_von),
                    "von_teilnehmer": bool(k.von_teilnehmer),
                    "erstellt_von_id": k.erstellt_von, "erstellt_am": k.erstellt_am.isoformat() if k.erstellt_am else None,
                    "bestaetigt_von": namen.get(k.bestaetigt_von) if k.bestaetigt_von else None,
                    "abgeschlossen_von": namen.get(k.abgeschlossen_von) if k.abgeschlossen_von else None,
                    "kommentare": [{"id": c.id, "von": (db.get(models.User, c.user_id).display_name
                                                        if db.get(models.User, c.user_id) else f"#{c.user_id}"),
                                    "user_id": c.user_id, "text": c.text, "am": c.am.isoformat()}
                                   for c in db.query(models.EventKorrekturKommentar)
                                   .filter_by(korrektur_id=k.id).order_by(models.EventKorrekturKommentar.id)]})
    return out


def oeffentlich(db: Session, e: models.TeamEvent) -> list[dict]:
    """Fuer die Event-Seite: veroeffentlichte und aufgehobene Korrekturen, ohne interne Felder."""
    K = models.EventKorrektur
    rows = (db.query(K).filter(K.event_id == e.id, K.status.in_(("veroeffentlicht", "aufgehoben")))
            .order_by(K.veroeffentlicht_am.desc()).all())
    return [korrektur_out(db, k, intern=False) for k in rows]


def kandidaten(db: Session, t: models.Team, e: models.TeamEvent) -> list[dict]:
    """Je Bestenliste (ohne gemischte) die ersten KANDIDATEN_JE_TAFEL Zeilen mit ihrem gewerteten Lauf und Auffaelligkeiten."""
    from . import sportmix, teams as T
    voll = T._event_voll(db, t, e)
    strittig = T.strittige_sessions(db)
    out = []
    for tf in voll:
        if sportmix.ist_mix(tf.get("sportart")):
            continue
        zeilen = tf.get("zeilen") or []
        for i, z in enumerate(zeilen[:KANDIDATEN_JE_TAFEL]):
            sid, k = z.get("session_id"), z.get("run_idx")
            eintrag = {"kennzahl": tf.get("kennzahl"), "sportart": tf.get("sportart"), "rang": z.get("rang"),
                       "user_id": z.get("user_id"), "name": z.get("name"), "value": z.get("value"),
                       "session_id": sid, "run_idx": k, "hinweise": []}
            s = db.get(models.Session, sid) if sid else None
            if s is not None and s.result is not None and k is not None:
                try:
                    segs = json.loads(s.result.segments_json or "[]")
                except ValueError:
                    segs = []
                if 0 <= k < len(segs):
                    g = segs[k]
                    from .event_laeufe import lauf_ms
                    ab = lauf_ms(g, int(s.trim_start_ms or 0))
                    if ab is None:
                        out.append(eintrag)
                        continue
                    eintrag["lauf_start_ms"] = int(ab[0])
                    beginn = _aware(s.started_at) + timedelta(milliseconds=eintrag["lauf_start_ms"])
                    if beginn >= _aware(e.ende) - timedelta(minutes=10):
                        eintrag["hinweise"].append("kurz_vor_schluss")
            if sid in strittig:
                eintrag["hinweise"].append("gemeldet")
            if s is not None and (s.sport_class or "pumpfoil") != (tf.get("sportart") or "pumpfoil"):
                eintrag["hinweise"].append("andere_sportart")
            if i == 0 and len(zeilen) > 1 and float(zeilen[1].get("value") or 0) > 0 \
                    and float(z.get("value") or 0) > 1.08 * float(zeilen[1]["value"]):
                eintrag["hinweise"].append("deutlich_vorn")
            out.append(eintrag)
    return out


# --------------------------------------------------------------------------------------------- Wirkung ----

def werte_des_fahrers(db: Session, t: models.Team, e: models.TeamEvent, uid: int, frisch: bool) -> dict:
    from . import sportmix, teams as T
    for key in [key for key in T._cache if key and key[0] == t.id]:
        T._cache.pop(key, None)
    out = {}
    for tf in T._event_voll(db, t, e, frisch=frisch):
        if sportmix.ist_mix(tf.get("sportart")):
            continue
        z = next((z for z in tf.get("zeilen") or [] if z.get("user_id") == uid), None)
        out[f"{tf.get('kennzahl')}|{tf.get('sportart')}"] = ({"rang": z.get("rang"), "value": z.get("value")} if z else None)
    return out


def neu_festschreiben(db: Session, t: models.Team, e: models.TeamEvent) -> None:
    """Festgeschriebenes Event nach einer Korrektur neu festschreiben — Festschreib-Zeitpunkt (und damit die Frist) bleibt."""
    from . import teams as T
    if e.eingefroren_am is None:
        return
    alt = e.eingefroren_am
    e.ergebnis_json = None
    e.summen_ergebnis_json = None
    e.eingefroren_am = None
    T.event_einfrieren(db, e, jetzt=_aware(e.ende) + T.EINFRIEREN_NACH + timedelta(seconds=1))
    e.eingefroren_am = alt


def benachrichtigen(db: Session, k: models.EventKorrektur, e: models.TeamEvent, t: models.Team) -> None:
    from .push import push_enabled, send_push
    try:
        if not push_enabled() or push_aus(e):
            return
        u = db.get(models.User, k.user_id)
        de = ((getattr(u, "language", None) or "en").lower()).startswith(("de", "gsw"))
        if k.status == "veroeffentlicht":
            text = (f"Ein Referee hat einen deiner Laeufe aus der Wertung von „{e.titel}“ genommen."
                    if de else f"A referee removed one of your runs from the ranking of “{e.titel}”.")
        else:
            text = (f"Eine Korrektur in „{e.titel}“ wurde aufgehoben, dein Lauf zaehlt wieder."
                    if de else f"A correction in “{e.titel}” was withdrawn, your run counts again.")
        send_push(db, k.user_id, "Pumpfoil", text, f"/teams/{t.slug}/events/{e.id}")
    except Exception:  # noqa: BLE001 — eine Nachricht darf nie den Ablauf brechen
        log.exception("Referee-Benachrichtigung %s", k.id)
