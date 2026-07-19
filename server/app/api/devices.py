"""Pairing-Code-Workflow: Website generiert Code, Uhr löst ihn gegen Device-Token ein."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from ..ratelimit import rate_limit
from ..schemas import (
    DeviceTokenOut,
    PairClaimIn,
    PairIn,
    PairingCodeOut,
    PairInitOut,
    PairPollOut,
)
from ..security import new_pairing_code, new_token
from .deps import current_device, current_user

router = APIRouter(prefix="/api/devices", tags=["devices"])

PAIRING_TTL_MIN = 15

# Speicherarme Uhren, die bei voller Accel-Rate (25 Hz) die Aufnahme abbrechen/abstürzen
# -> serverseitig auf 'lite' kappen. FR55 belegt (Philipp); Vorgänger der Reihe vermutlich auch.
_LOW_ACCEL_MODEL_HINTS = ("Forerunner® 55", "Forerunner® 45", "Forerunner® 35", "Forerunner® 30", "Forerunner® 25")

# Gezielt per PART-NUMMER (nicht Namens-Substring, der würde Plus/5S/5X mitfangen): die
# Basis-fēnix 5 / quatix 5 (128-KB-Klasse wie FR55) — B2697 + B2796. Absturz belegt: Oerni
# (fēnix 5, IQ!-Logo bei 25 Hz, 2026-07-19). Die fēnix 5 PLUS (B3089/B3110) ist leistungsfähiger
# und läuft mit 25 Hz sauber (Session #385 Peter) -> bewusst NICHT gekappt. 5S/5X: bis Beleg offen.
_LOW_ACCEL_PARTS = frozenset({"006-B2697-00", "006-B2796-00"})


def _is_low_accel_model(part_number: str | None) -> bool:
    if not part_number:
        return False
    if part_number in _LOW_ACCEL_PARTS:
        return True
    m = _partmap().get(part_number)
    name = (m or {}).get("name", "")
    return any(h in name for h in _LOW_ACCEL_MODEL_HINTS)


def _effective_record_mode(device: models.DeviceToken, settings: dict) -> str:
    """Wirksamer Aufzeichnungsmodus einer Uhr: Geräte-Override (device.record_mode)
    vor User-Default; danach FR55-Kappung full->lite (nur runter, 'gps' bleibt)."""
    dev = device.record_mode if device.record_mode in ("full", "lite", "gps") else None
    base = dev or settings.get("record_mode", "full")
    if base == "full" and _is_low_accel_model(device.part_number):
        return "lite"
    return base


@router.get("/config")
def device_config(
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
    v: str | None = Query(None),   # gemeldete App-Version der Uhr
    p: str | None = Query(None),   # Plattform: garmin | wear | apple
    pn: str | None = Query(None),  # Geräte-Part-Number (Garmin) -> später Modell-Zuordnung
) -> dict:
    """Konfiguration für die Uhr-App (per Device-Token). Liefert die auf der Website
    konfigurierten Ansichten + die Farb-Option. Die Uhr lädt das beim App-Start und
    meldet dabei ihre Version (v) + Plattform (p) + Part-Number (pn) -> Update-Hinweis."""
    dirty = False
    if v is not None and v != "":
        device.app_version = v[:20]; dirty = True
    if p is not None and p != "":
        device.platform = p[:16]; dirty = True
    if pn is not None and pn != "":
        device.part_number = pn[:32]; dirty = True
        # Generisches Label durch das echte Modell ersetzen, sobald auflösbar.
        model = _partmap().get(pn)
        if model and (not device.label or device.label.lower() in ("garmin", "wear", "apple", "watch")):
            device.label = model["name"][:120]
    if dirty:
        db.commit()
    user = db.get(models.User, device.user_id)
    settings = json.loads(user.settings_json) if user and user.settings_json else {}

    # Foil-Auswahl für die Uhr: je hinterlegtem Foil die aus Foil+Gewicht abgeleiteten
    # Auto-Alarm-Schwellen (Min = Min-Viable, Max = Optimal-Speed). Der Nutzer wählt
    # beim Start das heutige Foil; ein manuell gesetzter Alarm hat Vorrang (s. Uhr-Logik).
    foils_out = _foil_alarm_list(db, settings)

    return {
        "views": settings.get("views", [[1, 2, 0]]),
        "colorByValue": bool(settings.get("colorByValue", False)),
        # Auto-Start: Aufnahme automatisch starten, wenn man losfährt (GPS). Default an.
        "autoStart": bool(settings.get("auto_start", True)),
        # Aufzeichnungsmodus: full (25 Hz) | lite (10 Hz) | gps (nur GPS). Quelle: Geräte-
        # Override (device.record_mode), sonst User-Default (settings_json). Für speicherarme
        # Uhren (FR55 & Vorgänger) serverseitig PRO GERÄT auf 'lite' gekappt (nur runter;
        # explizites 'gps' bleibt) — verhindert den Absturz. Kein Uhr-Update nötig.
        "recordMode": _effective_record_mode(device, settings),
        # Aktivitätstyp der FIT-Session (Garmin-Connect-Kategorie): surfing | openwater.
        "activityType": settings.get("activity_type", "surfing"),
        # Profil-Sprache (de/gsw/de-AT/en/fr/it/es) — die Uhr lokalisiert ihre On-Device-Texte danach.
        "language": (user.language if user and user.language else "de"),
        # Vibrationsalarm (per Website konfiguriert).
        "alarmEnabled": bool(settings.get("alarm_enabled", False)),
        "speedHigh": int(settings.get("speed_high", 0) or 0),
        "speedLow": int(settings.get("speed_low", 0) or 0),
        "alarmPatternHigh": settings.get("alarm_pattern_high", "short2"),
        "alarmPatternLow": settings.get("alarm_pattern_low", "long2"),
        "alarmRepeat": settings.get("alarm_repeat", "once"),
        # Vorwahl für den Uhr-Start: "foil" = Standard-Foil | "fixed" = feste Werte.
        "alarmDefault": settings.get("alarm_default", "foil"),
        "foils": foils_out,
        # Off-Foil-Screen (Auto-Umschaltung, wenn gerade nicht gefoilt wird):
        # Default Uhrzeit + letzter-Lauf-Distanz + letzter-Lauf-Dauer (Feld-IDs).
        "offFoilView": settings.get("off_foil_view") or [12, 17, 16],
    }


def _foil_alarm_list(db: Session, settings: dict) -> list[dict]:
    from ..foil_physics import alarm_speeds

    my = settings.get("my_foils") or []
    if not isinstance(my, list) or not my:
        return []
    try:
        weight = float(settings.get("weight_kg") or 0)
    except (TypeError, ValueError):
        weight = 0.0
    if weight <= 0:
        weight = 95.0  # Default-Reitergewicht wie im Web-Rechner
    default_id = settings.get("foil_id")
    out: list[dict] = []
    for fid in my:
        f = db.get(models.Foil, fid)
        if f is None:
            continue
        lo, hi = alarm_speeds(f.span_cm or 0, f.area_cm2 or 0, f.thickness_mm or 0, weight)
        label = " ".join(p for p in [f.brand, f.model, f.size] if p).strip() or f"Foil {fid}"
        out.append({"id": f.id, "label": label[:24], "min": lo, "max": hi})
    # Standard-Foil nach vorne.
    out.sort(key=lambda x: x["id"] != default_id)
    return out


@router.get("/list")
def list_devices(
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Mit dem Account verknüpfte Uhren/Geräte (ohne Token-Geheimnis)."""
    rows = (
        db.query(models.DeviceToken)
        .filter(models.DeviceToken.user_id == user.id)
        .order_by(models.DeviceToken.last_seen_at.desc().nullslast(),
                  models.DeviceToken.created_at.desc())
        .all()
    )
    latest_garmin = _latest_garmin_version()
    pm = _partmap()
    udefault = "full"
    if user and user.settings_json:
        try:
            udefault = json.loads(user.settings_json).get("record_mode", "full")
        except Exception:  # noqa: BLE001
            pass
    out = []
    for d in rows:
        # Update-Hinweis nur für Garmin (Sideload). Wear/Apple aktualisieren über ihre Stores.
        latest = latest_garmin if (d.platform == "garmin") else None
        update = bool(latest and d.app_version and _version_lt(d.app_version, latest))
        # Modell aus der gemeldeten Part-Number auflösen -> Name + Download-ID (.prg).
        model = pm.get(d.part_number) if d.part_number else None
        out.append({
            "id": d.id,
            "label": d.label,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
            "revoked_at": d.revoked_at.isoformat() if d.revoked_at else None,
            "app_version": d.app_version,
            "platform": d.platform,
            "latest_version": latest,
            "update_available": update,
            "model": model["name"] if model else None,
            "model_id": model["id"] if model else None,   # für /api/app/download/<id>
            # Aufzeichnungsmodus pro Uhr: gesetzter Override, sonst User-Default (zur Anzeige).
            "record_mode": d.record_mode or udefault,
            # FR55 & Co. werden bei 'full' automatisch auf 'lite' gekappt -> UI-Hinweis.
            "low_accel": _is_low_accel_model(d.part_number),
        })
    return out


