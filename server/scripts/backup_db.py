#!/usr/bin/env python3
"""DB-Backup mit Rotation. Erkennt PostgreSQL (pg_dump, custom/komprimiert) bzw.
SQLite (.backup-API + gzip) anhand DATABASE_URL.

Aufruf (systemd-Timer): python -m scripts.backup_db
ENV: BACKUP_DIR (Default ~/backups/foil-db), BACKUP_KEEP (Default 14)
"""
from __future__ import annotations

import gzip
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402


def _backup_dir() -> Path:
    d = Path(os.environ.get("BACKUP_DIR", Path.home() / "backups" / "foil-db")).expanduser()
    d.mkdir(parents=True, exist_ok=True)
    return d


def _rotate(backup_dir: Path, pattern: str, keep: int) -> int:
    files = sorted(backup_dir.glob(pattern))
    removed = 0
    for old in (files[:-keep] if keep > 0 else []):
        old.unlink(missing_ok=True); removed += 1
    return removed


def backup_postgres(url: str, backup_dir: Path, keep: int, stamp: str) -> Path:
    # SQLAlchemy-URL -> libpq-URL (pg_dump kennt kein '+psycopg')
    libpq = url.replace("postgresql+psycopg://", "postgresql://").replace("postgresql+psycopg2://", "postgresql://")
    out = backup_dir / f"foil-{stamp}.dump"  # custom format ist bereits komprimiert
    subprocess.run(["pg_dump", "--format=custom", "--no-owner", "--file", str(out), libpq], check=True)
    _rotate(backup_dir, "foil-*.dump", keep)
    return out


def backup_sqlite(rel: str, backup_dir: Path, keep: int, stamp: str) -> Path:
    src = Path(rel)
    if not src.is_absolute():
        src = (Path(__file__).resolve().parents[1] / src)
    out = backup_dir / f"foil-{stamp}.sqlite3.gz"
    with tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        sc = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
        dc = sqlite3.connect(str(tmp_path))
        with dc:
            sc.backup(dc)
        sc.close(); dc.close()
        with open(tmp_path, "rb") as fi, gzip.open(out, "wb", compresslevel=6) as fo:
            shutil.copyfileobj(fi, fo)
    finally:
        tmp_path.unlink(missing_ok=True)
    _rotate(backup_dir, "foil-*.sqlite3.gz", keep)
    return out


def main() -> int:
    url = get_settings().database_url
    backup_dir = _backup_dir()
    keep = int(os.environ.get("BACKUP_KEEP", "14"))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    if url.startswith("postgresql"):
        out = backup_postgres(url, backup_dir, keep, stamp)
    elif url.startswith("sqlite"):
        out = backup_sqlite(url.split("///", 1)[1], backup_dir, keep, stamp)
    else:
        raise SystemExit(f"Unbekannte DATABASE_URL: {url}")
    n = len(list(backup_dir.glob("foil-*")))
    print(f"Backup: {out} ({out.stat().st_size / 1e6:.1f} MB) | vorhanden: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
