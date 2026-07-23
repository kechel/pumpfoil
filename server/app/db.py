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
    _migrate_add_indexes()
    _seed_foils()
    _seed_news()


def _migrate_add_indexes() -> None:
    """Leichte Auto-Migration: fehlende Indexe für die häufigen Community-/Rekord-/Spot-
    Queries ergänzen (idempotent, non-destruktiv). Bei kleiner DB noch egal, aber
    zukunftssicher, sobald viele Sessions/Nachrichten zusammenkommen."""
    from sqlalchemy import text

    stmts = [
        # Spot-Filter (WHERE place_name = …) + GROUP BY place_name (spot-map/-sessions/-records).
        "CREATE INDEX IF NOT EXISTS ix_sessions_place_name ON sessions (place_name)",
        # „Meine Sessions" paginiert: user_id + neueste zuerst in einem Composite.
        "CREATE INDEX IF NOT EXISTS ix_sessions_user_id_started_at ON sessions (user_id, started_at DESC)",
        # Rekord-Queries ORDER BY <spalte> DESC LIMIT 1 (best_distance_m/best_speed_mps gibt's schon).
        "CREATE INDEX IF NOT EXISTS ix_analysis_results_best_duration_s ON analysis_results (best_duration_s)",
        "CREATE INDEX IF NOT EXISTS ix_analysis_results_best_glide_s ON analysis_results (best_glide_s)",
        "CREATE INDEX IF NOT EXISTS ix_analysis_results_num_runs ON analysis_results (num_runs)",
        # Per-User-Empfindlichkeit — neue Spalten idempotent ergänzen. Cache je Preset in einem
        # JSON-Feld (sensitivity_json); die früheren Einzel-*_personal-Spalten wieder entfernen.
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS foil_sensitivity VARCHAR(16) DEFAULT 'normal'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS social_allowed BOOLEAN DEFAULT true",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS age_bracket VARCHAR(16)",
        # App-Caching: „zuletzt geändert" je Session (Backfill = created_at für Altbestand).
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",
        "UPDATE sessions SET updated_at = created_at WHERE updated_at IS NULL",
        # Aufnahme-Platzierung (Handy-Recorder „Record on Phone" = 'phone', sonst Uhr).
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS placement VARCHAR(16)",
        # Aufnahme-Gerät (Modell + OS) — nur zur Fehlersuche.
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_model VARCHAR(80)",
        # Öffentlicher Teilen-Token (read-only Session-Link ohne Login).
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS share_token VARCHAR(64)",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pumpfoil_override BOOLEAN",
        # Feedback: ⭐-Markierung fürs Testimonial-Archiv (überlebt 'Alle löschen').
        "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT false",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_sessions_share_token ON sessions (share_token)",
        # Reverse-Pairing: Uhr meldet ihre Plattform/Label bei pair-init -> beim Claim übernommen.
        "ALTER TABLE device_pairings ADD COLUMN IF NOT EXISTS label VARCHAR(120)",
        "ALTER TABLE device_pairings ADD COLUMN IF NOT EXISTS platform VARCHAR(16)",
        "ALTER TABLE suunto_links ADD COLUMN IF NOT EXISTS suunto_username VARCHAR(128)",
        "ALTER TABLE suunto_links ALTER COLUMN refresh_token TYPE TEXT",
        "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS sensitivity_json TEXT",
        "ALTER TABLE analysis_results DROP COLUMN IF EXISTS foiling_time_s_personal",
        "ALTER TABLE analysis_results DROP COLUMN IF EXISTS foiling_distance_m_personal",
        "ALTER TABLE analysis_results DROP COLUMN IF EXISTS num_runs_personal",
        "ALTER TABLE analysis_results DROP COLUMN IF EXISTS segments_personal_json",
    ]
    with engine.begin() as conn:
        for s in stmts:
            try:
                conn.execute(text(s))
            except Exception:  # noqa: BLE001 — SQLite-Dev kann DESC/Teilsyntax anders handhaben; egal
                pass


