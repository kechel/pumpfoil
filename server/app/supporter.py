"""Supporter-Badge („Welle + Herz", brand/badges/supporter.svg) — wer uns in den letzten 4 Wochen geholfen hat.

Jan, 23.10.2026: „das moechte ich jedem der uns feedback gegeben hat in irgendeiner art dann fuer einen monat
lang anzeigen … fuer ganz fleissige feedback-geber koennte man dann die farbe noch aendern in 3 stufen".
Grundlage ist models.FeedbackBeitrag (alle Quellen, s. scripts/feedback-beitraege.py).

  sichtbar   letzter Beitrag juenger als FENSTER_TAGE
  stufe      nach der Zahl der BEITRAGSTAGE im letzten Jahr (ein Tag mit fuenf Nachrichten zaehlt einmal):
             1 ab 1 Tag, 2 ab STUFE2 Tagen, 3 ab STUFE3 Tagen
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from . import models

FENSTER_TAGE = 28
JAHR_TAGE = 365
STUFE2, STUFE3 = 5, 15


def stufe_fuer(tage: int) -> int:
    return 3 if tage >= STUFE3 else 2 if tage >= STUFE2 else 1 if tage >= 1 else 0


def uebersicht(db, user_ids: list[int] | None = None) -> dict[int, dict]:
    """{user_id: {tage_jahr, beitraege, zuletzt, sichtbar, stufe}} — fuer Admin-Liste und Badge-Abfrage."""
    B = models.FeedbackBeitrag
    jetzt = datetime.now(timezone.utc)
    q = db.query(B.user_id, func.count(B.id), func.max(B.at),
                 func.count(func.distinct(func.date(B.at))).filter(B.at >= jetzt - timedelta(days=JAHR_TAGE)))
    if user_ids is not None:
        q = q.filter(B.user_id.in_(user_ids))
    out = {}
    for uid, n, zuletzt, tage in q.group_by(B.user_id).all():
        sichtbar = zuletzt is not None and zuletzt >= jetzt - timedelta(days=FENSTER_TAGE)
        out[uid] = {"tage_jahr": tage, "beitraege": n, "zuletzt": zuletzt, "sichtbar": sichtbar,
                    "stufe": stufe_fuer(tage) if sichtbar else 0}
    return out


def merke(db, user, quelle: str, ref: str, notiz: str | None = None, at: datetime | None = None) -> None:
    """Beitrag sofort festhalten (Feedback-Formular, Bewertung — Jan 23.10.2026: „session-rating soll auch
    mitzaehlen automatisch"). Gleiche quelle+ref wie scripts/feedback-beitraege.py, also kein Doppel.
    Admins (Jan) und versteckte Konten (Testkonten) zaehlen nicht. Committet NICHT."""
    if user is None or getattr(user, "is_admin", False) or getattr(user, "hidden", False):
        return
    B = models.FeedbackBeitrag
    if db.query(B.id).filter_by(quelle=quelle, ref=str(ref)[:80]).first() is not None:
        return
    db.add(B(user_id=user.id, quelle=quelle, ref=str(ref)[:80], at=at or datetime.now(timezone.utc),
             notiz=(notiz or "")[:300] or None))
