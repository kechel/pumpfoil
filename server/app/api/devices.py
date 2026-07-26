"""Pairing-Code-Workflow: Website generiert Code, Uhr löst ihn gegen Device-Token ein."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from .appmeta import _APP_META
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
    canary: int | None = Query(None),  # 1 = letzte Session mit dynamischem Layout ist abgestürzt
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
    # Canary-Meldung der Uhr: die letzte Aufnahme mit dynamischem Layout ist nicht sauber
    # beendet worden. Zählen (nicht überschreiben) — daraus lernt der Modell-Kill-Switch.
    if canary:
        device.layout_canary_count = int(device.layout_canary_count or 0) + 1
        device.layout_canary_at = datetime.now(timezone.utc)
        dirty = True
    if dirty:
        db.commit()
    user = db.get(models.User, device.user_id)
    settings = json.loads(user.settings_json) if user and user.settings_json else {}

    # Foil-Auswahl für die Uhr: je hinterlegtem Foil die aus Foil+Gewicht abgeleiteten
    # Auto-Alarm-Schwellen (Min = Min-Viable, Max = Optimal-Speed). Der Nutzer wählt
    # beim Start das heutige Foil; ein manuell gesetzter Alarm hat Vorrang (s. Uhr-Logik).
    foils_out = _foil_alarm_list(db, settings)

    # Dynamische Layouts: nur wenn Gerät stark genug UND Modell unauffällig UND Nutzer es
    # nicht abgeschaltet hat. Sonst kommt der Block gar nicht mit (alte Clients ignorieren
    # ihn ohnehin, aber so bleibt die Payload klein und der Object Store der Uhr frei).
    cat = _catalog_entry(pn or device.part_number)
    layouts_on = (
        bool(settings.get("layouts_enabled", True))
        and (cat or {}).get("mem", 0) >= LAYOUT_MIN_MEMORY
        and _model_layouts_allowed(db, _model_id(pn or device.part_number))
    )
    layout_block = _layouts_for_watch(db, device.user_id, settings) if layouts_on else {}

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
        # Ist KEINE Profil-Sprache gesetzt, "" senden (nicht hart "de") → die Uhr weicht auf ihre
        # GERÄTE-Systemsprache aus (Strings.setLang("")→_systemIdx, Fallback EN). Wunsch: engl. Uhr = engl. App.
        "language": (user.language if user and user.language else ""),
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
        # Pausen-Ansicht: Dümpeln ZWISCHEN den Läufen (nach dem Off-Foil-Screen). War auf allen
        # vier Uhr-Plattformen hartcodiert [Uhrzeit, Läufe, Puls] -> jetzt konfigurierbar.
        # Alte Clients ignorieren den Key und nutzen weiter ihren eigenen Default.
        "pauseView": settings.get("pause_view") or [12, 20, 2],
        # Neueste im Connect-IQ-Store freigegebene Version (nur Garmin) -> die Uhr zeigt kurz
        # einen Update-Hinweis, wenn ihre eigene Version älter ist. Leer = kein Hinweis.
        # Gepflegt in appmeta._APP_META["garmin"]["latest"] (nur bei bestätigter Freigabe setzen).
        "latestVersion": (_APP_META["garmin"]["latest"] if (p or device.platform) == "garmin" else ""),
        # Dynamische Layouts (F2 P2). `layoutsOn` ist die EINE Wahrheit für die Uhr: false ->
        # statische Logik wie bisher. `pages`/`offFoil`/`pause` kommen nur mit, wenn true:
        #   [0,a,b,c]        = klassische 3-Feld-Seite (Feld-IDs)
        #   [1,bg,[elements]] = freies Layout (Element = [typ,x,y,size,color,flags,extra…])
        # Koordinaten relativ 0…1000, Größe = Font-Stufe, Farbe = Palette-Index.
        "layoutsOn": layouts_on,
        **layout_block,
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
    cat = _catalog_by_id()
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
            # Displaymaße/Form (nur Garmin, aus dem Build-Katalog) — die PWA nutzt sie, um
            # Uhr-Layouts in der echten Größe dieser Uhr vorzuschauen.
            "screen_w": (cat.get(model["id"]) or {}).get("w") if model else None,
            "screen_h": (cat.get(model["id"]) or {}).get("h") if model else None,
            "shape": _shape_from_family((cat.get(model["id"]) or {}).get("family")) if model else None,
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


def _catalog_by_id() -> dict:
    """Geräte-ID -> Katalog-Eintrag (watch/bin/catalog.json, aus dem SDK erzeugt).
    Liefert u. a. `w`/`h`/`family` — damit kann die PWA Layouts in der ECHTEN Displaygröße
    der gepairten Uhr vorschauen. Frisch gelesen, damit Rebuilds sofort greifen."""
    try:
        p = get_settings().app_builds_dir / "catalog.json"
        if p.exists():
            return {d["id"]: d for d in json.loads(p.read_text()) if d.get("id")}
    except Exception:  # noqa: BLE001
        pass
    return {}


def _shape_from_family(family: str | None) -> str | None:
    """Katalog-`family` (z. B. "round-240x240", "semi-octagon-176x176") -> unsere Formen."""
    if not family:
        return None
    f = family.lower()
    if "semi" in f or "octagon" in f:
        return "semioctagon"
    if "rect" in f:
        return "rect"
    if "round" in f:
        return "round"
    return None


# ---------------------------------------------------------------- Dynamische Layouts ----
# Auslieferung der frei gestalteten Uhr-Layouts (F2 P2). Drei Tore müssen offen sein:
#   1. Gerät stark genug — >= 512 KB watchApp-Budget (aus dem Katalog, `mem`). Es gibt kein
#      256-KB-Tier: 96 KB (5 Geräte, Lite-Build) und 128 KB (16, dort crashte 1.0.64 unter
#      Dauerlast) bekommen den Renderer bewusst NICHT.
#   2. Modell nicht auffällig — selbstlernender Kill-Switch: haben ZWEI VERSCHIEDENE Uhren
#      desselben Modells ihren Canary ausgelöst, ist das Modell aus (Admin kann übersteuern).
#   3. Nutzer hat es nicht abgeschaltet (`settings.layouts_enabled`).
LAYOUT_MIN_MEMORY = 524288      # Bytes watchApp-Budget
LAYOUT_CANARY_LIMIT = 2         # so viele verschiedene Uhren eines Modells -> Modell aus


def _catalog_entry(part_number: str | None) -> dict | None:
    """Katalog-Eintrag (inkl. `mem`) für eine gemeldete Part-Number."""
    if not part_number:
        return None
    m = _partmap().get(part_number)
    if not m:
        return None
    return _catalog_by_id().get(m["id"])


def _model_id(part_number: str | None) -> str | None:
    m = _partmap().get(part_number) if part_number else None
    return m["id"] if m else None


def _model_layouts_allowed(db: Session, model_id: str | None) -> bool:
    """Modell-Zustand: Admin-Override vor Automatik. Automatik = aus, sobald
    LAYOUT_CANARY_LIMIT verschiedene Uhren dieses Modells einen Canary gemeldet haben."""
    if not model_id:
        return False
    flag = db.query(models.WatchModelFlag).filter_by(model_id=model_id).first()
    if flag is not None and flag.layouts_allowed is not None:
        return bool(flag.layouts_allowed)
    # Automatik: Canary-Meldungen dieses Modells zählen (über die Part-Numbers des Modells).
    pns = [pn for pn, m in _partmap().items() if m.get("id") == model_id]
    if not pns:
        return True
    n = (db.query(func.count(models.DeviceToken.id))
         .filter(models.DeviceToken.part_number.in_(pns),
                 models.DeviceToken.layout_canary_count > 0).scalar() or 0)
    return n < LAYOUT_CANARY_LIMIT


def _layout_payload(l: models.WatchLayout) -> list:
    """Ein Layout kompakt: [1, bg_color, [element, …]]. Positionell und ohne String-Keys —
    die Uhr cached das Server-JSON im Object Store, und der läuft schnell voll."""
    try:
        elements = json.loads(l.elements or "[]")
    except ValueError:
        elements = []
    return [1, int(l.bg_color or 0), elements]


def _layouts_for_watch(db: Session, user_id: int, settings: dict) -> dict:
    """Seitenliste + Off-Foil/Pause in Uhr-Form. Klassische 3-Feld-Seite = [0,a,b,c],
    Layout-Seite = [1,bg,[elements]] — ein Tag-Byte vorneweg macht beides unterscheidbar."""
    own = {l.id: l for l in db.query(models.WatchLayout).filter_by(user_id=user_id).all()}

    def one(ref, cat: str, fallback: list) -> list:
        l = own.get(int(ref)) if isinstance(ref, (int, float)) else None
        if l is not None and l.category == cat:
            return _layout_payload(l)
        return [0] + list(fallback)

    pages: list = []
    for item in (settings.get("pages") or settings.get("views") or [[1, 2, 0]]):
        if isinstance(item, list):
            f = [int(x) for x in item[:3]] + [0] * max(0, 3 - len(item))
            pages.append([0] + f)
        else:
            l = own.get(int(item)) if isinstance(item, (int, float)) else None
            if l is not None and l.category == "on_foil":
                pages.append(_layout_payload(l))
    if not pages:
        pages = [[0, 1, 2, 0]]
    return {
        "pages": pages,
        "offFoil": one(settings.get("off_foil_layout_id"), "off_foil",
                       settings.get("off_foil_view") or [12, 17, 16]),
        "pause": one(settings.get("pause_layout_id"), "pause",
                     settings.get("pause_view") or [12, 20, 2]),
    }


def _latest_garmin_version() -> str | None:
    """Version, die als „Update verfügbar" beworben werden darf: die im Connect-IQ-Store
    FREIGEGEBENE (`appmeta.garmin.latest`) — NICHT die zuletzt gebaute aus dem Katalog.

    Warum: `watch/bin` enthält auch Entwicklungsbuilds (wir bauen dort, um im Simulator zu
    testen). Als der Katalog die Quelle war, bewarb die Website prompt eine 1.0.66, die noch
    nicht einmal eingereicht war — Nutzer hätten einen ungetesteten Build installiert
    (von Jan gemeldet, 2026-07-26). Der Download selbst liefert weiterhin, was im Katalog
    liegt; beworben wird aber nur Freigegebenes.
    """
    v = _APP_META.get("garmin", {}).get("latest") or ""
    return v or None


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
