"""Pairing-Code-Workflow: Website generiert Code, Uhr löst ihn gegen Device-Token ein."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, text as sa_text
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
# -> serverseitig auf 'lite' kappen. FR55 belegt (Nutzer-Meldung); Vorgänger der Reihe vermutlich auch.
_LOW_ACCEL_MODEL_HINTS = ("Forerunner® 55", "Forerunner® 45", "Forerunner® 35", "Forerunner® 30", "Forerunner® 25")

# Gezielt per PART-NUMMER (nicht Namens-Substring, der würde Plus/5S/5X mitfangen): die
# Basis-fēnix 5 / quatix 5 (128-KB-Klasse wie FR55) — B2697 + B2796. Absturz belegt: Nutzer-Meldung
# (fēnix 5, IQ!-Logo bei 25 Hz, 2026-07-19). Die fēnix 5 PLUS (B3089/B3110) ist leistungsfähiger
# und läuft mit 25 Hz sauber (Session #385) -> bewusst NICHT gekappt. 5S/5X: bis Beleg offen.
_LOW_ACCEL_PARTS = frozenset({"006-B2697-00", "006-B2796-00"})


def _is_low_accel_model(part_number: str | None) -> bool:
    if not part_number:
        return False
    if part_number in _LOW_ACCEL_PARTS:
        return True
    m = _partmap().get(part_number)
    name = (m or {}).get("name", "")
    return any(h in name for h in _LOW_ACCEL_MODEL_HINTS)


def _hide_replaced_siblings(db: Session, device: models.DeviceToken) -> int:
    """Beim Pairing ersetzte Eintraege DESSELBEN Geraets ausblenden (nicht loeschen).

    Warum es das braucht: das Einloesen eines Pairing-Codes legt immer eine NEUE Zeile an — die
    Part-Number kennt der Server dort noch nicht (`PairIn` hat nur Code + Label). Wer seine Uhr
    mehrfach neu koppelt, sammelt also Zeilen, und loeschen darf man sie nicht: an ihnen haengen
    Sessions, die ihre Geraete-Zuordnung behalten muessen (Plattform-Statistiken). Gemeldet von
    zwei Nutzern (07.08. und 11.08.), einer hatte 5 Eintraege fuer EINE Instinct 2.

    Ausgeblendet wird nur der EINDEUTIGE Fall: gleicher Nutzer, gleiche Part-Number, und der alte
    Eintrag wurde seit dem Pairing DIESES Eintrags nicht mehr gesehen. Damit kann der alte Token
    ohnehin nicht mehr benutzt werden (eine Uhr haelt genau einen), waehrend zwei baugleiche Uhren
    im Wechselbetrieb geschuetzt bleiben: die zweite meldet sich nach dem Pairing der ersten weiter
    und faellt aus der Bedingung. Im Bestand am 12.08. betraf das 21 Zeilen bei 9 Nutzern — und
    genau ein aktiv genutzter Eintrag blieb dadurch korrekt stehen.

    Ausblenden ist reversibel (POST /hide?hidden=false) und aendert nichts an der Funktion.
    """
    if not device.part_number or device.created_at is None:
        return 0
    res = db.execute(sa_text(
        "UPDATE device_tokens SET hidden_at = now()"
        " WHERE user_id = :u AND part_number = :pn AND id <> :id"
        "   AND hidden_at IS NULL"
        "   AND (last_seen_at IS NULL OR last_seen_at <= :seit)"),
        {"u": device.user_id, "pn": device.part_number, "id": device.id, "seit": device.created_at})
    if res.rowcount:
        db.commit()
    return int(res.rowcount or 0)


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
    lay: int | None = Query(None),  # 1 = der Nutzer hat eigene Layouts AUF DER UHR eingeschaltet
    sf: int | None = Query(None),   # 1 = ein Storage-Write der Uhr ist gescheitert (Store voll)
    kb: int | None = Query(None),   # dabei gepuffertes Volumen in KB (Schaetzung der Uhr)
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
        _hide_replaced_siblings(db, device)
    # Canary-Meldung der Uhr: die letzte Aufnahme mit dynamischem Layout ist nicht sauber
    # beendet worden. Zählen (nicht überschreiben) — daraus lernt der Modell-Kill-Switch.
    # Zaehler ATOMAR in SQL hochsetzen, nicht in Python. Mit 4 uvicorn-Workern gehen sonst
    # Meldungen verloren: die Uhr schickt beim Start zwei Abrufe in derselben Sekunde (der
    # Sofortversuch und der regulaere, der das Flag noch mittraegt), beide lesen denselben
    # Ausgangswert und schreiben +1 — gemessen am 10.08. im Emulator: zwei Abrufe, Zaehler 1.
    if canary:
        db.execute(sa_text(
            "UPDATE device_tokens SET layout_canary_count = COALESCE(layout_canary_count,0) + 1,"
            " layout_canary_at = now() WHERE id = :i"), {"i": device.id})
        db.commit()
        db.refresh(device)
    # Voller Object Store der Uhr. Zaehlen und das GROESSTE gemeldete Volumen behalten: daraus
    # lernen wir, wieviel eine Uhr dieses Modells wirklich puffern kann, statt eine Warnschwelle
    # zu raten. Die Uhr faengt den Fehlschlag seit 1.0.74 ab (vorher starb sie mit „IQ!").
    #
    # ENTPRELLT auf SF_DEBOUNCE_S: ein App-Start schickt zwei Abrufe mit `sf=1` (den Sofortversuch
    # aus _noteStorageFull und den regulaeren, der das Flag noch mittraegt, weil die erste Antwort
    # noch nicht da war). Gezaehlt werden soll das EREIGNIS „Store war voll", nicht der Abruf.
    # Das Volumen wird trotzdem immer mitgenommen — es kostet nichts und kann nur wachsen.
    if sf:
        db.execute(sa_text(
            "UPDATE device_tokens SET"
            "   storage_full_count = COALESCE(storage_full_count,0)"
            "     + CASE WHEN storage_full_at IS NULL OR storage_full_at < now() - make_interval(secs => :deb)"
            "            THEN 1 ELSE 0 END,"
            "   storage_full_kb = GREATEST(COALESCE(storage_full_kb,0), :kb),"
            "   storage_full_at = now()"
            " WHERE id = :i"),
            {"i": device.id, "kb": int(kb or 0), "deb": SF_DEBOUNCE_S})
        db.commit()
        db.refresh(device)
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
    # Plattform der anfragenden Uhr. Das Speicher-Gate unten stammt aus der Connect-IQ-Welt
    # (96-512 KB RAM, Katalog nach Part-Number) und ergibt NUR dort Sinn. Für wear/apple/zepp gibt es
    # keine Part-Number, also war `cat` None, `mem` 0 und damit `layout_capable` immer False: der
    # Layout-Block wurde an diese Uhren NIE ausgeliefert, egal was der Client kann. Solange nur
    # Garmin einen Renderer hatte, fiel das nicht auf.
    plat = (p or device.platform or "garmin")
    is_garmin = plat == "garmin"
    # „Hat der Nutzer den Schalter selbst angefasst?" — steht der Key im GESPEICHERTEN JSON
    # (nicht bloß im DEFAULTS-Merge), war es eine bewusste Entscheidung und sticht eine
    # Modell-Voreinstellung auf „aus".
    stored = json.loads(user.settings_json) if (user and user.settings_json) else {}
    user_opted_in = "layouts_enabled" in stored and bool(stored.get("layouts_enabled"))
    layouts_on = (
        bool(settings.get("layouts_enabled", True))
        # Speicher-/Modell-/Canary-Gates sind Garmin-spezifisch (s. Kommentar an `plat`): auf den
        # anderen Plattformen entscheidet allein der Profil-Schalter.
        and ((cat or {}).get("mem", 0) >= LAYOUT_MIN_MEMORY or not is_garmin)
        # Selbstheilung PRO UHR — aber erst bei WIEDERHOLUNG (s. CANARY_BLOCK_AT). Ein einzelner
        # Absturz ist auf der Uhr selbst schon abgefangen (sie fährt die betroffene Sitzung
        # statisch); ihn hier dauerhaft zu sperren, machte aus der Selbstheilung ein Standverbot,
        # das nur ein manueller Reset im Profil aufhebt. Genau darin lief Jan fest: Uhr meldet den
        # Absturz -> Zähler zurück auf 1 -> Server liefert nie wieder Layouts.
        and (int(device.layout_canary_count or 0) < CANARY_BLOCK_AT or user_opted_in or not is_garmin)
        # ... aber ab CANARY_HARD_BLOCK_AT ist Schluss, auch fuer Opt-in-Nutzer: haeufen sich die
        # Meldungen, ist die App womoeglich schon beim Start unbedienbar und der Schalter an der
        # Uhr unerreichbar. Zuruecksetzen geht dann nur noch im Profil.
        and (int(device.layout_canary_count or 0) < CANARY_HARD_BLOCK_AT or not is_garmin)
        and (_model_layouts_allowed(db, _model_id(pn or device.part_number), user_opted_in) or not is_garmin)
    )
    # Ausgeliefert wird das Layout-Paket, sobald die Uhr GENUG SPEICHER hat — unabhängig davon, ob
    # unsere Empfehlung „an" lautet. Denn `layoutsOn` ist nur noch eine VOREINSTELLUNG: die Uhr
    # initialisiert ihren eigenen Schalter beim App-Start damit, danach entscheidet der Nutzer am
    # Handgelenk (ausdrücklich Jan: „egal was der server sagt, an der uhr will ich es umstellen
    # koennen, nur bei app-start soll es auf den wert des servers einmal vorinitialisiert werden").
    # Ohne mitgeschickte Seiten hätte der Schalter nichts zum Anzeigen.
    # Speicher: ab 512 KB liefern wir ungefragt. Zwischen 128 und 512 KB nur, wenn die Uhr es
    # ausdrücklich ANFORDERT (`lay=1`, gesetzt wenn der Nutzer den Schalter am Handgelenk auf „an"
    # gestellt hat) — Jans fēnix 5 (128 KB) zeigte sonst trotz Umschalten nichts, weil das Paket nie
    # ankam. So bleibt die Voreinstellung für diese Klasse sicher (sie ist die Absturz-anfällige,
    # s. fēnix-5-/FR55-Meldungen), aber wer testen will, darf. Unter 128 KB ist es unmöglich: der Lite-Build hat
    # den Renderer gar nicht drin.
    _mem = (cat or {}).get("mem", 0)
    layout_capable = (
        not is_garmin   # Wear/watchOS/Zepp: kein 96-KB-Problem, Renderer immer bedienbar
        or _mem >= LAYOUT_MIN_MEMORY
        or (_mem >= LAYOUT_MIN_ON_REQUEST and lay == 1)
    )
    layout_block = _layouts_for_watch(db, device.user_id, settings) if layout_capable else {}

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
        "activityType": settings.get("activity_type", "pumpfoil"),   # Rückfall wie DEFAULTS in settings.py
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
        # War hart auf Garmin verdrahtet; jetzt plattform-generisch, damit auch Zepp/Wear/Apple einen
        # Hinweis bekommen, SOBALD in appmeta ein Eintrag für sie steht. Ohne Eintrag bleibt es leer
        # (kein Hinweis) — die Store-Freigaben pflegt Jan dort ein, nicht dieser Code.
        "latestVersion": (_APP_META.get(plat) or {}).get("latest", ""),
        # Dynamische Layouts (F2 P2). `layoutsOn` ist die VOREINSTELLUNG für den Schalter auf der
        # Uhr (Speicher + Absturz-Statistik + Modell-Voreinstellung + Profil-Schalter), NICHT ein
        # Veto: hat der Nutzer den Schalter am Handgelenk angefasst, gilt seiner. `pages`/`offFoil`/
        # `pause` kommen mit, sobald die Uhr genug Speicher hat:
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
    include_hidden: bool = False,
) -> list[dict]:
    """Mit dem Account verknüpfte Uhren/Geräte (ohne Token-Geheimnis).

    Ausgeblendete Eintraege (`hidden_at`, s. /hide) fehlen standardmaessig. Jeder gelieferte
    Eintrag traegt `hidden_total` — die Zahl der ausgeblendeten desselben Nutzers, damit die
    Oberflaeche „N ausgeblendete anzeigen" anbieten kann, ohne einen zweiten Aufruf.
    """
    q = db.query(models.DeviceToken).filter(models.DeviceToken.user_id == user.id)
    hidden_total = int(q.filter(models.DeviceToken.hidden_at.isnot(None)).count())
    if not include_hidden:
        q = q.filter(models.DeviceToken.hidden_at.is_(None))
    rows = (
        q.order_by(models.DeviceToken.last_seen_at.desc().nullslast(),
                   models.DeviceToken.created_at.desc())
        .all()
    )
    latest_garmin = _latest_garmin_version()
    pm = _partmap()
    cat = _catalog_by_id()
    udefault = "full"
    ustored: dict = {}
    if user and user.settings_json:
        try:
            ustored = json.loads(user.settings_json)
            udefault = ustored.get("record_mode", "full")
        except Exception:  # noqa: BLE001
            ustored = {}
    out = []
    sess_n = {i: n for i, n in db.query(models.Session.device_id, func.count(models.Session.id))
             .filter(models.Session.device_id.isnot(None)).group_by(models.Session.device_id).all()}
    for d in rows:
        # Update-Hinweis nur für Garmin (Sideload). Wear/Apple aktualisieren über ihre Stores.
        latest = latest_garmin if (d.platform == "garmin") else None
        update = bool(latest and d.app_version and _version_lt(d.app_version, latest))
        # Modell aus der gemeldeten Part-Number auflösen -> Name + Download-ID (.prg).
        model = pm.get(d.part_number) if d.part_number else None
        out.append({
            "id": d.id,
            # Wie viele Sessions haengen dran? Entscheidet, ob die Oberflaeche „entfernen" anbieten
            # darf (0 = fehlgeschlagener Pairing-Versuch, s. /forget) oder nur „widerrufen".
            "sessions": int(sess_n.get(d.id, 0)),
            "label": d.label,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
            "revoked_at": d.revoked_at.isoformat() if d.revoked_at else None,
            "hidden_at": d.hidden_at.isoformat() if d.hidden_at else None,
            "hidden_total": hidden_total,
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
            # Eigene Layouts: kann diese Uhr sie überhaupt (Speicher) und hat sie einen Absturz
            # gemeldet? Die UI zeigt das je Uhr und bietet das Zurücksetzen an.
            "layout_capable": bool(((cat.get(model["id"]) or {}).get("mem") or 0) >= LAYOUT_MIN_MEMORY) if model else False,
            "layout_canary_count": int(d.layout_canary_count or 0),
            "layout_canary_at": d.layout_canary_at.isoformat() if d.layout_canary_at else None,
            # Voller Uhr-Speicher: wie oft gemeldet und bei welchem gepufferten Volumen. Das ist
            # die Datengrundlage fuer eine spaetere Warnschwelle je Modell (statt geraten).
            "storage_full_count": int(d.storage_full_count or 0),
            "storage_full_kb": int(d.storage_full_kb or 0),
            "storage_full_at": d.storage_full_at.isoformat() if d.storage_full_at else None,
            # WARUM liefert der Server dieser Uhr (keine) Layouts? Ohne das bleibt nur Raten —
            # genau daran hing eine ganze Testrunde („steht auf an, zeigt sie aber nicht").
            # on | off_user | off_memory | off_canary | off_model | off_nolayout
            "layout_state": _layout_state(db, d, ustored, cat.get(model["id"]) if model else None,
                                          model["id"] if model else None),
        })
    return out


def _layout_state(db: Session, d: models.DeviceToken, stored: dict,
                  cat_entry: dict | None, model_id: str | None) -> str:
    """Denselben Gate-Baum wie `/config` auswerten, aber als BEGRÜNDUNG für die UI. Die Reihenfolge
    ist absichtlich dieselbe wie dort — sonst erklärt die Anzeige irgendwann etwas anderes, als der
    Server tut."""
    user_opted_in = "layouts_enabled" in stored and bool(stored.get("layouts_enabled"))
    if "layouts_enabled" in stored and not stored.get("layouts_enabled"):
        return "off_user"
    mem = (cat_entry or {}).get("mem", 0)
    if mem < LAYOUT_MIN_ON_REQUEST:
        return "off_memory"
    if mem < LAYOUT_MIN_MEMORY:
        return "off_memory_optin"
    if int(d.layout_canary_count or 0) >= CANARY_BLOCK_AT and not user_opted_in:
        return "off_canary"
    if not _model_layouts_allowed(db, model_id, user_opted_in):
        return "off_model"
    if not (_layouts_for_watch(db, d.user_id, stored) or {}).get("pages"):
        return "off_nolayout"
    return "on"


@router.post("/{device_id}/layout-canary/reset")
def reset_layout_canary(device_id: int, user: models.User = Depends(current_user),
                        db: Session = Depends(get_db)) -> dict:
    """Absturz-Zähler DIESER Uhr zurücksetzen -> sie bekommt wieder eigene Layouts. Bewusst in
    der Hand des Nutzers: er weiß, ob er das Problem behoben hat oder es nochmal probieren will.
    Die Modell-Statistik bleibt erhalten (sie ist unsere Datenbasis, kein Schalter)."""
    d = db.get(models.DeviceToken, device_id)
    if d is None or d.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gerät nicht gefunden")
    d.layout_canary_count = 0
    d.layout_canary_at = None
    db.commit()
    return {"ok": True, "id": device_id}


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
# Auslieferung der frei gestalteten Uhr-Layouts (F2 P2).
#
# WICHTIG (Entscheidung Jan, 2026-07-26): ein Absturz wirkt **nur für die betroffene Uhr**, NICHT
# global für alle Nutzer desselben Modells. Ein einzelnes Gerät kann aus vielen Gründen abstürzen;
# anderen Nutzern deshalb das Feature wegzunehmen wäre übergriffig. Die Modell-Statistik sammeln
# wir trotzdem — aber als DATENBASIS für eine spätere Entscheidung, was wir je Modell als
# Voreinstellung ausliefern. Und selbst dann darf ein Nutzer es für sich einschalten und testen.
#
# Tore, in dieser Reihenfolge:
#   1. Gerät stark genug — >= 512 KB watchApp-Budget (Katalog-Feld `mem`). Es gibt kein 256-KB-
#      Tier: 96 KB (5 Geräte, Lite-Build) und 128 KB (16, dort crashte 1.0.64 unter Dauerlast)
#      bekommen den Renderer bewusst nicht.
#   2. DIESE Uhr hat nicht WIEDERHOLT Abstürze gemeldet (`DeviceToken.layout_canary_count` <
#      CANARY_BLOCK_AT). Ein einzelner Absturz fängt die Uhr selbst ab (betroffene Sitzung
#      statisch) — er ist Statistik, keine Sperre. Erst der zweite blockt serverseitig, und auch
#      der nur, solange der Nutzer den Schalter nicht selbst auf „an" gestellt hat.
#   3. Nutzer hat es nicht abgeschaltet (`settings.layouts_enabled`, Default an).
#   4. Modell-Voreinstellung (`watch_model_flags.layouts_allowed`): NULL = erlaubt,
#      False = für dieses Modell per Default AUS (datenbasiert von uns gesetzt), True = erzwungen.
#      Ein `False` gilt nur, solange der Nutzer den Schalter nicht selbst angefasst hat — wer
#      bewusst einschaltet, bekommt Layouts trotzdem (Testen erlaubt).
LAYOUT_MIN_MEMORY = 524288      # Bytes watchApp-Budget
# Ab dem WIEVIELTEN gemeldeten Absturz sperrt der Server die Layouts für DIESE Uhr. 1 wäre falsch:
# die Uhr heilt einen Einzelfall selbst (eine Sitzung statisch), und ihre Meldung würde sie dann
# dauerhaft aussperren. Ab 2 (Wiederholung) sieht es nach echtem Problem aus.
CANARY_BLOCK_AT = 2
# HARTES Limit, das auch einen ausdruecklichen Opt-in ueberstimmt. Grund: `user_opted_in` hebt die
# Sperre oben komplett auf ("Testen erlaubt") — bei einem Absturz BEIM APP-START ist das eine Falle,
# denn dann ist die App gar nicht mehr bedienbar, der Schalter an der Uhr also unerreichbar, und
# Loeschen samt Neuinstallation hilft nicht, weil die Konfiguration vom Server kommt. Ab hier
# liefern wir keine Layouts mehr, bis der Nutzer den Zaehler im Profil zuruecksetzt.
CANARY_HARD_BLOCK_AT = 5
# Ein App-Start meldet „Store voll" zweimal (Sofortversuch + regulaerer Abruf). Innerhalb
# dieses Fensters zaehlt das als EIN Ereignis; das Volumen wird trotzdem uebernommen.
SF_DEBOUNCE_S = 60
# Ab diesem Budget darf eine Uhr Layouts ANFORDERN (`lay=1`), auch wenn wir sie nicht von selbst
# ausliefern. 128 KB = die Klasse, in der der Renderer im Build steckt (kein Lite), aber der
# Speicher knapp ist. Darunter (96 KB, Lite) existiert der Renderer nicht -> nichts anzufordern.
LAYOUT_MIN_ON_REQUEST = 131072


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


def _model_layouts_allowed(db: Session, model_id: str | None, user_opted_in: bool = False) -> bool:
    """VOREINSTELLUNG je Modell — kein globaler Kill-Switch.

    NULL/kein Eintrag = erlaubt. `False` heißt „für dieses Modell liefern wir es per Default nicht
    aus" (setzen wir datenbasiert, wenn die Statistik es hergibt) — greift aber NICHT, wenn der
    Nutzer den Schalter selbst angefasst hat: dann darf er testen. `True` = erzwungen.
    """
    if not model_id:
        return False
    flag = db.query(models.WatchModelFlag).filter_by(model_id=model_id).first()
    if flag is None or flag.layouts_allowed is None:
        return True
    if flag.layouts_allowed:
        return True
    return user_opted_in


def _model_canary_devices(db: Session, model_id: str | None) -> int:
    """Wie viele VERSCHIEDENE Uhren dieses Modells haben einen Absturz gemeldet. Rein
    informativ (Admin-Statistik) — daraus entscheiden WIR später über Voreinstellungen,
    es sperrt nichts automatisch."""
    if not model_id:
        return 0
    pns = [pn for pn, m in _partmap().items() if m.get("id") == model_id]
    if not pns:
        return 0
    return (db.query(func.count(models.DeviceToken.id))
            .filter(models.DeviceToken.part_number.in_(pns),
                    models.DeviceToken.layout_canary_count > 0).scalar() or 0)


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
    # F3: je Zustand ein SATZ Seiten. `offFoil`/`pause` (Einzahl) bleiben für 1.0.66 im Store
    # erhalten und tragen den ersten Eintrag; `offFoilPages`/`pausePages` sind die vollen Listen,
    # die neuere Uhren lesen. Fehlt ein Satz, fällt es auf den Einzel-Screen zurück.
    def many(key: str, cat: str, fallback: list) -> list:
        raw = settings.get(key)
        out: list = []
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, list):
                    f = [int(x) for x in item[:3]] + [0] * max(0, 3 - len(item))
                    out.append([0] + f)
                else:
                    l = own.get(int(item)) if isinstance(item, (int, float)) else None
                    if l is not None and l.category == cat:
                        out.append(_layout_payload(l))
        return out or [fallback]

    off_one = one(settings.get("off_foil_layout_id"), "off_foil",
                  settings.get("off_foil_view") or [12, 17, 16])
    pause_one = one(settings.get("pause_layout_id"), "pause",
                    settings.get("pause_view") or [12, 20, 2])
    return {
        "pages": pages,
        "offFoilPages": many("off_foil_pages", "off_foil", off_one),
        "pausePages": many("pause_pages", "pause", pause_one),
        # Blättern in off_foil/pause auch durch die übrigen Seiten? Default an (s. settings).
        "browseAll": bool(settings.get("browse_all_pages", True)),
        "offFoil": off_one,
        "pause": pause_one,
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


@router.post("/{device_id}/forget")
def forget_device(
    device_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Geraet WIRKLICH aus der Liste entfernen — nur wenn keine Session daran haengt.

    Warum es beides braucht (Nutzerfeedback 07.08.: „I have multiple watches recorded, one for
    each attempt of pairing, and I can't remove any from the list"): der Widerruf ist absichtlich
    ein Soft-Revoke, damit alte Sessions ihre Geraete-Zuordnung behalten. Fehlgeschlagene
    Pairing-Versuche haben aber NIE eine Session getragen — die duerfen ganz weg, sonst sammelt
    die Liste Karteileichen, die niemand loswird. Haengt eine Session dran, bleibt es beim
    Widerruf (409), damit die Zuordnung nicht verlorengeht.
    """
    d = db.get(models.DeviceToken, device_id)
    if d is None or d.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gerät nicht gefunden")
    n = db.query(func.count(models.Session.id)).filter(models.Session.device_id == device_id).scalar() or 0
    if n:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{n} Sessions haengen an diesem Geraet")
    db.delete(d)
    db.commit()
    return {"ok": True, "deleted": True}


