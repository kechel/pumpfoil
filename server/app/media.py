"""Bild-Uploads (Session-Fotos, Profilbilder): validieren, verkleinern, als WebP
ablegen. Dateinamen sind zufällige UUIDs -> die /media-Auslieferung ist öffentlich,
aber nicht erratbar. EXIF wird beim Re-Encode entfernt (inkl. Geo-Tags).
Das Original wird nie persistiert — nur die verkleinerte WebP-Fassung (spart Platte)."""
from __future__ import annotations

import hashlib
import io
import logging
import uuid
from pathlib import Path

from PIL import Image, ImageOps

from .config import get_settings

settings = get_settings()
log = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 12 * 1024 * 1024  # 12 MB Roh-Upload-Limit
# Hoechstens so viele Pixel (Security-Review 29.10.2026, Bild-Bombe): 12 MB komprimiert koennen ein
# Bild von 178 MP sein, ~0,5 GB Speicher je Anfrage. 110 MP laesst 108-MP-Handykameras durch.
MAX_PIXEL = 110_000_000


def _oeffnen(raw: bytes, max_dim: int):
    """Bild oeffnen, Groesse pruefen BEVOR dekodiert wird, JPEG gleich verkleinert dekodieren
    (`draft`: 1/2, 1/4, 1/8 — spart bei Handyfotos den Grossteil des Speichers)."""
    img = Image.open(io.BytesIO(raw))
    if img.width * img.height > MAX_PIXEL:
        raise ValueError("Bild zu gross")
    if img.format == "JPEG":
        img.draft("RGB", (max_dim * 2, max_dim * 2))
    img = ImageOps.exif_transpose(img)
    img.load()
    return img
THUMB_DIM = 480  # Kantenlänge des kleinen Vorschaubilds (deckt Cards/Strip/Feed inkl. Retina)


class ImageError(ValueError):
    pass


def thumb_url(url: str | None) -> str | None:
    """Leitet die Thumbnail-URL aus der Voll-URL ab (<name>.webp -> <name>.t.webp).
    Nur für /media/*.webp; sonst wird die Original-URL zurückgegeben (kein Thumb vorhanden)."""
    if not url or not url.endswith(".webp") or url.endswith(".t.webp"):
        return url
    return url[:-len(".webp")] + ".t.webp"


_inhalt_cache: dict[str, str | None] = {}


def inhalt_hash(url: str | None) -> str | None:
    """Pruefsumme der abgelegten Datei hinter einer /media-URL, oder None.

    Derselbe Upload ergibt beim Re-Encode byte-gleiche WebP-Dateien — wer ein Bild an mehrere
    Sessions haengt, hat also mehrere Dateien mit gleichem Hash (18.10.: Pete.g, ein Bild an vier
    Sessions, stand viermal in „Neueste Medien"). Dateinamen sind UUIDs und werden nie
    ueberschrieben, deshalb darf der Wert je URL gemerkt werden."""
    if not url or not url.startswith("/media/"):
        return None
    if url in _inhalt_cache:
        return _inhalt_cache[url]
    try:
        h = hashlib.sha256((settings.media_dir / url[len("/media/"):]).read_bytes()).hexdigest()
    except OSError:
        h = None
    if len(_inhalt_cache) < 20000:
        _inhalt_cache[url] = h
    return h


def reencode_image(raw: bytes, max_dim: int = 1600) -> bytes:
    """Bild neu kodieren und als WebP-Bytes zurueckgeben, OHNE es abzulegen.

    Fuer Anhaenge, die nicht oeffentlich unter /media liegen sollen. Der Neuaufbau ist der
    eigentliche Schutz: was nicht als Bild dekodierbar ist, fliegt raus, und alles, was sonst in
    einer Bilddatei mitreist (Skript-Reste in Metadaten, EXIF samt GPS), ueberlebt ihn nicht."""
    if not raw:
        raise ImageError("Leere Datei")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ImageError("Datei zu groß")
    try:
        img = _oeffnen(raw, max_dim)
    except Exception as exc:  # noqa: BLE001
        raise ImageError("Kein gültiges Bild") from exc
    if img.mode != "RGB":
        img = img.convert("RGB")
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=82, method=6)
    return buf.getvalue()


def save_image(raw: bytes, subdir: str, max_dim: int, square: bool = False,
               thumb_dim: int | None = None, transparenz: bool = False) -> str:
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
        img = _oeffnen(raw, max_dim)   # inkl. Aufnahme-Orientierung
    except Exception as exc:  # noqa: BLE001
        raise ImageError("Kein gültiges Bild") from exc

    # transparenz=True (Team-Wappen, 31.10.2026): Alphakanal behalten — ein freigestelltes Wappen
    # bekaeme sonst schwarze Ecken, weil RGBA->RGB die durchsichtigen Pixel auf Schwarz setzt.
    hat_alpha = img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)
    if transparenz and hat_alpha:
        img = img.convert("RGBA")
    elif img.mode not in ("RGB", "L"):
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


def gesperrt_verschieben(url: str | None, gesperrt: bool) -> None:
    """Gesperrtes Foto aus dem oeffentlich ausgelieferten /media nehmen — und beim Entsperren zurueck.

    WARUM (S-043, Jan 29.10.2026): `blocked` blendete das Foto nur in den Listen aus; die Datei lag
    weiter unter ihrer /media-URL, und wer den Link kannte, sah sie. Jetzt liegt sie gesperrt unter
    `data_dir/gesperrte-medien/` (nicht ausgeliefert, aber mitgesichert wie server/data), samt
    Thumbnail. Die URL in der DB bleibt, damit Entsperren ohne Nacharbeit geht. Best effort: fehlt
    eine Datei, wird nichts kaputt gemacht."""
    if not url or not url.startswith("/media/"):
        return
    ablage = settings.data_dir / "gesperrte-medien"
    rel = url[len("/media/"):]
    for p in (rel, thumb_url(rel)):
        if not p or ".." in Path(p).parts:
            continue
        von, nach = ((settings.media_dir / p, ablage / p) if gesperrt
                     else (ablage / p, settings.media_dir / p))
        try:
            if von.exists():
                nach.parent.mkdir(parents=True, exist_ok=True)
                von.replace(nach)
        except OSError:
            log.exception("gesperrt_verschieben %s", p)


def delete_media(url: str | None) -> None:
    """Entfernt eine zuvor gespeicherte /media-Datei (best effort) — inkl. Thumbnail-Sibling."""
    if not url or not url.startswith("/media/"):
        return
    rel = url[len("/media/"):]
    for p in (rel, thumb_url(rel)):
        if not p:
            continue
        # Auch die gesperrte Ablage (gesperrt_verschieben) — Loeschen muss ein gesperrtes Foto
        # genauso entfernen (DSGVO-Loeschung).
        for basis in (settings.media_dir, settings.data_dir / "gesperrte-medien"):
            try:
                (basis / p).unlink(missing_ok=True)
            except OSError:
                pass
