"""Supporter: Admin-Ansicht der Beitraege (Tab „Supporter") — s. app/supporter.py."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, supporter
from ..db import get_db
from .deps import current_admin

router = APIRouter(tags=["supporter"])
QUELLEN = ("feedback", "chat_jan", "dank", "meldung", "spot_info", "brett", "bewertung", "git",
           "mail", "katalog", "test", "github", "chat", "hand")


@router.get("/api/admin/supporter")
def admin_liste(db: Session = Depends(get_db), _a=Depends(current_admin)):
    """Je Nutzer: Beitragstage im Jahr, Beitraege gesamt, zuletzt, Badge sichtbar + Stufe, Quellen."""
    B = models.FeedbackBeitrag
    ueb = supporter.uebersicht(db)
    namen = dict(db.query(models.User.id, models.User.display_name).filter(models.User.id.in_(list(ueb))).all())
    quellen: dict[int, Counter] = {}
    for uid, q in db.query(B.user_id, B.quelle).all():
        quellen.setdefault(uid, Counter())[q] += 1
    rows = [{"user_id": uid, "name": namen.get(uid), **{k: v for k, v in d.items() if k != "zuletzt"},
             "zuletzt": d["zuletzt"].isoformat() if d["zuletzt"] else None, "quellen": dict(quellen.get(uid, {}))}
            for uid, d in ueb.items()]
    rows.sort(key=lambda r: r["zuletzt"] or "", reverse=True)
    return {"nutzer": rows, "fenster_tage": supporter.FENSTER_TAGE,
            "stufen": {"2": supporter.STUFE2, "3": supporter.STUFE3}, "quellen": list(QUELLEN)}


@router.get("/api/admin/supporter/{uid}")
def admin_nutzer(uid: int, db: Session = Depends(get_db), _a=Depends(current_admin)):
    B = models.FeedbackBeitrag
    rows = db.query(B).filter_by(user_id=uid).order_by(B.at.desc()).limit(500).all()
    return [{"id": b.id, "quelle": b.quelle, "at": b.at.isoformat(), "notiz": b.notiz or ""} for b in rows]


@router.post("/api/admin/supporter")
def admin_hinzu(body: dict = Body(...), db: Session = Depends(get_db), _a=Depends(current_admin)):
    """Beitrag von Hand (Mail, Test, GitHub …). Body: user_id, quelle, notiz, am (YYYY-MM-DD, optional)."""
    try:
        uid = int(body.get("user_id"))
    except (TypeError, ValueError):
        raise HTTPException(400, "user_id fehlt")
    if db.get(models.User, uid) is None:
        raise HTTPException(404, "Nutzer unbekannt")
    quelle = str(body.get("quelle") or "hand")[:24]
    am = body.get("am")
    at = datetime.fromisoformat(am).replace(tzinfo=timezone.utc) if am else datetime.now(timezone.utc)
    b = models.FeedbackBeitrag(user_id=uid, quelle=quelle, ref=f"{uid}:{datetime.now(timezone.utc).isoformat()}",
                               at=at, notiz=(str(body.get("notiz") or "").strip()[:300] or None))
    db.add(b)
    db.commit()
    return {"id": b.id}


@router.delete("/api/admin/supporter/beitrag/{bid}")
def admin_weg(bid: int, db: Session = Depends(get_db), _a=Depends(current_admin)):
    b = db.get(models.FeedbackBeitrag, bid)
    if b is None:
        raise HTTPException(404, "unbekannt")
    db.delete(b)
    db.commit()
    return {"ok": True}
