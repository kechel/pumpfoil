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
    # „Sieht nicht nach Pumpfoil aus" gesperrt (Missbrauch). Seit eine EINZELNE Meldung wirkt, ist das
    # der Hebel gegen Störer — statt alle Meldungen zu entwerten (docs/sport-classification.md).
    flag_blocked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Gesperrt: kein Login, Token ungültig, Inhalte aus der Community ausgeblendet.
    blocked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Chat-Read-Only: darf Chats lesen, aber nicht mehr posten (Moderation).
    chat_readonly: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Versteckt: Testkonto (App-Store-Review). Inhalte für ALLE ANDEREN unsichtbar
    # (Feed/Rekorde/Spots/Chat), Konto selbst sieht alles normal. Login bleibt erlaubt.
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Bevorzugte UI-Sprache (de, gsw, de-AT, en, fr, it, es). Default Deutsch.
    language: Mapped[str] = mapped_column(String(8), default="en", server_default="en")
    # Persönliche Erkennungs-Empfindlichkeit (normal|light|attempts) — übersteuert die
    # Foil-Limits NUR für die eigene Auswertung (leichte/langsame Fahrer, Startversuche);
    # Community/Rekorde nutzen immer "normal". Siehe analysis.gps.SENSITIVITY_PRESETS.
    foil_sensitivity: Mapped[str] = mapped_column(String(16), default="normal", server_default="normal")
    # Anzeige der Pump-Kadenz: "hz" (1.43 Hz) oder "ppm" (86 Pumps/min). Reine DARSTELLUNG, kein
    # Einfluss auf Analyse oder Rekorde — Nutzerwunsch: Hz sind zu technisch, man kann sich nichts
    # darunter vorstellen. Serverseitig am Nutzer, damit alle Clients dieselbe Einheit zeigen.
    pump_unit: Mapped[str] = mapped_column(String(8), default="hz", server_default="hz")
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
    # Von der Uhr bei pair-init gemeldet (die Uhr kennt ihre Plattform) -> beim Claim aufs
    # DeviceToken übernommen, damit z. B. eine Amazfit nicht als „Garmin" gelabelt wird.
    label: Mapped[str | None] = mapped_column(String(120))
    platform: Mapped[str | None] = mapped_column(String(16))


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
    # Aufzeichnungsmodus PRO UHR (full|lite|gps). NULL = User-Default (settings_json).
    # Erlaubt getrennte Raten je Gerät (z. B. fēnix voll, FR55 sparsam).
    record_mode: Mapped[str | None] = mapped_column(String(8))
    # Soft-Revoke: Token ungültig, Record bleibt (Session-Zuordnung + Historie erhalten).
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Canary der dynamischen Layouts: die Uhr setzt beim Aufnahme-Start ein Storage-Flag und
    # löscht es beim sauberen Ende. Liegt es beim App-Start noch da, ist die letzte Session
    # abgestürzt -> die Uhr fällt auf die statische Ansicht zurück UND meldet das hier beim
    # nächsten Config-Abruf. Der Server zählt es je MODELL (s. WatchModelFlag) und liefert
    # Layouts für dieses Modell dann per Default nicht mehr aus.
    layout_canary_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    layout_canary_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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
    # Auch GEOMETRIE abgeleitet (Hersteller veröffentlicht nur eines von Fläche/Spannweite, der Rest
    # folgt aus der Streckung der Baureihe). Strenger als thickness_estimated: hier hängt die ganze
    # Leistungsrechnung dran. Gleiche Bedeutung wie das Feld bei Stab.
    specs_estimated: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    is_baseline: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


