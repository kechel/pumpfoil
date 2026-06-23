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


class ImageError(ValueError):
    pass


def save_image(raw: bytes, subdir: str, max_dim: int, square: bool = False) -> str:
    """Speichert ein Bild unter media_dir/<subdir>/<uuid>.jpg und gibt die /media-URL zurück.

    max_dim: längste Kante (px). square=True: mittig quadratisch zuschneiden (Avatare).
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

    name = f"{uuid.uuid4().hex}.webp"
    out_dir = settings.media_dir / subdir
    out_dir.mkdir(parents=True, exist_ok=True)
    # WebP: deutlich kleiner als JPEG bei gleicher Qualität, überall web-tauglich.
    img.save(out_dir / name, format="WEBP", quality=82, method=6)
    return f"/media/{subdir}/{name}"


def delete_media(url: str | None) -> None:
    """Entfernt eine zuvor gespeicherte /media-Datei (best effort)."""
    if not url or not url.startswith("/media/"):
        return
    rel = url[len("/media/"):]
    try:
        (settings.media_dir / rel).unlink(missing_ok=True)
    except OSError:
        pass