def _seed_foils() -> None:
    """Foil-Katalog einmalig aus app/data/foils.json befüllen (idempotent)."""
    import json
    from pathlib import Path

    from . import models

    db = SessionLocal()
    try:
        f = Path(__file__).parent / "data" / "foils.json"
        if not f.exists():
            return
        # Idempotent je Variante (brand/model/size): vorhandene überspringen, neue ergänzen.
        existing = {(x.brand, x.model, x.size) for x in db.query(
            models.Foil.brand, models.Foil.model, models.Foil.size).all()}
        added = 0
        for r in json.loads(f.read_text()):
            key = (r["brand"], r["model"], r["size"])
            if key in existing:
                continue
            db.add(models.Foil(
                brand=r["brand"], model=r["model"], size=r["size"],
                span_cm=r["span_cm"], area_cm2=r["area_cm2"],
                thickness_mm=r["thickness_mm"],
                thickness_estimated=bool(r.get("thickness_estimated")),
                is_baseline=bool(r.get("is_baseline")),
            ))
            added += 1
        if added:
            db.commit()
    finally:
        db.close()


def _seed_news() -> None:
    """News-Banner-Singleton einmalig anlegen (idempotent). Danach nur noch per Admin
    gepflegt (Version/Text) — kein PWA-Rebuild mehr nötig."""
    import json

    from . import models

    db = SessionLocal()
    try:
        if db.query(models.NewsBanner).first():
            return
        texts = {
            "de": "Neue Updates für die Android- und iOS-App im Store — jetzt aktualisieren!",
            "de-AT": "Neue Updates für die Android- und iOS-App im Store — jetzt aktualisieren!",
            "gsw": "Nöii Updates für d Android- und iOS-App im Store — jetz aktualisiere!",
            "en": "New updates for the Android and iOS app in the store — update now!",
            "fr": "Nouvelles mises à jour de l'app Android et iOS dans le store — mets à jour maintenant !",
            "it": "Nuovi aggiornamenti per l'app Android e iOS nello store — aggiorna ora!",
            "es": "Nuevas actualizaciones para la app de Android e iOS en la tienda — ¡actualiza ahora!",
        }
        db.add(models.NewsBanner(version=3, enabled=True, text_json=json.dumps(texts, ensure_ascii=False)))
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
            "place_water": "VARCHAR(120)",
            "deleted": "BOOLEAN DEFAULT 0",
            "is_pumpfoil": "BOOLEAN",
            "flagged": "BOOLEAN DEFAULT 0",
            "mod_ok": "BOOLEAN DEFAULT 0",
            "place_lat": "FLOAT",
            "place_lon": "FLOAT",
            "foil_id": "INTEGER",
            "merged_into": "INTEGER",
            "spot_id": "INTEGER",
        },
        "users": {
            "display_name": "VARCHAR(40)",
            "avatar_url": "VARCHAR(255)",
            "is_admin": "BOOLEAN DEFAULT 0",
            "blocked": "BOOLEAN DEFAULT 0",
            "chat_readonly": "BOOLEAN DEFAULT false",
            "hidden": "BOOLEAN DEFAULT false",
            "session_epoch": "TIMESTAMP WITH TIME ZONE",
            "last_seen_at": "TIMESTAMP WITH TIME ZONE",
        },
        "session_photos": {
            "blocked": "BOOLEAN DEFAULT 0",
            "merged_from_session_id": "INTEGER",
        },
        "device_tokens": {
            "revoked_at": "TIMESTAMP WITH TIME ZONE",
            "app_version": "VARCHAR(20)",
            "platform": "VARCHAR(16)",
            "part_number": "VARCHAR(32)",
            "record_mode": "VARCHAR(8)",
        },
        "foils": {
            "thickness_estimated": "BOOLEAN DEFAULT false",
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
            "carve_s": "INTEGER",
            "carve_m": "INTEGER",
            "carve_l": "INTEGER",
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