class Stab(Base):
    """Stabilizer-/Rear-Wing-**Bezeichnungen** (Marke/Modell/Größe), Aufbau wie der Foil-Katalog.

    Nur der Name zählt — genau die Bezeichnung, die der Nutzer auswählt und angezeigt bekommt
    („GONG Stab Trail L"). Die Größenbezeichnung ist herstellereigen (GONGs S/M/L = Kombi aus
    Schaftlänge UND Fläche) und wird wörtlich übernommen, nie interpretiert. span_cm/area_cm2
    bleiben als Altlast nullable, werden aber nicht mehr gepflegt (nichts rechnet damit).
    """

    __tablename__ = "stabs"
    __table_args__ = (UniqueConstraint("brand", "model", "size", name="uq_stab_variant"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # NULL = globaler Katalog (geseedet). Gesetzt = EIGENER Eintrag dieses Nutzers: die
    # Hersteller-Landschaft ist zu groß und ändert sich jährlich, deshalb kann jeder seinen
    # Stab selbst benennen (wie bei den Boards) statt auf den Katalog zu warten.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    brand: Mapped[str] = mapped_column(String(60), index=True)
    model: Mapped[str] = mapped_column(String(80))
    size: Mapped[str] = mapped_column(String(20))
    span_cm: Mapped[float | None] = mapped_column(Float)
    area_cm2: Mapped[float | None] = mapped_column(Float)
    specs_estimated: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


class Board(Base):
    """Board des Nutzers — KEIN Katalog (Recherche-Aufwand ≫ Nutzen), sondern eigene Einträge.

    Deshalb user-eigene Zeilen statt globaler Stammdaten; Volumen/Länge optional.
    """

    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    volume_l: Mapped[float | None] = mapped_column(Float)
    length_cm: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class WatchModelFlag(Base):
    """Feature-Zustand je UHRENMODELL (Katalog-ID, z. B. "fenix7xpro").

    Selbstlernender Kill-Switch (Entscheidung Jan): Uhren melden einen ausgelösten Canary beim
    nächsten Config-Abruf; sind es ZWEI VERSCHIEDENE Uhren desselben Modells, liefert der Server
    dynamische Layouts für dieses Modell per Default nicht mehr aus. Diese Tabelle hält NUR den
    manuellen Override (`layouts_allowed`: True = erzwingen, False = sperren, NULL = automatisch),
    die Zählung kommt live aus `DeviceToken.layout_canary_count` — so gibt es keine doppelte
    Buchführung, die auseinanderlaufen kann.
    """

    __tablename__ = "watch_model_flags"

    id: Mapped[int] = mapped_column(primary_key=True)
    model_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    layouts_allowed: Mapped[bool | None] = mapped_column(Boolean)
    note: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class WatchLayout(Base):
    """Ein frei gestaltetes Uhr-Layout (EINE Seite) — s. docs/setup-and-watch-layouts.md (F2).

    `elements` ist ein JSON-**Array von Arrays** im kompakten Format
    `[typ, x, y, size, color, flags, extra…]` — bewusst keine Dicts mit String-Keys, weil die Uhr
    das Server-JSON im Object Store cached und Object-Store-Volllauf ein bekannter Fehlerpfad ist.
    Koordinaten sind relativ 0…1000, also auflösungs- und formunabhängig (Katalog: 176×176 …
    454×454, round/rect/semioctagon).

    `authored_w/h/shape` = Displaygröße/Form, auf der das Layout ENTWORFEN wurde. Das ist ein
    Hinweis (Badge + Galerie-Filter), **keine Schranke**: kopieren und anpassen darf man jedes
    Layout, auch von einer anderen Größe oder Form.
    """

    __tablename__ = "watch_layouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    # on_foil = während des Laufs (beliebig viele Seiten) | off_foil = nach dem Lauf (eine)
    # | pause = Dümpeln zwischen den Läufen (eine).
    category: Mapped[str] = mapped_column(String(10), index=True)
    shape: Mapped[str] = mapped_column(String(12), default="round", server_default="round")
    bg_color: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    elements: Mapped[str] = mapped_column(Text, default="[]")
    published: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    copied_from_id: Mapped[int | None] = mapped_column(ForeignKey("watch_layouts.id"))
    authored_w: Mapped[int | None] = mapped_column(Integer)
    authored_h: Mapped[int | None] = mapped_column(Integer)
    authored_shape: Mapped[str | None] = mapped_column(String(12))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


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


class ChatLike(Base):
    """👍 auf eine Chat-Nachricht (1× je Nutzer). Zählung on-the-fly."""

    __tablename__ = "chat_likes"
    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_chatlike"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("chat_messages.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
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
    # Aufnahme-Platzierung, von der Uhr/App gemeldet: None/"" = Uhr am Handgelenk, "phone" = Handy
    # (Tasche/Hüfte, „Record on Phone"-Beta). Für spätere platzierungs-spezifische Pump-Analyse.
    placement: Mapped[str | None] = mapped_column(String(16))
    # Aufnahme-Gerät (Modell + OS), von der App gemeldet — z. B. "Pixel 7 · Android 14" oder
    # "iPhone15,2 · iOS 17.5". Rein zur gezielten Fehlersuche (welches Telefon/OS).
    device_model: Mapped[str | None] = mapped_column(String(80))
    # App-Version, mit der DIESE Session aufgenommen wurde (z. B. "1.1.18", "1.0.69"). Bewusst auf
    # der Session und nicht nur am Gerät: DeviceToken.app_version wandert mit jedem Update weiter,
    # die Frage bei einer Fehlermeldung ist aber immer "welche Version war es DAMALS?". Anlass: ein
    # Nutzer meldete eine 25 h verzögerte Übertragung, und es war nicht feststellbar, ob er den
    # Apple-Watch-Upload-Fix aus 1.1.17 schon hatte. Quelle: Angabe des Clients beim Start, sonst
    # die letzte vom Gerät gemeldete Version (Uhren melden sie bei jedem Config-Abruf).
    app_version: Mapped[str | None] = mapped_column(String(20))
    # Öffentlicher Teilen-Token (unguessbar): gesetzt = jeder mit dem Link sieht die Session read-only
    # (ohne Login). Nur vom Besitzer erzeugbar/widerrufbar. None = nicht öffentlich geteilt.
    share_token: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)

    # "recording" → Chunks kommen rein; "complete" → Rohdaten persistiert; "analyzed".
    status: Mapped[str] = mapped_column(String(20), default="recording")
    # "Session ausgewertet"-Push wurde für diese Session schon verschickt -> nie erneut pushen,
    # egal wie oft /complete (Retry/Watchdog) oder eine Re-Analyse feuert. Genau EINE Nachricht.
    # NULL/false = noch nicht benachrichtigt (pushbar), true = schon gepusht. Nullable, damit der
    # Altbestand-Backfill (bereits analysierte Sessions -> true) idempotent bleibt.
    analyzed_notified: Mapped[bool | None] = mapped_column(Boolean)
    total_chunks: Mapped[int | None] = mapped_column(Integer)
    # Erwartete Gesamt-Chunk-Zahl (gps+accel), von der Uhr beim /session-Start gemeldet — für die
    # Upload-Fortschrittsanzeige während GPS-first-Uploads (received/expected). NULL = unbekannt.
    expected_chunks: Mapped[int | None] = mapped_column(Integer)
    # Optionaler Zuschnitt (ms ab Session-Start). Gesetzt -> alle Analysen nutzen nur
    # [trim_start_ms, trim_end_ms] (z. B. Auto-Heimfahrt nach dem Foilen abschneiden).
    trim_start_ms: Mapped[int | None] = mapped_column(Integer)
    trim_end_ms: Mapped[int | None] = mapped_column(Integer)
    # Aussortierte Läufe als ZEITFENSTER (JSON-Liste von [start_ms, end_ms], ms ab
    # Session-Start wie trim_*). Bewusst Zeit statt Lauf-Index: Läufe werden bei jeder
    # Neuanalyse neu durchnummeriert, ein gespeicherter Index würde nach dem nächsten
    # Detektor-Update auf einen anderen Lauf zeigen. Wirkung: die Fenster fallen in der
    # Analyse aus den GPS-Daten (genau wie der Trim) -> Läufe/Zeit/Distanz/Pumps/Rekorde
    # stimmen automatisch. Kein Datenverlust: die Rohdaten bleiben, jederzeit umkehrbar.
    excluded_ranges: Mapped[str | None] = mapped_column(Text)
    # Zurückgeholte Fremdkraft-Läufe (Erkennung v2): ZEITFENSTER wie excluded_ranges (JSON-Liste
    # von [start_ms, end_ms], ms ab Session-Start). Läufe in diesen Fenstern beurteilt die
    # Fremdkraft-Erkennung NICHT mehr — der Besitzer hat gesagt „der zählt doch". Bewusst dieselbe
    # Zeit-statt-Index-Mechanik wie oben (Läufe werden bei jeder Neuanalyse neu nummeriert).
    fremdkraft_keep: Mapped[str | None] = mapped_column(Text)
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
    # Restliches Setup dieser Session — je null = Standard des Nutzers (settings_json).
    # Bewusst KEIN kombiniertes „Setup"-Objekt: man wechselt real meist nur Stab oder Shim.
    stab_id: Mapped[int | None] = mapped_column(ForeignKey("stabs.id"))
    mast_len_cm: Mapped[int | None] = mapped_column(Integer)
    shim_deg: Mapped[float | None] = mapped_column(Float)
    board_id: Mapped[int | None] = mapped_column(ForeignKey("boards.id"))
    # Eigene Beschriftung des Besitzers (frei, max 30 Zeichen) + optionale YouTube-URL.
    caption: Mapped[str | None] = mapped_column(String(40))
    # LEGACY-SPIEGEL: erstes (ältestes, nicht geblocktes) SessionVideo — Quelle der Wahrheit
    # ist die session_videos-Tabelle (mehrere Videos pro Session). Bleibt für alte Clients
    # (Apps lesen/schreiben youtube_url via /meta) und die Session-Card-Vorschau gepflegt.
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
    # Admin-Override der Klassifikation: NULL = automatisch (Detektor), False = zwangsweise
    # aussortiert („als hätte der Detektor es aussortiert" — kein Shadow-Ban, Besitzer sieht sie
    # im Aussortiert-Tab), True = zwangsweise Pumpfoil (für späteren Nutzer-Einspruch reserviert).
    # Überlebt Reanalysen (run_analysis wendet ihn nach der Klassifikation an).
    pumpfoil_override: Mapped[bool | None] = mapped_column(Boolean)
    # --- Sportart-Klassifikation durch MENSCHEN (docs/sport-classification.md) ---
    # Bewusst getrennt von is_pumpfoil/detection: die gehören dem Detektor und werden von jeder
    # Reanalyse überschrieben. Zwei Achsen, weil sie sich unterschiedlich verhalten:
    #   sport        = andere Sportart, aber GÜLTIGE Messung (wingfoil, kitefoil, surf_downwind,
    #                  sup_paddle, wake, efoil, foildrive, other) -> darf eigene Rekorde begründen
    #   data_quality = Müll/Dopplung (false_data, duplicate, test) -> zählt NIRGENDS
    # ACHTUNG: NICHT `sport` — das gibt es schon (Aktivitätstyp aus der Aufnahmedatei, weiter oben).
    # `sport_class` ist das MENSCHLICHE Urteil und eine andere Sache: die Uhr kann „surfing" melden,
    # während die Session tatsächlich Wingfoil war.
    sport_class: Mapped[str] = mapped_column(String(16), default="pumpfoil", server_default="pumpfoil")
    data_quality: Mapped[str] = mapped_column(String(16), default="ok", server_default="ok")
    # Wer hat den Wert gesetzt: default (Import) | auto (Erkennung) | owner | admin. „community"
    # gibt es NICHT — eine Fremdmeldung setzt keine Kategorie, sie stellt nur eine Frage (Jans
    # Vorgabe). „auto" ist die SCHWÄCHSTE Quelle: sie greift nur, solange kein Mensch geurteilt hat,
    # und jeder Mensch überstimmt sie ohne Umweg (siehe sessions.set_classification).
    sport_source: Mapped[str] = mapped_column(String(10), default="default", server_default="default")
    # Begründung der automatischen Einordnung (JSON: grund, hinweis, merkmale) — für den Hinweis an
    # den Nutzer, den Admin-Bereich und die Nachvollziehbarkeit. Nur gesetzt, wenn sport_source
    # jemals „auto" war; ein menschliches Urteil löscht es nicht (Historie).
    sport_auto_json: Mapped[str | None] = mapped_column(Text)
    # Zwei unabhängige Melder (oder der Besitzer selbst) -> unklassifiziert: erscheint in KEINER
    # Kategorie, bis Besitzer oder Admin zuordnet.
    needs_classification: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Widerspruch des Besitzers („war doch Pumpfoiling") -> Admin entscheidet.
    appeal_text: Mapped[str | None] = mapped_column(Text)
    appeal_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Moderation: flagged = als unangemessen gemeldet -> in Community ausgeblendet,
    # bis ein Admin entscheidet. mod_ok = vom Admin freigegeben (nicht erneut flaggen).
    flagged: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    mod_ok: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # „Zuletzt geändert" — bumpt automatisch bei jedem UPDATE (Caption/Foil/Trim/Analyse-Rückschrieb)
    # und explizit bei Foto-Add/Delete. Basis fürs App-Caching (data_version): Apps laden nur nach,
    # was neuer ist als ihr Cache.
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

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
    # Start-Erfolgsquote (nur diese Anzeige): Distanzen der attempts-Preset-Läufe als JSON-Liste
    # [distance_m, …] — lockerer Detektor (ab ~8 km/h, keine Landgänge), erfasst auch kurze Fehl-
    # startversuche, die die kanonische On-Foil-Erkennung nicht als Lauf zählt. ADDITIV, beeinflusst
    # KEINE anderen Stats/Rekorde. Wird bei jeder Analyse mitgeschrieben; für Altbestand per Backfill.
    start_attempts_json: Mapped[str | None] = mapped_column(Text)
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

    # Carve-Anzahl je Grad-Kategorie (s=90–180°, m=180–360°, l=>360°), lazy gecacht fürs
    # persönliche Home-Aggregat (/community/carve-stats). NULL = noch nicht berechnet -> beim
    # nächsten Aufruf einmalig aus GPS ermittelt + gespeichert. run_analysis setzt sie auf NULL
    # zurück (Trim/Reanalyse ändert Segmente -> Neuberechnung). Fixe Kategorien, kein User-Setting.
    carve_s: Mapped[int | None] = mapped_column(Integer)
    carve_m: Mapped[int | None] = mapped_column(Integer)
    carve_l: Mapped[int | None] = mapped_column(Integer)

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


class SessionVideo(Base):
    """Vom Besitzer verlinktes YouTube-Video zu einer eigenen Session (mehrere möglich).
    Das erste (älteste, nicht geblockte) Video wird zusätzlich nach Session.youtube_url
    gespiegelt (Legacy-Clients + Listen-Vorschau)."""

    __tablename__ = "session_videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    youtube_url: Mapped[str] = mapped_column(String(255))
    # Ursprungs-Session, falls dieses Video beim Zusammenfuehren uebernommen wurde
    # (fuer sauberes Auflösen -> Video wandert zurueck). NULL = original hier.
    merged_from_session_id: Mapped[int | None] = mapped_column(Integer)
    # Vom Admin geblockt -> aus Anzeige/Feed raus (Eintrag bleibt, kann freigegeben werden).
    blocked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


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
    # ⭐ = fürs Testimonial-Archiv markiert (Werbe-Zitate): überlebt „Alle löschen".
    # Vor ÖFFENTLICHER Nutzung eines Zitats den Autor fragen (Privacy) — Namen nie ungefragt publizieren.
    starred: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


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
    refresh_token: Mapped[str] = mapped_column(Text)                   # JWT (>255 Zeichen!)
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


class RecordSnapshot(Base):
    """Aktuelle Bestmarke je (Metrik, Scope, Fenster). Wird vom täglichen Snapshot-Job gepflegt.
    key = "<metric>|<scope>|<window>" (scope = "global" oder "spot:<spot_id>"; window = 10d|30d|365d|all)."""

    __tablename__ = "record_snapshots"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.id"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    value: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class RecordEvent(Base):
    """Log: jede echte Verbesserung einer Bestmarke (vom täglichen Snapshot erkannt). Basis für Badges
    (1/5/10/100× Rekord je Fenster/Spot/global). Nur Verbesserungen — kein Eintrag, wenn die Marke durch
    Alterung (rollierendes Fenster) sinkt."""

    __tablename__ = "record_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.id"))
    metric: Mapped[str] = mapped_column(String(12))      # distance|duration|speed|glide|runs
    scope: Mapped[str] = mapped_column(String(32))       # "global" | "spot:<spot_id>"
    window: Mapped[str] = mapped_column(String(8))       # 10d|30d|365d|all
    value: Mapped[float] = mapped_column(Float)
    prev_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    prev_session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.id"))
    prev_value: Mapped[float | None] = mapped_column(Float)
    pushed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


class SessionFlag(Base):
    """„Sieht nicht nach Pumpfoil aus" — EINE Meldung eines Nutzers zu EINER Session.

    Bewusst eine eigene Tabelle statt eines Zählers: wir müssen unabhängige Melder zählen können
    (die Wirkung tritt erst beim zweiten ein, sonst wäre eine einzelne anonyme Meldung eine Waffe
    gegen den Führenden) und der Admin muss sehen, WER gemeldet hat. Für den Besitzer bleiben die
    Melder unsichtbar — sonst entstehen Privatfehden aus einer Klassifikationsfrage.
    Design: docs/sport-classification.md.
    """

    __tablename__ = "session_flags"
    __table_args__ = (UniqueConstraint("session_id", "user_id", name="uq_session_flag_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
