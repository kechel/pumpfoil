"""Pydantic-Schemas für Request/Response."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# --- Auth ---
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str | None = None
    language: str | None = None


class ProfileIn(BaseModel):
    display_name: str | None = None
    language: str | None = None
    foil_sensitivity: str | None = None   # normal|light|attempts (persönliche Erkennungs-Empfindlichkeit)


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class AgeRangeIn(BaseModel):
    # Von der iOS-App aus der Declared Age Range API gemeldet: social_allowed = Nutzer ist
    # alt genug (>=13); age_bracket zur Doku (under13|13-15|16-17|18+|undisclosed).
    social_allowed: bool
    age_bracket: str | None = None


class ProfileOut(BaseModel):
    email: EmailStr
    display_name: str | None = None
    avatar_url: str | None = None
    is_admin: bool = False
    language: str = "de"
    beta: bool = False   # Beta-Features (z. B. Polar-BLE-Recorder) nur für Allowlist-User
    foil_sensitivity: str = "normal"   # persönliche Erkennungs-Empfindlichkeit (normal|light|attempts)
    social_allowed: bool = True   # UGC/Feed/Chat freigegeben (false = unter 13, Apple-Vorgabe)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Pairing / Devices ---
class PairingCodeOut(BaseModel):
    code: str
    expires_at: datetime


class PairIn(BaseModel):
    code: str
    label: str | None = None


class DeviceTokenOut(BaseModel):
    device_token: str
    user_id: int


# --- Reverse-Pairing (Uhr zeigt Code, Web löst ihn ein) ---
class PairInitIn(BaseModel):
    # Optional: die Uhr meldet ihre Plattform/Label -> beim Claim übernommen (sonst „Garmin").
    label: str | None = None
    platform: str | None = None


class PairInitOut(BaseModel):
    code: str            # auf der Uhr anzeigen
    claim_token: str     # Uhr pollt damit
    expires_at: datetime


class PairClaimIn(BaseModel):
    code: str
    label: str | None = None


class PairPollOut(BaseModel):
    device_token: str | None = None   # null bis der Web-Nutzer den Code eingelöst hat


# --- Ingest ---
class SessionStartIn(BaseModel):
    # nur unbedenkliche Zeichen — fließt in den Ablage-Pfad ein (kein Path-Traversal)
    session_uuid: str = Field(pattern=r"^[A-Za-z0-9_-]{1,80}$")
    started_at: datetime
    sport: str = "pumpfoil"
    gps_hz: int = 1
    accel_hz: int = 25
    accel_scale: int = 2048
    foil_id: int | None = None   # auf der Uhr für diese Session gewähltes Foil (Override)
    placement: str | None = None  # "phone" = Handy-Recorder (Tasche/Hüfte); sonst Uhr am Handgelenk
    device_model: str | None = None  # Modell + OS (z. B. "Pixel 7 · Android 14") — nur zur Fehlersuche


class SessionStartOut(BaseModel):
    session_id: int
    received_chunks: list[int]


class ChunkIn(BaseModel):
    index: int
    kind: str  # "gps" | "accel"
    encoding: str  # "json" | "int16-b64"
    t0_ms: int = 0
    count: int = 0
    data: object  # list (gps) oder str (accel-base64)


class ChunkOut(BaseModel):
    ok: bool
    index: int


class SessionCompleteIn(BaseModel):
    ended_at: datetime | None = None
    total_chunks: int | None = None


# --- Sessions / Analysis ---
class AnalysisOut(BaseModel):
    algo_version: str
    total_distance_m: float | None = None
    foiling_distance_m: float | None = None
    foiling_time_s: float | None = None
    max_speed_mps: float | None = None
    pump_count: int | None = None
    avg_cadence_hz: float | None = None
    metrics: dict | None = None
    track_geojson: dict | None = None
    segments: list[dict] | None = None
    accel_windows: list[dict] | None = None


class SessionOut(BaseModel):
    id: int
    session_uuid: str
    sport: str
    started_at: datetime
    ended_at: datetime | None
    status: str
    trim_start_ms: int | None = None
    trim_end_ms: int | None = None
    data_version: int | None = None   # epoch(s) „zuletzt geändert" — App-Caching (additiv)
    owned: bool = True   # gehört die Session dem aktuellen Nutzer? (Community = read-only)
    owner_name: str | None = None  # Anzeigename des Besitzers (für Community-Ansicht)
    owner_avatar_url: str | None = None  # Profilbild des Besitzers
    merged_count: int = 0  # >0 = aus so vielen Sessions zusammengeführt (auflösbar)
    place_name: str | None = None  # Spot-Name (Ufer-Venue bevorzugt, sonst Gewässer)
    place_water: str | None = None  # Gewässername als Zusatz-Label (wenn place_name ein Ufer-Venue ist)
    spot_id: int | None = None      # Spot-Cluster-ID (additiv; künftige Clients gruppieren darüber)
    device_label: str | None = None  # Uhr-/Geräte-Bezeichnung der Aufnahme (nur Detailansicht)
    device_model: str | None = None  # Aufnahme-Gerät (Modell + OS) — nur Detailansicht, additiv
    caption: str | None = None  # eigene Beschriftung des Besitzers
    youtube_url: str | None = None  # optionale YouTube-URL
    thumb_url: str | None = None  # Vorschaubild (neuestes Foto der Session)
    photo_count: int = 0
    like_count: int = 0
    liked: bool = False
    track_preview: str | None = None  # Mini-Track (normalisierte Polylinien als JSON)
    foil_id: int | None = None  # explizit gesetztes Foil dieser Session
    foil: dict | None = None  # aufgelöstes Foil (Session-Foil oder Nutzer-Standard) für Anzeige
    transfer_to: str | None = None  # offene Übertragung: Anzeigename des Empfängers (nur eigene Liste)
    analysis: AnalysisOut | None = None


class TrimIn(BaseModel):
    trim_start_ms: int | None = None
    trim_end_ms: int | None = None


class SessionMetaIn(BaseModel):
    # Nur mitgeschickte Felder werden geändert. "" = leeren.
    caption: str | None = None
    youtube_url: str | None = None
    # Foil dieser Session (Foil.id). null = zurück auf Standard-Foil des Nutzers.
    foil_id: int | None = None


# --- Labels ---
class LabelIn(BaseModel):
    t_start_ms: int
    t_end_ms: int
    label: str  # "pump" | "glide" | "not_foiling"


class LabelOut(LabelIn):
    id: int


class PumpTruthIn(BaseModel):
    times_ms: list[int]            # getappte Pump-Zeitpunkte (ms ab Session-Start)
    run_idx: int | None = None     # optional: pro Lauf getappt
    take: int | None = None        # Durchlauf-Nr.; None = nächster freier Take (anhängen)


# --- Rohdaten (für Labeling-/Chart-Ansicht) ---
class RawDataOut(BaseModel):
    gps_t_ms: list[int]
    gps_speed_mps: list[float | None]
    gps_lat: list[float | None] = []
    gps_lon: list[float | None] = []
    accel_hz_effective: float
    accel_t_ms: list[int]
    accel_mag_g: list[float]
    accel_band_g: list[float]
