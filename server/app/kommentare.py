"""Kommentare zu Sessions (Jan, 02.11.2026) — auf der Chat-Technik, Raum `session:<id>`.

Der Chat war von Anfang an fuer Session-Raeume gebaut (Antworten, Likes, Fotos, Melden, Sperren, Rate-Limits),
in der Oberflaeche aber ausgeblendet. Kommentare nutzen genau das; hier stehen nur die Regeln, die fuer
Session-Raeume dazukommen (Entscheidungen Jan 02.11.2026):
  · kommentieren duerfen alle Angemeldeten (Sessions sind fuer alle Angemeldeten sichtbar);
  · der Inhaber kann Kommentare fuer seine Sessions im Profil abschalten (`comments_off`) — dann sind sie
    fuer alle ausgeblendet, auch bereits geschriebene, und es geht nichts Neues hinzu;
  · wen der Inhaber gesperrt hat (oder wer ihn), kommentiert dort nicht;
  · der Inhaber darf fremde Kommentare unter seiner Session loeschen (Hausrecht);
  · Push nur an den Inhaber, abschaltbar (Typ „comment"), nicht an alle Mitschreibenden.
Geloescht werden die Kommentare mit der Session erst beim harten Loeschen (Konto, Admin); das weiche Loeschen
blendet die Session samt Kommentaren aus.
"""
from __future__ import annotations

import json

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import models

PRAEFIX = "session:"


def scope(session_id: int) -> str:
    return f"{PRAEFIX}{session_id}"


def session_id(sc: str) -> int | None:
    if not sc.startswith(PRAEFIX):
        return None
    try:
        return int(sc[len(PRAEFIX):])
    except ValueError:
        return None


def aus(user: models.User | None) -> bool:
    """Hat der Inhaber Kommentare fuer seine Sessions abgeschaltet?"""
    if user is None or not user.settings_json:
        return False
    try:
        return bool((json.loads(user.settings_json) or {}).get("comments_off"))
    except ValueError:
        return False


def session_fuer(db: Session, sc: str) -> models.Session | None:
    """Die Session eines Kommentar-Raums, sofern es sie (noch) gibt."""
    sid = session_id(sc)
    if sid is None:
        return None
    s = db.get(models.Session, sid)
    if s is None or s.deleted:
        return None
    return s


def anzahl(db: Session, session_ids: list[int], viewer: models.User) -> dict[int, int]:
    """{session_id: sichtbare Kommentare} in einem Rutsch — ohne ausgeblendete Nachrichten und ohne die
    versteckter Testkonten (ausser den eigenen), wie die Liste selbst. Abgeschaltete Inhaber zaehlen 0."""
    if not session_ids:
        return {}
    scopes = {scope(i): i for i in session_ids}
    q = (db.query(models.ChatMessage.scope, func.count())
         .join(models.User, models.ChatMessage.user_id == models.User.id)
         .filter(models.ChatMessage.scope.in_(list(scopes)), models.ChatMessage.hidden.isnot(True),
                 or_(models.User.hidden.isnot(True), models.User.id == viewer.id))
         .group_by(models.ChatMessage.scope))
    out = {scopes[sc]: int(n) for sc, n in q.all()}
    if out:
        owner = dict(db.query(models.Session.id, models.Session.user_id)
                     .filter(models.Session.id.in_(list(out))).all())
        abgeschaltet = {u.id for u in db.query(models.User).filter(models.User.id.in_(set(owner.values()))).all()
                        if aus(u)}
        out = {sid: n for sid, n in out.items() if owner.get(sid) not in abgeschaltet}
    return out


def raum_loeschen(db: Session, sc: str) -> list[str]:
    """Alle Nachrichten eines Raums samt Bildern, Likes, Meldungen und Raum-Zustaenden entfernen.
    Gibt die Bild-URLs zurueck — die Dateien loescht der Aufrufer NACH dem Commit."""
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
