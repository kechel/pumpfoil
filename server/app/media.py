"""Bild-Uploads (Session-Fotos, Profilbilder): validieren, verkleinern, als WebP
ablegen. Dateinamen sind zufällige UUIDs -> die /media-Auslieferung ist öffentlich,
aber nicht erratbar. EXIF wird beim Re-Encode entfernt (inkl. Geo-Tags).
Das Original wird nie persistiert — nur die verkleinerte WebP-Fassung (spart Platte)."""
from __future__ import annotations

import io
import uuid

from PIL import Image, ImageOps

from .config import get_settings

settings = get_settings()

MAX_UPLOAD_BYTES = 12 * 1024 * 1024  # 12 MB Roh-Upload-Limit
THUMB_DIM = 480  # Kantenlänge des kleinen Vorschaubilds (deckt Cards/Strip/Feed inkl. Retina)


class ImageError(ValueError):
    pass


def thumb_url(url: str | None) -> str | None:
    """Leitet die Thumbnail-URL aus der Voll-URL ab (<name>.webp -> <name>.t.webp).
    Nur für /media/*.webp; sonst wird die Original-URL zurückgegeben (kein Thumb vorhanden)."""
    if not url or not url.endswith(".webp") or url.endswith(".t.webp"):
        return url
    return url[:-len(".webp")] + ".t.webp"


def save_image(raw: bytes, subdir: str, max_dim: int, square: bool = False,
               thumb_dim: int | None = None) -> str:
    """Speichert ein Bild unter media_dir/<subdir>/<uuid>.webp und gibt die /media-URL zurück.

    max_dim: längste Kante (px). square=True: mittig quadratisch zuschneiden (Avatare).
    thumb_dim: falls gesetzt, wird zusätzlich ein <uuid>.t.webp-Thumbnail (längste Kante
    thumb_dim) abgelegt — für Listen/Feeds/Cards, spart Traffic (Voll-URL bleibt fürs Lightbox).
    """
    if not raw:
        raise ImageError("Leere Datei")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ImageError("Datei zu groß (max. 12 MB)")
    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)  # Aufnahme-Orientierung anwenden
        img.load()
    except Exception as exc:  # noqa: BLE001
        raise ImageError("Kein gültiges Bild") from exc

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")

    if square:
        img = ImageOps.fit(img, (max_dim, max_dim), Image.LANCZOS)
    else:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)

    stem = uuid.uuid4().hex
    out_dir = settings.media_dir / subdir
    out_dir.mkdir(parents=True, exist_ok=True)
    # WebP: deutlich kleiner als JPEG bei gleicher Qualität, überall web-tauglich.
    img.save(out_dir / f"{stem}.webp", format="WEBP", quality=82, method=6)
    if thumb_dim:
        th = img.copy()
        th.thumbnail((thumb_dim, thumb_dim), Image.LANCZOS)
        th.save(out_dir / f"{stem}.t.webp", format="WEBP", quality=80, method=6)
    return f"/media/{subdir}/{stem}.webp"


def delete_media(url: str | None) -> None:
    """Entfernt eine zuvor gespeicherte /media-Datei (best effort) — inkl. Thumbnail-Sibling."""
    if not url or not url.startswith("/media/"):
        return
    rel = url[len("/media/"):]
    for p in (rel, thumb_url(rel)):
        if not p:
            continue
        try:
            (settings.media_dir / p).unlink(missing_ok=True)
        except OSError:
            pass
