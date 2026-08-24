"""Spot-Beschreibungen: je Nutzer EIN Textblock + bis zu 10 Fotos pro Spot.

Geplant mit Jan am 24.08. Die Regeln, damit sie nicht in der Implementierung verwaessern:

* **Ein Block je (Nutzer, Spot)** — `UNIQUE` in der DB. Fremde koennen nichts ueberschreiben; jeder
  pflegt seinen eigenen Abschnitt, im Spot stehen alle untereinander.
* **Schreibrecht = eine eigene, nicht geloeschte Session an diesem Spot**, unabhaengig von Sportart
  und Analyse (wer dort windsurft, kennt den Spot auch). **Einmal geschrieben, bleibt bestehen**:
  das Recht wird nur beim Anlegen/Aendern geprueft, nicht beim Lesen — eine spaeter geloeschte
  Session soll nicht das Wissen mitnehmen.
* **Moderation wie bei Sessions**: EINE neue "unangemessen"-Meldung blendet aus (`hidden`),
  Ruecknahme blendet NIE automatisch wieder ein, `mod_ok` schuetzt vor Auto-Ausblenden. Beitraege
  blockierter Nutzer sieht der Blockierende nicht. Schreiben nur mit `social_allowed` (unter 13
  darf nicht — Apple-Vorgabe fuer nutzergenerierte Inhalte).
* **Fotos**: neu hochladen oder ein EIGENES Session-Foto uebernehmen. Beim Uebernehmen wird die
  Datei KOPIERT (Begruendung an `SpotNotePhoto`). Reihenfolge bestimmt der Besitzer selbst.
* Bewusst NICHT: Sprachfeld/-erkennung, Struktur-Tags, Titelbild, Bearbeitungshistorie, Kommentare
  unter den Beschreibungen (dafuer gibt es den Spot-Chat).
"""
from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import media, models
from ..config import get_settings
from ..db import get_db
from ..media import MAX_UPLOAD_BYTES, delete_media, save_image, thumb_url
from .deps import current_user, require_social

router = APIRouter(prefix="/api/community", tags=["community"])
settings = get_settings()

MAX_FOTOS_PRO_BESCHREIBUNG = 10
MAX_TEXT = 2000                      # grosszuegig fuer eine Spot-Beschreibung, aber kein Aufsatz
_UNTERORDNER = "spotnotes"


class NoteIn(BaseModel):
    text: str = Field(default="", max_length=MAX_TEXT)


def _spot(db: Session, spot_id: int) -> models.Spot:
    sp = db.get(models.Spot, spot_id)
    if sp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Spot not found")
    # Zusammengefuehrte Spots zeigen auf ihr Ziel — Beschreibungen gehoeren immer an den lebenden.
    while sp.merged_into is not None:
        ziel = db.get(models.Spot, sp.merged_into)
        if ziel is None or ziel.id == sp.id:
            break
        sp = ziel
    return sp


def darf_schreiben(db: Session, user: models.User, spot_id: int) -> bool:
    """Hat der Nutzer eine eigene Session an diesem Spot? (Sportart und Analyse egal.)"""
    return db.query(models.Session.id).filter(
        models.Session.user_id == user.id,
        models.Session.spot_id == spot_id,
        models.Session.deleted.isnot(True),
    ).first() is not None


def _blockiert(db: Session, user: models.User) -> set[int]:
    """Wen hat dieser Nutzer blockiert bzw. wer hat ihn blockiert — beide Richtungen ausblenden."""
    raus: set[int] = set()
    for a, b in db.query(models.UserBlock.blocker_id, models.UserBlock.blocked_id).filter(
            (models.UserBlock.blocker_id == user.id) | (models.UserBlock.blocked_id == user.id)).all():
        raus.add(b if a == user.id else a)
    return raus


def _fotos(db: Session, note_ids: list[int]) -> dict[int, list[dict]]:
    if not note_ids:
        return {}
    aus: dict[int, list[dict]] = {}
    rows = (db.query(models.SpotNotePhoto)
            .filter(models.SpotNotePhoto.note_id.in_(note_ids),
                    models.SpotNotePhoto.blocked.is_(False))
            .order_by(models.SpotNotePhoto.sort, models.SpotNotePhoto.id).all())
    for f in rows:
        aus.setdefault(f.note_id, []).append(
            {"id": f.id, "url": f.url, "thumb_url": thumb_url(f.url)})
    return aus


