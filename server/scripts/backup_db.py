#!/usr/bin/env python3
"""DB-Backup mit Rotation: pg_dump im custom-Format (bereits komprimiert) anhand DATABASE_URL.

Aufruf (systemd-Timer): python -m scripts.backup_db
ENV: BACKUP_DIR (Default ~/backups/foil-db), BACKUP_KEEP (Default 14)
"""
from __future__ import annotations

import os
import subprocess
import sys
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


def main() -> int:
    url = get_settings().database_url
    backup_dir = _backup_dir()
    keep = int(os.environ.get("BACKUP_KEEP", "14"))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out = backup_postgres(url, backup_dir, keep, stamp)
    n = len(list(backup_dir.glob("foil-*")))
    print(f"Backup: {out} ({out.stat().st_size / 1e6:.1f} MB) | vorhanden: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