@router.post("/{device_id}/hide")
def hide_device(
    device_id: int, hidden: bool = True,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Geraet aus der eigenen Liste ausblenden (oder wieder einblenden) — rein kosmetisch.

    Warum das neben `forget` und `revoke` noch gebraucht wird (Nutzerfeedback 07.08. + 11.08.,
    zwei verschiedene Melder): jedes erneute Pairing legt eine NEUE Zeile an, und Zeilen mit
    Sessions duerfen nicht geloescht werden, sonst verlieren die Sessions ihre Geraete-Zuordnung
    (Plattform-Statistiken). Ein Nutzer hatte dadurch 5 Eintraege fuer EINE Instinct 2, drei davon
    unloeschbar. Ausblenden loest genau das, ohne Daten zu verschieben.

    Bewusst KEIN Nebeneffekt auf die Funktion: die Uhr laedt weiter hoch, der Token bleibt gueltig.
    Wer eine Uhr wirklich abkoppeln will, widerruft sie (DELETE) — das ist eine andere Frage.
    """
    d = db.get(models.DeviceToken, device_id)
    if d is None or d.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gerät nicht gefunden")
    d.hidden_at = datetime.now(timezone.utc) if hidden else None
    db.commit()
    return {"ok": True, "hidden": bool(d.hidden_at)}


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
    in 429 (Feldtest) — der Request ist billig (ein indexierter Lookup)."""
    p = db.query(models.DevicePairing).filter_by(claim_token=claim_token).first()
    now = datetime.now(timezone.utc)
    if p is None or _aware(p.expires_at) < now:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pairing nicht gefunden/abgelaufen")
    return PairPollOut(device_token=p.device_token)


def _aware(dt: datetime) -> datetime:
    """SQLite gibt naive datetimes zurück — als UTC interpretieren."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