def _note_out(n: models.SpotNote, autor: models.User | None, fotos: list[dict],
              likes: int, my_like: bool, my_report: bool, eigen: bool) -> dict:
    return {
        "id": n.id,
        "user_id": n.user_id,
        "name": (autor.display_name if autor else None),
        "avatar_url": (autor.avatar_url if autor else None),
        "text": n.text or "",
        "photos": fotos,
        "like_count": likes,
        "liked": my_like,
        "my_report": my_report,
        "updated_at": (n.updated_at or n.created_at).isoformat() if (n.updated_at or n.created_at) else None,
        "mine": eigen,
    }


@router.get("/spot/{spot_id}/notes")
def list_notes(spot_id: int, user: models.User = Depends(current_user),
               db: Session = Depends(get_db)) -> dict:
    """Alle sichtbaren Beschreibungen eines Spots. Eigene zuerst, dann nach Herzchen, dann Datum.

    `can_write` sagt der Oberflaeche, ob dieser Nutzer hier einen eigenen Abschnitt anlegen darf —
    ohne eine Session am Spot gibt es keinen Bearbeiten-Knopf.
    """
    sp = _spot(db, spot_id)
    raus = _blockiert(db, user)
    q = db.query(models.SpotNote).filter(models.SpotNote.spot_id == sp.id)
    alle = [n for n in q.all()
            if (n.user_id == user.id or (not n.hidden and n.user_id not in raus))]
    ids = [n.id for n in alle]
    fotos = _fotos(db, ids)
    likes: dict[int, int] = {}
    if ids:
        for nid, anz in (db.query(models.SpotNoteLike.note_id, func.count(models.SpotNoteLike.id))
                         .filter(models.SpotNoteLike.note_id.in_(ids))
                         .group_by(models.SpotNoteLike.note_id).all()):
            likes[nid] = anz
    meine_likes = {nid for (nid,) in db.query(models.SpotNoteLike.note_id).filter(
        models.SpotNoteLike.note_id.in_(ids or [0]), models.SpotNoteLike.user_id == user.id).all()}
    meine_reports = {nid for (nid,) in db.query(models.SpotNoteVote.note_id).filter(
        models.SpotNoteVote.note_id.in_(ids or [0]), models.SpotNoteVote.user_id == user.id).all()}
    autoren = {u.id: u for u in db.query(models.User).filter(
        models.User.id.in_([n.user_id for n in alle] or [0])).all()}
    aus = [_note_out(n, autoren.get(n.user_id), fotos.get(n.id, []), likes.get(n.id, 0),
                     n.id in meine_likes, n.id in meine_reports, n.user_id == user.id)
           for n in alle]
    aus.sort(key=lambda d: (not d["mine"], -d["like_count"], d["updated_at"] or ""))
    return {"spot_id": sp.id, "notes": aus,
            "can_write": darf_schreiben(db, user, sp.id),
            "max_photos": MAX_FOTOS_PRO_BESCHREIBUNG, "max_text": MAX_TEXT}


def _meine_note(db: Session, user: models.User, spot_id: int) -> models.SpotNote | None:
    return db.query(models.SpotNote).filter_by(user_id=user.id, spot_id=spot_id).first()


