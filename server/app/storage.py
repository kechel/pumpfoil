"""Unveränderliche Roh-Datenspeicherung je Session auf Disk.

Layout:
  data_dir/<session_uuid>/
    meta.json                 Session-Parameter (hz, scale, started_at)
    gps/<index>.json          eingegangene GPS-Chunks (roh, wie empfangen)
    accel/<index>.bin         eingegangene Accel-Chunks (roher int16-Bytestream)

Beim Lesen für die Analyse werden die Chunks der Reihenfolge nach zu zwei numpy-Arrays
zusammengesetzt. Rohdaten werden NIE verändert — jedes künftige Modell kann hier neu rechnen.
"""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path

import numpy as np

from .config import get_settings

settings = get_settings()

# session_uuid fließt in den Dateipfad ein -> nur unbedenkliche Zeichen zulassen
# (kein "/" oder ".." -> kein Path-Traversal aus data_dir heraus).
_SAFE_UUID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def session_dir(session_uuid: str) -> Path:
    if not _SAFE_UUID.match(session_uuid or ""):
        raise ValueError("invalid session_uuid")
    return settings.data_dir / session_uuid


def ensure_session_dir(session_uuid: str) -> Path:
    d = session_dir(session_uuid)
    (d / "gps").mkdir(parents=True, exist_ok=True)
    (d / "accel").mkdir(parents=True, exist_ok=True)
    return d


def write_meta(session_uuid: str, meta: dict) -> None:
    d = ensure_session_dir(session_uuid)
    (d / "meta.json").write_text(json.dumps(meta, default=str, indent=2))


def save_gps_chunk(session_uuid: str, index: int, data: list) -> int:
    d = ensure_session_dir(session_uuid)
    (d / "gps" / f"{index}.json").write_text(json.dumps(data))
    return len(data)


def save_accel_chunk(session_uuid: str, index: int, b64: str) -> int:
    d = ensure_session_dir(session_uuid)
    raw = base64.b64decode(b64)
    (d / "accel" / f"{index}.bin").write_bytes(raw)
    # int16, 3 Achsen pro Sample
    return len(raw) // 2 // 3


def save_accel_raw(session_uuid: str, index: int, raw: bytes) -> int:
    """Wie save_accel_chunk, aber für bereits dekodierte int16-LE-Bytes (z. B. FIT-Import)."""
    d = ensure_session_dir(session_uuid)
    (d / "accel" / f"{index}.bin").write_bytes(raw)
    return len(raw) // 2 // 3


def save_foil_status(session_uuid: str, foil_status: list) -> None:
    """Optionale Ground-Truth (foil_status je gps-Sample) für späteres Training."""
    d = ensure_session_dir(session_uuid)
    (d / "foil_status.json").write_text(json.dumps(foil_status))


def load_foil_status(session_uuid: str) -> list | None:
    f = session_dir(session_uuid) / "foil_status.json"
    return json.loads(f.read_text()) if f.exists() else None


def load_gps(session_uuid: str) -> list:
    """Alle GPS-Chunks in Index-Reihenfolge zu einer flachen Sample-Liste."""
    gps_dir = session_dir(session_uuid) / "gps"
    if not gps_dir.exists():
        return []
    out: list = []
    for f in sorted(gps_dir.glob("*.json"), key=lambda p: int(p.stem)):
        out.extend(json.loads(f.read_text()))
    return out


def gps_last_ms(session_uuid: str) -> int | None:
    """Letzter GPS-Zeitstempel (ms ab Start) — billig: liest NUR den letzten Chunk.
    Für die Endzeit-Anzeige in Listen (ohne die ganze GPS-Spur zu laden)."""
    gps_dir = session_dir(session_uuid) / "gps"
    if not gps_dir.exists():
        return None
    files = sorted(gps_dir.glob("*.json"), key=lambda p: int(p.stem))
    if not files:
        return None
    try:
        data = json.loads(files[-1].read_text())
    except (ValueError, OSError):
        return None
    if not data or not isinstance(data[-1], (list, tuple)) or not data[-1]:
        return None
    try:
        return int(data[-1][0])
    except (TypeError, ValueError):
        return None


def load_accel(session_uuid: str) -> np.ndarray:
    """Alle Accel-Chunks zu einem (N, 3) int16-Array (raw, ungeskaliert)."""
    accel_dir = session_dir(session_uuid) / "accel"
    if not accel_dir.exists():
        return np.empty((0, 3), dtype=np.int16)
    parts = []
    for f in sorted(accel_dir.glob("*.bin"), key=lambda p: int(p.stem)):
        parts.append(np.frombuffer(f.read_bytes(), dtype="<i2"))
    if not parts:
        return np.empty((0, 3), dtype=np.int16)
    flat = np.concatenate(parts)
    n = (flat.size // 3) * 3
    return flat[:n].reshape(-1, 3)
