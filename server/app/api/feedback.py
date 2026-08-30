"""Nutzer-Feedback: absenden (eingeloggt), Anhaenge, Admin-Liste."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from ..ratelimit import rate_limit
from .deps import current_user

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

MAX_LEN = 500


class FeedbackIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_LEN)
    url: str | None = None


@router.post("")
def submit(
    body: FeedbackIn,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(20, 3600, "feedback")),
) -> dict:
    text = body.text.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Leeres Feedback")
    fb = models.Feedback(user_id=user.id, text=text[:MAX_LEN], url=(body.url or "")[:255] or None)
    db.add(fb)
    db.commit()
    # id mitgeben: die Oberflaeche haengt danach die Dateien an DIESE Meldung.
    return {"ok": True, "id": fb.id}


# --- Anhaenge ------------------------------------------------------------------------------
# Grenzen bewusst eng (Jan: „mit sinnvollen Grenzen gegen abuse & hacking"):
#   * WEISS-Liste statt Schwarz-Liste — was nicht Bild oder Text ist, kommt nicht rein.
#     Keine Archive, keine PDFs, keine Skripte: nichts davon braucht man, um einen Fehler zu zeigen.
#   * Bilder werden NEU KODIERT (media.reencode_image) — das ist der eigentliche Schutz.
#   * Text wird als UTF-8 dekodiert; was sich nicht dekodieren laesst, ist kein Log.
#   * Ablage unter data_dir/feedback mit erzeugtem Namen, NICHT unter /media (nicht ausgeliefert).
#   * Nur an die eigene, frische Meldung — sonst koennte man fremde oder alte Meldungen volllaufen
#     lassen.
MAX_ANHAENGE = 3
MAX_BILD_BYTES = 8 * 1024 * 1024
MAX_TEXT_BYTES = 256 * 1024
FRIST_MIN = 30          # nur an eine Meldung der letzten halben Stunde anhaengen
BILD_ENDUNGEN = {"jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff"}
TEXT_ENDUNGEN = {"txt", "log", "json", "csv", "ips", "crash", "xml", "yml", "yaml"}


def _endung(name: str) -> str:
    return (name or "").rsplit(".", 1)[-1].lower() if "." in (name or "") else ""


def _sauberer_name(name: str) -> str:
    """Originalnamen NUR zur Anzeige behalten und dabei entschaerfen: keine Pfade, keine
    Steuerzeichen, gekappt. Gespeichert wird ohnehin unter einem erzeugten Namen."""
    roh = (name or "").replace("\\", "/").rsplit("/", 1)[-1]
    roh = re.sub(r"[^\w.\- ]+", "_", roh, flags=re.UNICODE)
    return roh[:120] or "datei"


@router.post("/{feedback_id}/attachment")
async def anhang(
    feedback_id: int,
    file: UploadFile = File(...),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(30, 3600, "feedback_anhang")),
) -> dict:
    fb = db.get(models.Feedback, feedback_id)
    if fb is None or fb.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meldung nicht gefunden")
    if fb.created_at and fb.created_at < datetime.now(timezone.utc) - timedelta(minutes=FRIST_MIN):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Meldung zu alt fuer Anhaenge")
    n = db.query(models.FeedbackAttachment).filter_by(feedback_id=feedback_id).count()
    if n >= MAX_ANHAENGE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Hoechstens {MAX_ANHAENGE} Anhaenge")

    endung = _endung(file.filename or "")
    roh = await file.read()
    if not roh:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Leere Datei")

    ordner = get_settings().data_dir / "feedback"
    ordner.mkdir(parents=True, exist_ok=True)
    stamm = uuid.uuid4().hex

    if endung in BILD_ENDUNGEN:
        if len(roh) > MAX_BILD_BYTES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bild zu groß (max. 8 MB)")
        from ..media import ImageError, reencode_image
        try:
            daten = reencode_image(roh, max_dim=1600)
        except ImageError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        art, datei = "image", f"{stamm}.webp"
    elif endung in TEXT_ENDUNGEN:
        if len(roh) > MAX_TEXT_BYTES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Textdatei zu groß (max. 256 KB)")
        try:
            daten = roh.decode("utf-8").encode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Keine lesbare Textdatei") from None
        art, datei = "text", f"{stamm}.txt"
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Nur Bilder oder Textdateien (Log, Crash-Report)")

    (ordner / datei).write_bytes(daten)
    a = models.FeedbackAttachment(feedback_id=feedback_id, user_id=user.id, kind=art,
                                  stored=datei, filename=_sauberer_name(file.filename or ""),
                                  bytes=len(daten))
    db.add(a)
    db.commit()
    return {"id": a.id, "kind": art, "filename": a.filename, "bytes": a.bytes}