def _hole_oder_lege_an(db: Session, user: models.User, spot_id: int) -> models.SpotNote:
    """Eigene Beschreibung holen; existiert keine, eine leere anlegen (fuer Foto-Upload ohne Text)."""
    sp = _spot(db, spot_id)
    if not darf_schreiben(db, user, sp.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no session at this spot")
    n = _meine_note(db, user, sp.id)
    if n is None:
        n = models.SpotNote(spot_id=sp.id, user_id=user.id, text="")
        db.add(n)
        db.flush()
    return n


@router.put("/spot/{spot_id}/note")
def save_note(spot_id: int, body: NoteIn, user: models.User = Depends(require_social),
              db: Session = Depends(get_db)) -> dict:
    """Eigenen Textblock anlegen/aendern. Leerer Text mit Fotos ist erlaubt (Bilder allein sagen viel)."""
    n = _hole_oder_lege_an(db, user, spot_id)
    n.text = (body.text or "").strip()[:MAX_TEXT]
    n.updated_at = datetime.now(timezone.utc)
    # Eine ueberarbeitete Beschreibung ist ein neuer Stand: eine alte Meldung soll sie nicht
    # dauerhaft unsichtbar halten. Vom Admin geprueft (`mod_ok`) bleibt sie ohnehin sichtbar.
    if n.hidden and not n.mod_ok:
        n.hidden = False
        db.query(models.SpotNoteVote).filter_by(note_id=n.id).delete()
    db.commit()
    return {"ok": True, "id": n.id}


@router.delete("/spot/{spot_id}/note")
def delete_note(spot_id: int, user: models.User = Depends(current_user),
                db: Session = Depends(get_db)) -> dict:
    """Eigene Beschreibung samt Fotos loeschen (auch ohne Session am Spot — Loeschen ist immer erlaubt)."""
    sp = _spot(db, spot_id)
    n = _meine_note(db, user, sp.id)
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no note")
    _note_weg(db, n)
    db.commit()
    return {"ok": True}


def _note_weg(db: Session, n: models.SpotNote) -> None:
    """Beschreibung + Fotodateien + Herzchen + Meldungen entfernen (auch fuer Konto-Loeschung).

    Die Kinder werden per Bulk-DELETE entfernt und danach `flush()`, BEVOR die Beschreibung selbst
    faellt: die Session laeuft mit `autoflush=False` (db.py), ein `db.delete(kind)` bleibt also
    haengen, waehrend das anschliessende `db.delete(n)` beim Commit zuerst ausgefuehrt werden kann —
    dann schlaegt der Fremdschluessel `spot_note_photos.note_id` zu (belegt: HTTP 500 im
    End-to-End-Test, ForeignKeyViolation auf note_id=1).
    """
    for f in db.query(models.SpotNotePhoto).filter_by(note_id=n.id).all():
        delete_media(f.url)
    db.query(models.SpotNotePhoto).filter_by(note_id=n.id).delete()
    db.query(models.SpotNoteLike).filter_by(note_id=n.id).delete()
    db.query(models.SpotNoteVote).filter_by(note_id=n.id).delete()
    db.flush()
    db.delete(n)
    db.flush()


@router.post("/spot/{spot_id}/note/photos")
async def add_photo(spot_id: int, file: UploadFile = File(...),
                    user: models.User = Depends(require_social),
                    db: Session = Depends(get_db)) -> dict:
    """Foto zur eigenen Beschreibung hochladen (gleiche Pipeline wie Session-Fotos)."""
    n = _hole_oder_lege_an(db, user, spot_id)
    anz = db.query(func.count(models.SpotNotePhoto.id)).filter_by(note_id=n.id).scalar() or 0
    if anz >= MAX_FOTOS_PRO_BESCHREIBUNG:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Max. {MAX_FOTOS_PRO_BESCHREIBUNG} Fotos")
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bild zu gross")
    try:
        url = save_image(raw, _UNTERORDNER, max_dim=1600, thumb_dim=400)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    f = models.SpotNotePhoto(note_id=n.id, url=url, sort=anz)
    db.add(f)
    n.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": f.id, "url": f.url, "thumb_url": thumb_url(f.url)}


@router.get("/spot/{spot_id}/my-session-photos")
def my_session_photos(spot_id: int, user: models.User = Depends(current_user),
                      db: Session = Depends(get_db)) -> list[dict]:
    """Eigene Session-Fotos VON DIESEM SPOT — Auswahlliste fuer "Foto uebernehmen".

    Die meisten haben ihr Spot-Bild schon in einer Session; ohne diese Liste muesste man es
    erneut vom Telefon hochladen. Absichtlich auf den Spot begrenzt: Fotos von woanders gehoeren
    nicht in eine Spot-Beschreibung.
    """
    rows = (db.query(models.SessionPhoto.id, models.SessionPhoto.url, models.Session.started_at)
            .join(models.Session, models.Session.id == models.SessionPhoto.session_id)
            .filter(models.Session.user_id == user.id, models.Session.spot_id == spot_id,
                    models.Session.deleted.isnot(True), models.SessionPhoto.blocked.is_(False))
            .order_by(models.Session.started_at.desc(), models.SessionPhoto.id).all())
    return [{"id": pid, "url": url, "thumb_url": thumb_url(url),
             "started_at": st.isoformat() if st else None} for pid, url, st in rows]


@router.post("/spot/{spot_id}/note/photos/from-session")
def adopt_photo(spot_id: int, photo_id: int = Query(...),
                user: models.User = Depends(require_social),
                db: Session = Depends(get_db)) -> dict:
    """Ein EIGENES Session-Foto in die Spot-Beschreibung uebernehmen.

    Die Datei wird kopiert, nicht verlinkt: sonst nimmt das Loeschen des Session-Fotos das
    Spot-Bild mit (siehe `SpotNotePhoto`). Kopiert werden Vollbild UND Thumbnail, damit die
    Anzeige dieselbe ist wie bei einem frischen Upload.
    """
    n = _hole_oder_lege_an(db, user, spot_id)
    anz = db.query(func.count(models.SpotNotePhoto.id)).filter_by(note_id=n.id).scalar() or 0
    if anz >= MAX_FOTOS_PRO_BESCHREIBUNG:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Max. {MAX_FOTOS_PRO_BESCHREIBUNG} Fotos")
    quelle = db.get(models.SessionPhoto, photo_id)
    if quelle is None or quelle.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "photo not found")
    neu = _kopiere_medien(quelle.url)
    if neu is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bilddatei nicht lesbar")
    f = models.SpotNotePhoto(note_id=n.id, url=neu, sort=anz, from_session_photo_id=quelle.id)
    db.add(f)
    n.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": f.id, "url": f.url, "thumb_url": thumb_url(f.url)}


