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

from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from .. import pumpgleit_anzeige as PA
from ..config import get_settings
from ..db import get_db
from .deps import current_admin, current_user

router = APIRouter(tags=["bewertung"])

LAEUFE = ("alle", "fehlen", "zuviele", "zerstueckelt")
PUMPS = ("wenig", "passt", "viel", "weiss_nicht")
PROBLEME = ("abbruch", "pause", "gps", "upload", "akku", "bedienung", "sonstiges")
MAX_KOMMENTAR = 2000
STATUS = ("offen", "rueckfrage", "erledigt")


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
        "pumps": PA.pump_count(a),
        "foil_m": round(a.foiling_distance_m) if a and a.foiling_distance_m is not None else None,
        "algo": a.algo_version if a else None,
        "geraet": s.device_model, "app": s.app_version,
        "sport": s.sport_class, "placement": s.placement,
    }


def _aus(b: models.SessionBewertung | None) -> dict | None:
    if b is None:
        return None
    rf = b.status == "rueckfrage" and b.antwort_fahrer
    return {"antworten": json.loads(b.antworten_json or "{}"), "kommentar": b.kommentar or "",
            "schnappschuss": json.loads(b.schnappschuss_json or "{}"),
            "aktualisiert": b.updated_at.isoformat() if b.updated_at else None,
            # Unsere Rueckfrage an den Fahrer, solange er nicht neu bewertet hat (Kachel zeigt sie an).
            "rueckfrage": {"text": b.antwort_fahrer, "am": b.antwort_at.isoformat() if b.antwort_at else None} if rf else None}


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
    if b.status != "offen":     # neu bewertet (z. B. nach unserer Rueckfrage) -> wieder ansehen
        b.status, b.status_at = "offen", datetime.now(timezone.utc)
    db.flush()
    # Supporter-Badge: eine Bewertung zaehlt als Beitrag, je Bewertung und Tag einmal (Jan, 23.10.2026).
    from .. import supporter
    supporter.merke(db, user, "bewertung", f"{b.id}:{datetime.now(timezone.utc).date()}", f"#{s.id}")
    db.commit()
    db.refresh(b)
    return {"bewertung": _aus(b)}


@router.get("/api/admin/bewertungen")
def admin_liste(limit: int = 200, erledigte: bool = False, db: Session = Depends(get_db), _a=Depends(current_admin)):
    """Neueste zuerst, mit Nutzername und Session-Daten (Admin-Tab „Bewertungen"). Erledigte nur auf
    Wunsch; `anzahl_erledigt` sagt, wie viele ausgeblendet sind."""
    B = models.SessionBewertung
    q = (db.query(B, models.User.display_name, models.Session.started_at, models.User.language)
         .join(models.User, B.user_id == models.User.id)
         .join(models.Session, B.session_id == models.Session.id))
    if not erledigte:
        q = q.filter(B.status != "erledigt")
    rows = q.order_by(B.updated_at.desc()).limit(max(1, min(limit, 1000))).all()
    return {"bewertungen": [{"id": b.id, "session_id": b.session_id, "user_id": b.user_id, "name": name, "sprache": sprache,
                             "gefahren": st.isoformat() if st else None, "status": b.status or "offen",
                             "status_notiz": b.status_notiz or "", "antwort_fahrer": b.antwort_fahrer or "",
                             "status_at": b.status_at.isoformat() if b.status_at else None, **(_aus(b) or {})}
                            for b, name, st, sprache in rows],
            "anzahl_erledigt": db.query(B).filter(B.status == "erledigt").count()}


def status_setzen(db: Session, bid: int, status: str, notiz: str | None = None,
                  antwort: str | None = None, absender: models.User | None = None) -> models.SessionBewertung:
    """Auch fuer Skripte (scripts/bewertung-status.py): Claude setzt erledigt/rueckfrage, wenn ein
    gemeldetes Problem gefixt bzw. an den Fahrer zurueckgegeben ist (Jan, 22.10.2026).
    „rueckfrage" braucht `antwort` (an den Fahrer) und `absender`: die Nachricht geht als 1:1 von ihm an
    den Fahrer, mit Link zur Session, und steht bis zur Neubewertung an dessen Bewertung."""
    if status not in STATUS:
        raise HTTPException(400, "Unbekannter Status")
    b = db.get(models.SessionBewertung, bid)
    if b is None:
        raise HTTPException(404, "Keine Bewertung")
    text = (antwort or "").strip()[:MAX_KOMMENTAR]
    if status == "rueckfrage" and (not text or absender is None):
        raise HTTPException(400, "Rueckfrage braucht eine Nachricht an den Fahrer")
    jetzt = datetime.now(timezone.utc)
    b.status, b.status_at = status, jetzt
    if notiz is not None:
        b.status_notiz = notiz.strip()[:MAX_KOMMENTAR] or None
    if status == "rueckfrage":
        b.antwort_fahrer, b.antwort_at = text, jetzt
        db.flush()
        if absender.id != b.user_id:
            from .chat import PostIn, post_message   # gleicher Weg wie jede DM: Sperren, Push, Posteingang
            a, z = sorted([absender.id, b.user_id])
            post_message(PostIn(text=f"{text}\n\n{get_settings().base_url}/sessions/{b.session_id}"),
                         scope=f"dm:{a}-{z}", user=absender, db=db)
    return b


@router.put("/api/admin/bewertungen/{bid}")
def admin_status(bid: int, body: dict = Body(...), db: Session = Depends(get_db), admin=Depends(current_admin)):
    b = status_setzen(db, bid, str(body.get("status") or ""), body.get("notiz"), body.get("antwort"), admin)
    db.commit()
    return {"id": b.id, "status": b.status, "status_notiz": b.status_notiz or "", "antwort_fahrer": b.antwort_fahrer or ""}


@router.delete("/api/admin/bewertungen/{bid}")
def admin_loeschen(bid: int, db: Session = Depends(get_db), _a=Depends(current_admin)):
    """Endgueltig weg — gedacht fuer Testbewertungen."""
    b = db.get(models.SessionBewertung, bid)
    if b is None:
        raise HTTPException(404, "Keine Bewertung")
    db.delete(b)
    db.commit()
    return {"ok": True}
