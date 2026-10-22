"""„Rate this analysis" auf der eigenen Session (Jan, 22.10.2026) — nur Besitzer + Admin.

Jan: „lass uns mal in den session-details einer eigenen session ein kleines extra feedback bauen …
Problems with app yes/no, detection of your runs good / bad" und „das ist nur dem Besitzer selber
sichtbar und mir in einer neuen admin-ansicht". Modell: models.SessionBewertung.

Antworten (alle optional, unbekannte Werte fallen still weg):
  sterne        1..5                 Gesamteindruck der Auswertung
  laeufe        alle|fehlen|zuviele|zerstueckelt
  laeufe_echt   0..500               wie viele Laeufe der Fahrer wirklich gefahren ist (Vergleichsdaten!)
  pumps         wenig|passt|viel|weiss_nicht
  tempo_ok      true|false           Geschwindigkeit/Strecke plausibel
  probleme      true|false
  probleme_art  Teilmenge von PROBLEME
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_admin, current_user

router = APIRouter(tags=["bewertung"])

LAEUFE = ("alle", "fehlen", "zuviele", "zerstueckelt")
PUMPS = ("wenig", "passt", "viel", "weiss_nicht")
PROBLEME = ("abbruch", "pause", "gps", "upload", "akku", "bedienung", "sonstiges")
MAX_KOMMENTAR = 2000


def _eigene(db: Session, sid: int, user: models.User) -> models.Session:
    s = db.get(models.Session, sid)
    if s is None or s.deleted or s.user_id != user.id:
        raise HTTPException(404, "Keine eigene Session")
    return s


def antworten_pruefen(roh) -> dict:
    """Nur bekannte Felder mit gueltigen Werten uebernehmen."""
    d = roh if isinstance(roh, dict) else {}
    out: dict = {}
    st = d.get("sterne")
    if isinstance(st, int) and not isinstance(st, bool) and 1 <= st <= 5:
        out["sterne"] = st
    if d.get("laeufe") in LAEUFE:
        out["laeufe"] = d["laeufe"]
    le = d.get("laeufe_echt")
    if isinstance(le, int) and not isinstance(le, bool) and 0 <= le <= 500:
        out["laeufe_echt"] = le
    if d.get("pumps") in PUMPS:
        out["pumps"] = d["pumps"]
    for k in ("tempo_ok", "probleme"):
        if isinstance(d.get(k), bool):
            out[k] = d[k]
    if isinstance(d.get("probleme_art"), list):
        art = [p for p in d["probleme_art"] if p in PROBLEME]
        if art and out.get("probleme") is not False:
            out["probleme_art"] = sorted(set(art), key=PROBLEME.index)
    return out


def _schnappschuss(db: Session, s: models.Session) -> dict:
    """Was die Seite beim Bewerten zeigte — fuer den spaeteren Vergleich mit einer Neuauswertung."""
    a = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
    laeufe = None
    if a is not None and a.segments_json:
        try:
            laeufe = len(json.loads(a.segments_json) or [])
        except ValueError:
            laeufe = None
    return {
        "laeufe": laeufe,
        "pumps": a.pump_count if a else None,
        "foil_m": round(a.foiling_distance_m) if a and a.foiling_distance_m is not None else None,
        "algo": a.algo_version if a else None,
        "geraet": s.device_model, "app": s.app_version,
        "sport": s.sport_class, "placement": s.placement,
    }


def _aus(b: models.SessionBewertung | None) -> dict | None:
    if b is None:
        return None
    return {"antworten": json.loads(b.antworten_json or "{}"), "kommentar": b.kommentar or "",
            "schnappschuss": json.loads(b.schnappschuss_json or "{}"),
            "aktualisiert": b.updated_at.isoformat() if b.updated_at else None}


@router.get("/api/sessions/{sid}/bewertung")
def lesen(sid: int, db: Session = Depends(get_db), user=Depends(current_user)):
    s = _eigene(db, sid, user)
    b = db.query(models.SessionBewertung).filter_by(session_id=s.id, user_id=user.id).first()
    return {"bewertung": _aus(b), "laeufe_jetzt": _schnappschuss(db, s)["laeufe"]}


@router.put("/api/sessions/{sid}/bewertung")
def speichern(sid: int, body: dict = Body(...), db: Session = Depends(get_db), user=Depends(current_user)):
    s = _eigene(db, sid, user)
    antworten = antworten_pruefen(body.get("antworten"))
    kommentar = str(body.get("kommentar") or "").strip()[:MAX_KOMMENTAR] or None
    if not antworten and not kommentar:
        raise HTTPException(400, "Leere Bewertung")
    b = db.query(models.SessionBewertung).filter_by(session_id=s.id, user_id=user.id).first()
    if b is None:
        b = models.SessionBewertung(session_id=s.id, user_id=user.id)
        db.add(b)
    b.antworten_json = json.dumps(antworten)
    b.kommentar = kommentar
    b.schnappschuss_json = json.dumps(_schnappschuss(db, s))
    db.commit()
    db.refresh(b)
    return {"bewertung": _aus(b)}


@router.get("/api/admin/bewertungen")
def admin_liste(limit: int = 200, db: Session = Depends(get_db), _a=Depends(current_admin)):
    """Neueste zuerst, mit Nutzername und Session-Daten (Admin-Tab „Bewertungen")."""
    rows = (db.query(models.SessionBewertung, models.User.display_name, models.Session.started_at)
            .join(models.User, models.SessionBewertung.user_id == models.User.id)
            .join(models.Session, models.SessionBewertung.session_id == models.Session.id)
            .order_by(models.SessionBewertung.updated_at.desc()).limit(max(1, min(limit, 1000))).all())
    return [{"session_id": b.session_id, "user_id": b.user_id, "name": name,
             "gefahren": st.isoformat() if st else None, **(_aus(b) or {})} for b, name, st in rows]
