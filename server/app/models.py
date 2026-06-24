"""Datenbankmodelle.

Rohdaten (GPS/Accel-Samples) liegen NICHT in der DB, sondern unveränderlich als Dateien
unter settings.data_dir/<session_uuid>/ (siehe storage.py). Die DB hält nur Metadaten,
Analyse-Ergebnisse und Labels.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # Öffentlicher Anzeigename (Community), eindeutig. Mehrere NULL erlaubt.
    display_name: Mapped[str | None] = mapped_column(String(40), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # Freie Nutzer-Einstellungen als JSON (z. B. Farbskala-Grenzen).
    settings_json: Mapped[str | None] = mapped_column(Text)
    # Öffentliche /media-URL des Profilbilds (Community).
    avatar_url: Mapped[str | None] = mapped_column(String(255))
    # Admin: darf moderieren (alles sehen, freigeben/löschen).
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Gesperrt: kein Login, Token ungültig, Inhalte aus der Community ausgeblendet.
    blocked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Bevorzugte UI-Sprache (de, gsw, de-AT, en, fr, it, es). Default Deutsch.
    language: Mapped[str] = mapped_column(String(8), default="de", server_default="de")

    devices: Mapped[list["DeviceToken"]] = relationship(back_populates="user")
    sessions: Mapped[list["Session"]] = relationship(back_populates="user")


class PairingCode(Base):
    """Kurzlebiger Code, den die Website generiert und der Nutzer in der Uhr einträgt."""

    __tablename__ = "pairing_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class DeviceToken(Base):
    """Dauerhafter Token einer gepairten Uhr. Wird bei jedem Upload mitgeschickt."""

    __tablename__ = "device_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    label: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="devices")


class Foil(Base):
    """Foil-Katalog (Stammdaten). Abgeleitetes (AR/CL/Drag/Power) wird gerechnet."""

    __tablename__ = "foils"
    __table_args__ = (UniqueConstraint("brand", "model", "size", name="uq_foil_variant"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    brand: Mapped[str] = mapped_column(String(60), index=True)
    model: Mapped[str] = mapped_column(String(80))
    size: Mapped[str] = mapped_column(String(20))
    span_cm: Mapped[float] = mapped_column(Float)
    area_cm2: Mapped[float] = mapped_column(Float)
    thickness_mm: Mapped[float] = mapped_column(Float)
    is_baseline: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


class PushSubscription(Base):
    """Web-Push-Subscription eines Browsers/Geräts (VAPID)."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    endpoint: Mapped[str] = mapped_column(String(500), unique=True, index=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Session(Base):
    """Eine aufgezeichnete Foil-Session."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[int | None] = mapped_column(ForeignKey("device_tokens.id"))
    # SHA-256 der FIT-Bytes (für Duplikat-Erkennung beim Upload).
    content_hash: Mapped[str | None] = mapped_column(String(64), index=True)

    sport: Mapped[str] = mapped_column(String(40), default="pumpfoil")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    gps_hz: Mapped[int] = mapped_column(Integer, default=1)
    accel_hz: Mapped[int] = mapped_column(Integer, default=25)
    accel_scale: Mapped[int] = mapped_column(Integer, default=2048)

    # "recording" → Chunks kommen rein; "complete" → Rohdaten persistiert; "analyzed".
    status: Mapped[str] = mapped_column(String(20), default="recording")
    total_chunks: Mapped[int | None] = mapped_column(Integer)
    # Optionaler Zuschnitt (ms ab Session-Start). Gesetzt -> alle Analysen nutzen nur
    # [trim_start_ms, trim_end_ms] (z. B. Auto-Heimfahrt nach dem Foilen abschneiden).
    trim_start_ms: Mapped[int | None] = mapped_column(Integer)
    trim_end_ms: Mapped[int | None] = mapped_column(Integer)
    # Name des Gewässers (per OSM/Overpass aufgelöst, gecacht). "" = nachgeschlagen, nichts gefunden.
    place_name: Mapped[str | None] = mapped_column(String(120))
    # Repräsentative Koordinaten (Median der GPS-Punkte) — für die Spot-Karte.
    place_lat: Mapped[float | None] = mapped_column(Float)
    place_lon: Mapped[float | None] = mapped_column(Float)
    # Mit welchem Foil gefahren (Foil.id). null -> Standard-Foil des Nutzers.
    foil_id: Mapped[int | None] = mapped_column(ForeignKey("foils.id"))
    # Eigene Beschriftung des Besitzers (frei, max 30 Zeichen) + optionale YouTube-URL.
    caption: Mapped[str | None] = mapped_column(String(40))
    youtube_url: Mapped[str | None] = mapped_column(String(255))
    # Zeitpunkt der Video-Verknüpfung (für „neueste Medien"-Sortierung im Community-Feed).
    youtube_added_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Soft-Delete: Tombstone bleibt erhalten (content_hash/started_at) -> blockt Reimport.
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Pumpfoil-Klassifikation (bei der Analyse gesetzt). NULL = noch nicht analysiert.
    is_pumpfoil: Mapped[bool | None] = mapped_column(Boolean)
    # Moderation: flagged = als unangemessen gemeldet -> in Community ausgeblendet,
    # bis ein Admin entscheidet. mod_ok = vom Admin freigegeben (nicht erneut flaggen).
    flagged: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    mod_ok: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    user: Mapped["User"] = relationship(back_populates="sessions")
    chunks: Mapped[list["IngestChunk"]] = relationship(back_populates="session")
    result: Mapped["AnalysisResult | None"] = relationship(back_populates="session")
    labels: Mapped[list["Label"]] = relationship(back_populates="session")


class IngestChunk(Base):
    """Eingegangener Roh-Chunk (zum Tracking von Vollständigkeit/Resume)."""

    __tablename__ = "ingest_chunks"
    __table_args__ = (
        UniqueConstraint("session_id", "kind", "index", name="uq_chunk"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # "gps" | "accel"
    index: Mapped[int] = mapped_column(Integer)
    sample_count: Mapped[int] = mapped_column(Integer, default=0)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    session: Mapped["Session"] = relationship(back_populates="chunks")


class AnalysisResult(Base):
    """Ergebnis der serverseitigen Analyse (GPS-MVP, später Accel/ML)."""

    __tablename__ = "analysis_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), unique=True)
    algo_version: Mapped[str] = mapped_column(String(40))

    total_distance_m: Mapped[float | None] = mapped_column(Float)
    foiling_distance_m: Mapped[float | None] = mapped_column(Float)
    foiling_time_s: Mapped[float | None] = mapped_column(Float)
    max_speed_mps: Mapped[float | None] = mapped_column(Float)
    pump_count: Mapped[int | None] = mapped_column(Integer)
    avg_cadence_hz: Mapped[float | None] = mapped_column(Float)

    # GeoJSON-Track + Segment-Liste als JSON-Text (Pydantic serialisiert beim Lesen).
    track_geojson: Mapped[str | None] = mapped_column(Text)
    segments_json: Mapped[str | None] = mapped_column(Text)
    # Accel-Fenster (Pump/Glide/Idle) als JSON-Text (Phase 2).
    accel_windows_json: Mapped[str | None] = mapped_column(Text)
    # Erweiterte Kennzahlen (Puls, Ø/Max/Min-Speed, Segment-Extreme …) als JSON.
    metrics_json: Mapped[str | None] = mapped_column(Text)
    # Kompakte Track-Vorschau: normalisierte Polylinien der Foiling-Läufe (ohne Karte),
    # als JSON {"w":..,"h":..,"lines":[[[x,y],...],...]} — für Mini-SVG in der Liste.
    track_preview: Mapped[str | None] = mapped_column(Text)

    # Denormalisierte Bestwerte je Session (für schnelle Community-Aggregate ohne
    # JSON-Parsing/Full-Scan). In run_analysis gesetzt.
    detection: Mapped[str | None] = mapped_column(String(20), index=True)
    num_runs: Mapped[int | None] = mapped_column(Integer)
    best_distance_m: Mapped[float | None] = mapped_column(Float, index=True)
    best_duration_s: Mapped[float | None] = mapped_column(Float)
    best_speed_mps: Mapped[float | None] = mapped_column(Float, index=True)
    best_glide_s: Mapped[float | None] = mapped_column(Float)
    best_distance_idx: Mapped[int | None] = mapped_column(Integer)
    best_duration_idx: Mapped[int | None] = mapped_column(Integer)
    best_speed_idx: Mapped[int | None] = mapped_column(Integer)
    best_glide_idx: Mapped[int | None] = mapped_column(Integer)
    max_pump_hz: Mapped[float | None] = mapped_column(Float)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    session: Mapped["Session"] = relationship(back_populates="result")


class Label(Base):
    """Vom Nutzer auf der Website gesetztes Segment-Label (Trainingsdaten fürs ML)."""

    __tablename__ = "labels"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    t_start_ms: Mapped[int] = mapped_column(Integer)
    t_end_ms: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(20))  # "pump" | "glide" | "not_foiling"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    session: Mapped["Session"] = relationship(back_populates="labels")


class SessionLike(Base):
    """Like eines Nutzers auf eine (fremde oder eigene) Session."""

    __tablename__ = "session_likes"
    __table_args__ = (UniqueConstraint("user_id", "session_id", name="uq_like_user_session"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class SessionVote(Base):
    """Community-Moderationssignal: 'fake' (sieht unecht aus) oder 'inappropriate'."""

    __tablename__ = "session_votes"
    __table_args__ = (UniqueConstraint("user_id", "session_id", "kind", name="uq_vote_user_session_kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # "fake" | "inappropriate"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class SessionPhoto(Base):
    """Vom Besitzer hochgeladenes Foto zu einer eigenen Session."""

    __tablename__ = "session_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    url: Mapped[str] = mapped_column(String(255))           # öffentliche /media-URL
    # Vom Admin geblockt -> aus Anzeige/Feed raus (Datei bleibt, kann freigegeben werden).
    blocked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PasswordReset(Base):
    """Einmal-Token für Passwort-Reset per E-Mail (zeitlich begrenzt)."""

    __tablename__ = "password_resets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class AdminAudit(Base):
    """Protokoll der Admin-/Moderationsaktionen (wer, was, woran, wann)."""

    __tablename__ = "admin_audit"

    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(40))        # z. B. "session_delete", "user_block"
    target_type: Mapped[str] = mapped_column(String(20))   # "session" | "user" | "photo"
    target_id: Mapped[int | None] = mapped_column(Integer)
    detail: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class WaterPolygon(Base):
    """Gecachte OSM-Wasserfläche je Ort (Raster ~111 m). Für Land/Wasser-Prüfung
    der Lauf-Endpunkte. rings_json="" = nachgeschlagen, kein Wasser gefunden."""

    __tablename__ = "water_polygons"

    id: Mapped[int] = mapped_column(primary_key=True)
    grid_key: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    rings_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class OAuthIdentity(Base):
    """Verknüpfung eines externen OAuth-Kontos (Google/Apple/Strava/Garmin) mit
    einem lokalen User. provider+subject ist eindeutig."""

    __tablename__ = "oauth_identities"
    __table_args__ = (UniqueConstraint("provider", "subject", name="uq_oauth"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20), index=True)  # google|apple|strava|garmin
    subject: Mapped[str] = mapped_column(String(191))             # stabile User-ID beim Provider
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Feedback(Base):
    """Nutzer-Feedback aus dem globalen Feedback-Widget. Speichert Text + die
    Ansicht/URL, auf die es sich bezieht. Nur im Admin-Bereich sichtbar."""

    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    text: Mapped[str] = mapped_column(String(500))
    url: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