@router.put("/{device_id}/record-mode")
def set_device_record_mode(
    device_id: int, body: dict,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Aufzeichnungsmodus (full|lite|gps) für EINE Uhr getrennt setzen. Greift beim
    nächsten App-Start der Uhr (holt /config). Kein Uhr-Update nötig."""
    d = db.get(models.DeviceToken, device_id)
    if d is None or d.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gerät nicht gefunden")
    if d.revoked_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Gerät ist widerrufen")
    mode = (body or {}).get("record_mode")
    if mode not in ("full", "lite", "gps"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültiger Modus")
    d.record_mode = mode
    db.commit()
    return {"ok": True, "record_mode": mode}


def _partmap() -> dict:
    """Geräte-Part-Number -> {id, name} (aus dem Build, watch/bin/partmap.json).
    Frisch gelesen (kleine Datei), damit Rebuilds sofort greifen."""
    try:
        p = get_settings().app_builds_dir / "partmap.json"
        if p.exists():
            return json.loads(p.read_text())
    except Exception:  # noqa: BLE001
        pass
    return {}


def _latest_garmin_version() -> str | None:
    """Neueste gebaute Garmin-App-Version aus dem Build-Katalog (Quelle der Wahrheit
    für den Sideload-Download)."""
    try:
        cat = get_settings().app_builds_dir / "catalog.json"
        if not cat.exists():
            return None
        data = json.loads(cat.read_text())
        if isinstance(data, list) and data:
            return data[0].get("version")
    except Exception:
        pass
    return None


def _version_lt(a: str, b: str) -> bool:
    """a < b für „1.0.28"-artige Versionen (numerischer Vergleich je Segment)."""
    def parts(s):
        return [int(x) for x in str(s).split(".") if x.isdigit()]
    pa, pb = parts(a), parts(b)
    n = max(len(pa), len(pb))
    pa += [0] * (n - len(pa))
    pb += [0] * (n - len(pb))
    return pa < pb


@router.delete("/{device_id}")
def revoke_device(
    device_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Geräte-Verknüpfung widerrufen: Soft-Revoke (Zeitstempel). Token wird ungültig,
    der Record bleibt — alte Sessions behalten ihre Geräte-Zuordnung, dieselbe Uhr
    kann später mit neuem Pairing-Code wiederkommen."""
    d = db.get(models.DeviceToken, device_id)
    if d is None or d.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gerät nicht gefunden")
    if d.revoked_at is None:
        d.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return {"ok": True}


@router.post("/pairing-code", response_model=PairingCodeOut)
def create_pairing_code(
    user: models.User = Depends(current_user), db: Session = Depends(get_db)
) -> PairingCodeOut:
    """Eingeloggter Web-Nutzer erzeugt einen Code zum Eintippen in die Uhr."""
    # Eindeutigen Code finden (Kollision extrem unwahrscheinlich, aber sicher ist sicher).
    for _ in range(10):
        code = new_pairing_code()
        if not db.query(models.PairingCode).filter_by(code=code).first():
            break
    else:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not allocate code")

    expires = datetime.now(timezone.utc) + timedelta(minutes=PAIRING_TTL_MIN)
    pc = models.PairingCode(code=code, user_id=user.id, expires_at=expires)
    db.add(pc)
    db.commit()
    return PairingCodeOut(code=code, expires_at=expires)


@router.post("/pair", response_model=DeviceTokenOut)
def pair(
    body: PairIn, db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(10, 300, "pair")),
) -> DeviceTokenOut:
    """Uhr löst den Code ein und erhält einen dauerhaften Device-Token. Kein JWT nötig."""
    pc = db.query(models.PairingCode).filter_by(code=body.code.upper()).first()
    now = datetime.now(timezone.utc)
    if pc is None or pc.used_at is not None or _aware(pc.expires_at) < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired code")

    device = models.DeviceToken(
        token=new_token(), user_id=pc.user_id, label=body.label
    )
    pc.used_at = now
    db.add(device)
    db.commit()
    db.refresh(device)
    return DeviceTokenOut(device_token=device.token, user_id=device.user_id)


# --- Reverse-Pairing: Uhr zeigt Code, Web löst ihn ein, Uhr pollt auf den Token ---

@router.post("/pair-init", response_model=PairInitOut)
async def pair_init(
    request: Request,
    db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(20, 300, "pair_init")),
) -> PairInitOut:
    """Uhr (noch ohne Token) erzeugt einen Code zum Eintippen auf der Website +
    ein claim_token zum Pollen. Optionaler Body {label, platform}: die Uhr meldet ihre
    Plattform, damit sie beim Claim korrekt gelabelt wird (sonst Default „Garmin")."""
    # Body tolerant lesen — ältere Uhren (Garmin) schicken einen leeren/nicht-JSON-Body.
    label = platform = None
    try:
        data = await request.json()
        if isinstance(data, dict):
            label = (str(data["label"])[:120] if data.get("label") else None)
            platform = (str(data["platform"])[:16] if data.get("platform") else None)
    except Exception:  # noqa: BLE001
        pass
    for _ in range(10):
        code = new_pairing_code()
        if not db.query(models.DevicePairing).filter_by(code=code).first():
            break
    else:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not allocate code")
    expires = datetime.now(timezone.utc) + timedelta(minutes=PAIRING_TTL_MIN)
    p = models.DevicePairing(code=code, claim_token=new_token(), expires_at=expires,
                             label=label, platform=platform)
    db.add(p)
    db.commit()
    db.refresh(p)
    return PairInitOut(code=p.code, claim_token=p.claim_token, expires_at=expires)


@router.post("/pair-claim")
def pair_claim(
    body: PairClaimIn,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Eingeloggter Web-Nutzer löst den auf der Uhr angezeigten Code ein -> verknüpft die Uhr."""
    p = db.query(models.DevicePairing).filter_by(code=body.code.strip().upper()).first()
    now = datetime.now(timezone.utc)
    if p is None or _aware(p.expires_at) < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültiger oder abgelaufener Code")
    if p.device_token is not None:
        return {"ok": True, "already": True}
    # Label/Plattform bevorzugt von der Uhr (pair-init), sonst vom Web-Body, sonst Default „Garmin"
    # (historisch: einzige Reverse-Pairing-Uhr war Garmin).
    device = models.DeviceToken(
        token=new_token(), user_id=user.id,
        label=p.label or body.label or "Garmin",
        platform=p.platform,
    )
    db.add(device)
    db.flush()
    p.device_token = device.token
    p.user_id = user.id
    db.commit()
    return {"ok": True, "label": device.label}


@router.post("/mint", response_model=DeviceTokenOut)
def mint_device(
    label: str = "Watch",
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(20, 300, "mint")),
) -> DeviceTokenOut:
    """Companion-App (eingeloggt) mintet direkt ein Device-Token für die gekoppelte Uhr.
    Apple: per WatchConnectivity auf die Uhr geschoben; Wear: per Wearable Data Layer.
    So entfällt das Code-Tippen ganz (plattform-gerechtes Pairing)."""
    device = models.DeviceToken(token=new_token(), user_id=user.id, label=label[:40])
    db.add(device)
    db.flush()
    # Entdoppeln: Companion-Apps minten teils mehrfach (Race beim App-Start / spontane
    # 401-Recovery) -> pro Nutzer sammelten sich gleichnamige Karteileichen. Das frisch
    # geminte Token gewinnt (es wird gleich auf die Uhr gepusht); ältere gleichnamige,
    # nie benutzte (0 Sessions) und nicht widerrufene Tokens werden soft-widerrufen.
    # Tokens mit echten Sessions bleiben unangetastet (Historie/Zuordnung).
    has_sessions = (
        db.query(models.Session.id)
        .filter(models.Session.device_id == models.DeviceToken.id)
        .exists()
    )
    stale = (
        db.query(models.DeviceToken)
        .filter(
            models.DeviceToken.user_id == user.id,
            models.DeviceToken.label == device.label,
            models.DeviceToken.id != device.id,
            models.DeviceToken.revoked_at.is_(None),
            ~has_sessions,
        )
        .all()
    )
    now = datetime.now(timezone.utc)
    for t in stale:
        t.revoked_at = now
    db.commit()
    return DeviceTokenOut(device_token=device.token, user_id=device.user_id)


@router.get("/pair-poll", response_model=PairPollOut)
def pair_poll(
    claim_token: str,
    db: Session = Depends(get_db),
) -> PairPollOut:
    """Uhr pollt: sobald der Web-Nutzer den Code eingelöst hat, kommt hier der Device-Token.
    Bewusst OHNE Rate-Limit: ältere Uhr-Apps pollen aggressiv (kein Backoff) und liefen sonst
    in 429 (Feldtest Peter) — der Request ist billig (ein indexierter Lookup)."""
    p = db.query(models.DevicePairing).filter_by(claim_token=claim_token).first()
    now = datetime.now(timezone.utc)
    if p is None or _aware(p.expires_at) < now:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pairing nicht gefunden/abgelaufen")
    return PairPollOut(device_token=p.device_token)


def _aware(dt: datetime) -> datetime:
    """SQLite gibt naive datetimes zurück — als UTC interpretieren."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
