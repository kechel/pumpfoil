"""SQLAlchemy-Setup. SQLite für Dev, Postgres für Prod (via DATABASE_URL)."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

settings = get_settings()

_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)
engine = create_engine(settings.database_url, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Tabellen anlegen. Für echte Migrationen später Alembic."""
    from . import models  # noqa: F401  (Modelle registrieren)

    Base.metadata.create_all(bind=engine)
    _migrate_add_columns()
    _seed_foils()


def _seed_foils() -> None:
    """Foil-Katalog einmalig aus app/data/foils.json befüllen (idempotent)."""
    import json
    from pathlib import Path

    from . import models

    db = SessionLocal()
    try:
        if db.query(models.Foil).first() is not None:
            return
        f = Path(__file__).parent / "data" / "foils.json"
        if not f.exists():
            return
        for r in json.loads(f.read_text()):
            db.add(models.Foil(
                brand=r["brand"], model=r["model"], size=r["size"],
                span_cm=r["span_cm"], area_cm2=r["area_cm2"],
                thickness_mm=r["thickness_mm"], is_baseline=bool(r.get("is_baseline")),
            ))
        db.commit()
    finally:
        db.close()


def _migrate_add_columns() -> None:
    """Leichte Auto-Migration: fehlende Spalten ergänzen (Dev ohne Alembic)."""
    from sqlalchemy import inspect, text

    want = {
        "sessions": {
            "trim_start_ms": "INTEGER",
            "trim_end_ms": "INTEGER",
            "place_name": "VARCHAR(120)",
            "deleted": "BOOLEAN DEFAULT 0",
            "is_pumpfoil": "BOOLEAN",
            "flagged": "BOOLEAN DEFAULT 0",
            "mod_ok": "BOOLEAN DEFAULT 0",
        },
        "users": {
            "display_name": "VARCHAR(40)",
            "avatar_url": "VARCHAR(255)",
            "is_admin": "BOOLEAN DEFAULT 0",
            "blocked": "BOOLEAN DEFAULT 0",
        },
        "session_photos": {
            "blocked": "BOOLEAN DEFAULT 0",
        },
        "analysis_results": {
            "detection": "VARCHAR(20)",
            "num_runs": "INTEGER",
            "best_distance_m": "FLOAT",
            "best_duration_s": "FLOAT",
            "best_speed_mps": "FLOAT",
            "best_glide_s": "FLOAT",
            "best_distance_idx": "INTEGER",
            "best_duration_idx": "INTEGER",
            "best_speed_idx": "INTEGER",
            "best_glide_idx": "INTEGER",
            "max_pump_hz": "FLOAT",
        },
    }
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in want.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, sqltype in cols.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sqltype}"))
        # Eindeutigkeit des Anzeigenamens (mehrere NULL bleiben erlaubt).
        if insp.has_table("users"):
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_display_name "
                "ON users(display_name)"
            ))
        # Sortier-/Cutoff-Spalte für Feed/Rekorde/Verlauf/Monatsfilter.
        if insp.has_table("sessions"):
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_sessions_started_at ON sessions(started_at)"
            ))
