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
    _seed_stabs()
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
        # Max-Puls-Rekord: der einzige Rekord, der NICHT in einer Spalte steht, sondern per JSONB
        # aus metrics_json gezogen wird (community._MAX_HR). Ohne Index war das ein Seq Scan ueber
        # analysis_results, der je Zeile ~580 Byte JSON parst, nur um eine Zahl zu sortieren —
        # gemessen 10,9 ms je Zeitraum, also ~55 ms von 145 ms des Rekord-Endpunkts (18.08.).
        # Der Ausdruck muss ZEICHENGLEICH zu dem sein, den community._MAX_HR erzeugt, sonst nutzt
        # der Planer den Index nicht. Alle drei Bausteine (Cast auf jsonb, jsonb_extract_path_text,
        # Cast auf float) sind immutable, deshalb ueberhaupt indexierbar. Postgres-only; auf dem
        # SQLite-Dev-Fallback scheitert das Statement und wird unten geschluckt.
        "CREATE INDEX IF NOT EXISTS ix_analysis_results_max_hr ON analysis_results "
        "((CAST(NULLIF(jsonb_extract_path_text(CAST(metrics_json AS JSONB), 'max_hr'), '') AS FLOAT)) DESC)",
        # Per-User-Empfindlichkeit — neue Spalten idempotent ergänzen. Cache je Preset in einem
        # JSON-Feld (sensitivity_json); die früheren Einzel-*_personal-Spalten wieder entfernen.
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS foil_sensitivity VARCHAR(16) DEFAULT 'normal'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS pump_unit VARCHAR(8) DEFAULT 'hz'",
        "ALTER TABLE foils ADD COLUMN IF NOT EXISTS specs_estimated BOOLEAN DEFAULT false",
        # Puls-Anstieg je Session (Median des Hoechstpulses bis Minute 1/2/5), lazy gefuellt.
        "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS hr_by_min_json TEXT",
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
        # Eigene Stab-Einträge (user_id NULL = globaler Katalog) — die Hersteller-Landschaft ist
        # zu groß/volatil für einen vollständigen Katalog, jeder darf seinen Stab selbst benennen.
        "ALTER TABLE stabs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
        # Canary-Meldung der dynamischen Layouts je Uhr (selbstlernender Kill-Switch je Modell).
        "ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS layout_canary_count INTEGER DEFAULT 0",
        "ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS layout_canary_at TIMESTAMPTZ",
        # Voller Object Store der Uhr, gemeldet MIT gepuffertem Volumen -> echte Store-Groesse je
        # Modell lernen, statt eine Warnschwelle zu raten (s. models.DeviceToken).
        "ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS storage_full_count INTEGER DEFAULT 0",
        "ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS storage_full_kb INTEGER DEFAULT 0",
        "ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS storage_full_at TIMESTAMPTZ",
        # Lauf-Canary der Uhr (ab 1.0.77): unsauber beendeter App-Lauf samt Phase. S. models.py.
        "ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS crash_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS crash_phase INTEGER",
        "ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS crash_at TIMESTAMPTZ",
        "ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ",
        # Detailed Setup je Session (je NULL = Standard des Nutzers aus settings_json).
        # Stab = Katalog (stabs), Board = eigene Einträge (boards); Mast/Shim sind reine Werte.
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS stab_id INTEGER REFERENCES stabs(id)",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mast_len_cm INTEGER",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS shim_deg DOUBLE PRECISION",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS board_id INTEGER REFERENCES boards(id)",
        # „ausgewertet"-Push genau EINMAL je Session (kein Re-Push bei /complete-Retries/Re-Analyse).
        # Altbestand (schon analysiert) als benachrichtigt markieren -> keine Nachhol-Pushes.
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS analyzed_notified BOOLEAN",
        "UPDATE sessions SET analyzed_notified = true WHERE analyzed_notified IS NULL AND status = 'analyzed'",
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
        # Start-Erfolgsquote (nur Anzeige): attempts-Preset-Lauf-Distanzen; additiv, keine anderen Stats.
        "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS start_attempts_json TEXT",
        # Sportart-Klassifikation durch Menschen (docs/sport-classification.md). Defaults so, dass
        # Altbestand unverändert als Pumpfoil zählt — die Migration darf nichts umklassifizieren.
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sport_class VARCHAR(16) DEFAULT 'pumpfoil'",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS data_quality VARCHAR(16) DEFAULT 'ok'",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sport_source VARCHAR(10) DEFAULT 'default'",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS needs_classification BOOLEAN DEFAULT FALSE",
        # Begruendung der automatischen Sportart-Erkennung (app/analysis/sportauto.py).
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sport_auto_json TEXT",
        # Zurueckgeholte Fremdkraft-Laeufe (Erkennung v2, app/analysis/detect_v2.py).
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fremdkraft_keep TEXT",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS appeal_text TEXT",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS appeal_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS flag_blocked BOOLEAN DEFAULT FALSE",
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


def _seed_stabs() -> None:
    """Stab-Katalog aus app/data/stabs.json befüllen (nur Bezeichnungen).

    Bewusst NUR Marke/Modell/Größe — genau die Bezeichnung, die der Nutzer auswählt und angezeigt
    bekommt (z. B. „GONG Stab Trail L"). Maße werden nirgends verrechnet, also pflegen wir sie
    auch nicht; fehlt eine Bezeichnung im Katalog, legt der Nutzer sie sich privat selbst an
    (`Stab.user_id`). Idempotent je Variante wie `_seed_foils`.
    """
    import json
    from pathlib import Path

    from . import models

    db = SessionLocal()
    try:
        f = Path(__file__).parent / "data" / "stabs.json"
        if not f.exists():
            return
        existing = {(x.brand, x.model, x.size) for x in db.query(
            models.Stab.brand, models.Stab.model, models.Stab.size).all()}
        added = 0
        for r in json.loads(f.read_text()):
            key = (r["brand"], r["model"], r["size"])
            if key in existing:
                continue
            db.add(models.Stab(brand=key[0], model=key[1], size=key[2]))
            added += 1
        if added:
            # 4 uvicorn-Worker seeden gleichzeitig. Der Zweite läuft entweder in
            # uq_stab_variant (IntegrityError) oder — bei größeren Batches — in einen
            # Postgres-Deadlock, weil beide dieselben Zeilen in anderer Reihenfolge sperren.
            # Beides ist harmlos: der Gewinner schreibt alle Zeilen, der Verlierer verwirft.
            # (Ohne das Abfangen stirbt EIN Worker beim Start — real passiert 2026-07-26.)
            from sqlalchemy.exc import IntegrityError, OperationalError
            try:
                db.commit()
            except (IntegrityError, OperationalError):
                db.rollback()
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
            "excluded_ranges": "TEXT",
            "app_version": "VARCHAR(20)",
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
            "expected_chunks": "INTEGER",
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
            "gnss_mode": "VARCHAR(8)",
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
                    # IF NOT EXISTS: mehrere uvicorn-Worker rufen init_db() beim Start GLEICHZEITIG auf.
                    # Ohne IF NOT EXISTS gewinnt ein Worker das ADD, ein anderer (dessen `existing`-
                    # Snapshot die Spalte noch nicht sah) crasht mit DuplicateColumn -> "startup failed".
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {sqltype}"))
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
