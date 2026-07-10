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
    # Chat-Read-Only: darf Chats lesen, aber nicht mehr posten (Moderation).
    chat_readonly: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Versteckt: Testkonto (App-Store-Review). Inhalte für ALLE ANDEREN unsichtbar
    # (Feed/Rekorde/Spots/Chat), Konto selbst sieht alles normal. Login bleibt erlaubt.
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Bevorzugte UI-Sprache (de, gsw, de-AT, en, fr, it, es). Default Deutsch.
    language: Mapped[str] = mapped_column(String(8), default="de", server_default="de")
    # Persönliche Erkennungs-Empfindlichkeit (normal|light|attempts) — übersteuert die
    # Foil-Limits NUR für die eigene Auswertung (leichte/langsame Fahrer, Startversuche);
    # Community/Rekorde nutzen immer "normal". Siehe analysis.gps.SENSITIVITY_PRESETS.
    foil_sensitivity: Mapped[str] = mapped_column(String(16), default="normal", server_default="normal")
    # Social-Freigabe (UGC/Feed/Chat): für unter-13 gesperrt (Apple-Vorgabe „soziale Medien",
    # via iOS Declared Age Range API ermittelt). Default true; nur die iOS-Alters-Abfrage setzt es
    # ggf. auf false. age_bracket = zuletzt gemeldete Spanne (under13|13-15|16-17|18+|undisclosed).
    social_allowed: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    age_bracket: Mapped[str | None] = mapped_column(String(16))
    # "Alle Geräte abmelden": Tokens, die VOR diesem Zeitpunkt ausgestellt wurden (iat),
    # werden abgelehnt. NULL = keine Invalidierung. Betrifft nur diesen Nutzer.
    session_epoch: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Zuletzt aktiv (letzter authentifizierter Request; gedrosselt aktualisiert) — für den Admin.
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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


class DevicePairing(Base):
    """Reverse-Pairing: die UHR erzeugt einen Code (zeigt ihn an), der Web-Nutzer
    gibt ihn auf pumpfoil.org ein. Die Uhr pollt mit claim_token auf den Device-Token.
    Nötig, weil die Garmin-App keine Phone-Settings-Seite mehr hat."""

    __tablename__ = "device_pairings"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)       # auf der Uhr angezeigt
    claim_token: Mapped[str] = mapped_column(String(64), unique=True, index=True) # Geheimnis fürs Polling
    device_token: Mapped[str | None] = mapped_column(String(64))                  # gesetzt nach Claim
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))           # gesetzt nach Claim
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
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
    # Zuletzt gemeldete App-Version der Uhr + Plattform (garmin/wear/apple) — beim Sync
    # übertragen, um im Web einen Update-Hinweis zu zeigen.
    app_version: Mapped[str | None] = mapped_column(String(20))
    platform: Mapped[str | None] = mapped_column(String(16))
    # Roh gemeldete Geräte-Part-Number (Garmin worldWidePartNumber) -> später
    # serverseitige Modell-Zuordnung (sobald echte Werte vorliegen).
    part_number: Mapped[str | None] = mapped_column(String(32))
    # Soft-Revoke: Token ungültig, Record bleibt (Session-Zuordnung + Historie erhalten).
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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
    # Dicke nicht aus Quelle, sondern geschätzt (t/c-Annahme) -> in der UI markieren.
    thickness_estimated: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    is_baseline: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