def _kopiere_medien(url: str | None) -> str | None:
    """`/media/<sub>/<stem>.webp` (+ `.t.webp`) unter neuem Namen in den Spot-Ordner kopieren."""
    if not url:
        return None
    quelle = settings.media_dir / url.replace("/media/", "", 1)
    if not quelle.exists():
        return None
    import uuid as _uuid
    stem = _uuid.uuid4().hex
    ziel_dir = settings.media_dir / _UNTERORDNER
    ziel_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(quelle, ziel_dir / f"{stem}.webp")
    q_thumb = Path(str(quelle).replace(".webp", ".t.webp"))
    if q_thumb.exists():
        shutil.copyfile(q_thumb, ziel_dir / f"{stem}.t.webp")
    return f"/media/{_UNTERORDNER}/{stem}.webp"


@router.delete("/spot/{spot_id}/note/photos/{photo_id}")
def del_photo(spot_id: int, photo_id: int, user: models.User = Depends(current_user),
              db: Session = Depends(get_db)) -> dict:
    sp = _spot(db, spot_id)
    n = _meine_note(db, user, sp.id)
    f = db.get(models.SpotNotePhoto, photo_id)
    if n is None or f is None or f.note_id != n.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "photo not found")
    delete_media(f.url)
    db.delete(f)
    n.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


class SortIn(BaseModel):
    photo_ids: list[int]


@router.put("/spot/{spot_id}/note/photos/order")
def sort_photos(spot_id: int, body: SortIn, user: models.User = Depends(current_user),
                db: Session = Depends(get_db)) -> dict:
    """Reihenfolge der EIGENEN Fotos setzen (Jan: jeder sortiert seine eigenen)."""
    sp = _spot(db, spot_id)
    n = _meine_note(db, user, sp.id)
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no note")
    eigene = {f.id: f for f in db.query(models.SpotNotePhoto).filter_by(note_id=n.id).all()}
    for i, pid in enumerate(body.photo_ids):
        f = eigene.get(int(pid))
        if f is not None:
            f.sort = i
    db.commit()
    return {"ok": True}


@router.post("/spot/notes/{note_id}/like")
def like_note(note_id: int, user: models.User = Depends(require_social),
              db: Session = Depends(get_db)) -> dict:
    """Herzchen umschalten — wie ueberall, keine Sterne, keine Downvotes."""
    n = db.get(models.SpotNote, note_id)
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "note not found")
    row = db.query(models.SpotNoteLike).filter_by(user_id=user.id, note_id=note_id).first()
    if row:
        db.delete(row)
    else:
        db.add(models.SpotNoteLike(user_id=user.id, note_id=note_id))
    db.commit()
    anz = db.query(func.count(models.SpotNoteLike.id)).filter_by(note_id=note_id).scalar() or 0
    return {"liked": row is None, "like_count": anz}


@router.post("/spot/notes/{note_id}/report")
def report_note(note_id: int, user: models.User = Depends(require_social),
                db: Session = Depends(get_db)) -> dict:
    """"Unangemessen" melden. Gleiche Regel wie bei Sessions: EINE neue Meldung blendet aus,
    Ruecknahme blendet NIE automatisch wieder ein, `mod_ok` schuetzt."""
    n = db.get(models.SpotNote, note_id)
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "note not found")
    if n.user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "own note")
    row = db.query(models.SpotNoteVote).filter_by(user_id=user.id, note_id=note_id).first()
    neu = row is None
    if row:
        db.delete(row)
    else:
        db.add(models.SpotNoteVote(user_id=user.id, note_id=note_id))
        if not n.mod_ok:
            n.hidden = True
    db.commit()
    return {"reported": neu, "hidden": bool(n.hidden)}