class ChatMessage(Base):
    """Chat/Diskussion — gemeinsame Engine. scope = "session:<id>" | "spot:<name>"."""

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    scope: Mapped[str] = mapped_column(String(140), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    text: Mapped[str] = mapped_column(String(2000))
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    report_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class ChatReport(Base):
    """Meldung einer Chat-Nachricht (1× je Nutzer)."""

    __tablename__ = "chat_reports"
    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_chatreport"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("chat_messages.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class ChatRoomState(Base):
    """Pro Nutzer & Chatraum: zuletzt gelesen, verlassen, Push-Abo (Unread/Leave/Subscribe)."""

    __tablename__ = "chat_room_state"
    __table_args__ = (UniqueConstraint("user_id", "scope", name="uq_chatroomstate"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    scope: Mapped[str] = mapped_column(String(140), index=True)
    last_read_id: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    left: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    push: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


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
    # Spot-Name (per OSM/Overpass, gecacht). "" = nachgeschlagen, nichts gefunden.
    # Bevorzugt ein Ufer-/Venue-Name (leisure=sports_centre/marina/beach…), sonst der Gewässername.
    place_name: Mapped[str | None] = mapped_column(String(120))
    # Gewässername als Zusatz-Label (immer mitgenommen, wenn gefunden) — z. B. wenn place_name
    # ein Ufer-Venue ist, steht hier weiterhin der See/Fluss.
    place_water: Mapped[str | None] = mapped_column(String(120))
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
    # Gehoert zu einer zusammengefuehrten Session: id der Ziel-Session (Quellen archiviert,
    # deleted=True). NULL = eigenstaendig. Siehe app/merge.py.
    merged_into: Mapped[int | None] = mapped_column(Integer)
    # Spot-Cluster (Track-Ueberlappung, siehe app/spots.py). NULL = kein/mehrdeutiger Spot
    # (dann steht in place_name der Gewaessername). Spots sind review-/mergebar (spots-Tabelle).
    spot_id: Mapped[int | None] = mapped_column(Integer, index=True)
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
    # Cache der persönlichen Auswertung JE EMPFINDLICHKEITS-PRESET (nur die != "normal", also
    # aktuell "light"/"attempts"): JSON {preset: {foiling_time_s, foiling_distance_m, num_runs,
    # segments}}. Einmal berechnet -> Umschalten OHNE Neurechnung. "normal" = kanonische Spalten
    # oben. Der Besitzer sieht sein Preset (v. a. die einzelnen LÄUFE auf der Karte), Community
    # nutzt immer die kanonischen (Standard-)Werte.
    sensitivity_json: Mapped[str | None] = mapped_column(Text)
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
    # Ursprungs-Session, falls dieses Foto beim Zusammenfuehren uebernommen wurde
    # (fuer sauberes Auflösen -> Foto wandert zurueck). NULL = original hier.
    merged_from_session_id: Mapped[int | None] = mapped_column(Integer)
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


class Spot(Base):
    """Spot = Cluster sich überschneidender Foiling-Tracks (siehe app/spots.py).
    Der Name hängt hier (einmal geocodet / admin-korrigierbar), nicht an jeder Session.
    name=None → noch nicht benannt (Geocode-Retry). merged_into → Admin-Merge."""

    __tablename__ = "spots"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str | None] = mapped_column(String(120), index=True)  # Spot-Name (venue/water/manual)
    name_source: Mapped[str | None] = mapped_column(String(12))        # "venue" | "water" | "manual"
    water_name: Mapped[str | None] = mapped_column(String(120))        # Gewässer-Label
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    poly_wkt: Mapped[str | None] = mapped_column(Text)                 # gepuffertes Cluster-Polygon (lat/lon-WKT)
    merged_into: Mapped[int | None] = mapped_column(Integer, index=True)
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


class PolarLink(Base):
    """Verknüpfung eines Nutzers mit Polar AccessLink: gespeichertes Access-Token +
    die Polar-User-ID (x_user_id), um dessen Trainings (TCX) abzurufen und als Sessions
    zu importieren. Ein Link pro Nutzer."""

    __tablename__ = "polar_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    polar_user_id: Mapped[str] = mapped_column(String(40), index=True)  # x_user_id von Polar
    access_token: Mapped[str] = mapped_column(String(255))             # langlebiges AccessLink-Token
    member_id: Mapped[str] = mapped_column(String(64))                 # von uns vergebene member-id
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PumpTruth(Base):
    """Vom Owner/Admin getappte echte Pump-Zeitpunkte (Tap-to-Label in der Play-Ansicht,
    synchron zum Video). Ground Truth zur Validierung + zum Training der Pump-Erkennung.
    t_ms = ms ab Session-Start. run_idx optional (pro Lauf getappt). take = Durchlauf-Nr.
    (derselbe Lauf kann mehrfach getappt werden -> Vergleich/Konsens, Start-Offset rauskalibrieren)."""

    __tablename__ = "pump_truth"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    t_ms: Mapped[int] = mapped_column(Integer)
    run_idx: Mapped[int | None] = mapped_column(Integer)
    take: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class CorosLink(Base):
    """Verknüpfung eines Nutzers mit der COROS Open API. Workouts kommen per Push
    (Abschnitt 5.3): COROS POSTet Summaries inkl. fitUrl, wir laden die .fit und
    importieren sie. open_id ist die COROS-User-ID (Mapping Push -> unser Nutzer).
    access_token/refresh_token für deauthorize + optionalen Pull. Ein Link pro Nutzer."""

    __tablename__ = "coros_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    open_id: Mapped[str] = mapped_column(String(64), index=True)        # COROS openId
    access_token: Mapped[str] = mapped_column(String(255))             # gültig 30 Tage
    refresh_token: Mapped[str] = mapped_column(String(255))            # läuft nie ab
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SuuntoLink(Base):
    """Verknüpfung eines Nutzers mit der Suunto Cloud API (OAuth2). accessToken läuft
    täglich ab (expires_in 86400) -> refresh_token. Workouts werden gezogen und je FIT
    importiert (fitimport/import_parsed_session). Ein Link pro Nutzer."""

    __tablename__ = "suunto_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    access_token: Mapped[str] = mapped_column(Text)                    # JWT
    refresh_token: Mapped[str] = mapped_column(String(255))
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Suunto-Username (aus dem Token-Response, Feld "user") — für die Webhook-Zuordnung
    # (Notification enthält den Username, nicht unsere user_id).
    suunto_username: Mapped[str | None] = mapped_column(String(128), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StravaLink(Base):
    """Verknüpfung eines Nutzers mit der Strava API (OAuth2). access_token läuft alle 6h ab
    (expires_at = absoluter Unix-Stempel) -> refresh_token (langlebig). Aktivitäten werden
    gezogen und aus den GPS-Streams (latlng/time/velocity) als Session importiert — Strava
    bietet KEINEN FIT-Download über die API. Ein Link pro Nutzer."""

    __tablename__ = "strava_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str] = mapped_column(String(255))
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    athlete_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NewsBanner(Base):
    """Singleton (id=1): Inhalt + Version des Willkommens-/News-Banners der PWA.
    Wird per API abgefragt; die PWA vergleicht `version` mit ihrem localStorage-Wert
    und zeigt den Banner, wenn `enabled` und version > weggeklickte Version. So lässt
    sich News posten, ohne die PWA neu zu bauen — nur `version` bumpen / `text_json` ändern.
    text_json = JSON {lang: text} (de/gsw/de-AT/en/fr/it/es), Fallback auf 'de'."""

    __tablename__ = "news_banner"

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    text_json: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class UserBlock(Base):
    """1:1-Chat: blocker_id hat blocked_id blockiert -> keine Direktnachrichten mehr
    zwischen den beiden (in beide Richtungen geprüft). Melden bleibt davon unberührt."""

    __tablename__ = "user_blocks"
    __table_args__ = (UniqueConstraint("blocker_id", "blocked_id", name="uq_user_block"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    blocker_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    blocked_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class SessionTransfer(Base):
    """Übertragung einer Session an einen anderen Nutzer (z. B. Uhr verliehen, der andere ist
    gefahren). Absender (from_user_id) initiiert → Empfänger (to_user_id) nimmt an, dann wandert
    die Eigentümerschaft (Session.user_id = to_user_id). status: pending|accepted|declined|cancelled.
    Höchstens eine offene (pending) Übertragung je Session."""

    __tablename__ = "session_transfers"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(12), default="pending", server_default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RateEvent(Base):
    """Ein Treffer für den Rate-Limiter (DB-gestützt → worker-übergreifend konsistent bei
    mehreren uvicorn-Prozessen). `key` = "<scope>:<ip>" bzw. "<scope>:u<uid>:<stufe>".
    Sliding-Window: pro Prüfung alte Einträge des Keys löschen + im Fenster zählen."""

    __tablename__ = "rate_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(80), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class ReanalysisProgress(Base):
    """Fortschritt der Hintergrund-Reanalyse je Nutzer (DB → jeder Worker kann ihn lesen/schreiben)."""

    __tablename__ = "reanalysis_progress"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    running: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    done: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
