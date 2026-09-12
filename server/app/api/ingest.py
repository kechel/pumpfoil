"""Roh-Upload von der Uhr: Session anmelden, Chunks hochladen, abschließen.

Idempotent & resumebar: gleiche (session, kind, index) überschreibt; received_chunks
erlaubt der Uhr, nach Abbruch nur Fehlendes nachzuschicken.
"""
from __future__ import annotations

import json as _json_mod
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, storage
from ..analysis import maybe_auto_trim, run_analysis
from ..clockmap import gesamt_pause_ms
from ..db import SessionLocal, get_db
from ..naming import ist_gattung, modell_aus_session
from ..schemas import (
    ChunkIn,
    ChunkOut,
    SessionCompleteIn,
    SessionStartIn,
    SessionStartOut,
)
from ..setup_snapshot import standard_setup
from .deps import current_device

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

log = logging.getLogger(__name__)


def _get_owned_session(db, device, session_uuid) -> models.Session:
    s = db.query(models.Session).filter_by(session_uuid=session_uuid).first()
    if s is None or s.user_id != device.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return s


def _altlasten_abschliessen(db: Session, device: models.DeviceToken,
                            aktuelle: models.Session, background: BackgroundTasks) -> None:
    """Aeltere, nie abgeschlossene Sessions DESSELBEN Geraets endgueltig auswerten.

    Warum dieses Signal (Jan, 06.09.): eine Aufnahme, die der Nutzer nie stoppen konnte (Akku
    leer), bleibt fuer immer `live` — es gibt keinen Zeitpunkt, an dem sie fertig wird. Meldet
    dasselbe Geraet aber eine NEUERE Aufnahme an, ohne die alte vervollstaendigt zu haben, ist
    das das einzige belastbare Zeichen, dass die alten Daten dort nicht mehr warten.

    Sicherheitsnetz drumherum, weil das Zeichen nicht unfehlbar ist: die Apple-App macht nach
    einem Upload-Fehler mit der naechsten Session weiter (`drain()` bricht nur bei 401 ab), eine
    neuere Session kann also hochgeladen werden, waehrend die aeltere noch Daten auf der Uhr hat.
    Deshalb (a) nur Sessions anfassen, bei denen seit `RUHE_ABSCHLUSS_S` kein Chunk mehr kam, und
    (b) `/status` meldet „complete" ohnehin erst, wenn alle Chunks da sind — eine Uhr wirft also
    auch dann nichts weg, wenn hier zu frueh abgeschlossen wird.
    """
    from datetime import datetime, timezone

    from sqlalchemy import func as _f

    if device.id is None or aktuelle.started_at is None:
        return
    alt = (db.query(models.Session)
           .filter(models.Session.device_id == device.id,
                   models.Session.id != aktuelle.id,
                   models.Session.deleted.is_(False),
                   models.Session.status.in_(("recording", "live")),
                   models.Session.started_at < aktuelle.started_at)
           .all())
    jetzt = datetime.now(timezone.utc)
    for a in alt:
        letzter = (db.query(_f.max(models.IngestChunk.received_at))
                   .filter_by(session_id=a.id).scalar())
        if letzter is None:
            continue                      # nie etwas hochgeladen -> nichts abzuschliessen
        if letzter.tzinfo is None:
            letzter = letzter.replace(tzinfo=timezone.utc)
        if (jetzt - letzter).total_seconds() < RUHE_ABSCHLUSS_S:
            continue                      # laedt vielleicht gerade noch -> in Ruhe lassen
        # Endzeit nachtragen wie in `/complete`, wenn die Uhr sie nie geschickt hat.
        if a.ended_at is None and a.started_at is not None:
            from datetime import timedelta
            lm = storage.gps_last_ms(a.session_uuid)
            if lm:
                # Wanduhr-Ende, s. /complete: Pausen kommen dazu (hier praktisch immer 0 —
                # ohne /complete hat die Uhr nie Pausen gemeldet).
                a.ended_at = a.started_at + timedelta(milliseconds=lm + gesamt_pause_ms(a))
                db.commit()
        log.info("ingest: schliesse Session %s ab — Geraet %s meldet eine neuere an",
                 a.session_uuid, device.id)
        background.add_task(_analyze_in_background, a.id, True)


@router.post("/session", response_model=SessionStartOut)
def start_session(
    body: SessionStartIn,
    background: BackgroundTasks,
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
) -> SessionStartOut:
    s = db.query(models.Session).filter_by(session_uuid=body.session_uuid).first()
    if s is None:
        # Standard-Foil des Nutzers beim Anlegen fest zuordnen (änderbar).
        import json as _json
        _foil = None
        # Auf der Uhr für diese Session gewähltes Foil hat Vorrang (Override), sofern es
        # im Katalog existiert. Sonst Standard-Foil des Nutzers aus den Settings.
        if body.foil_id is not None and db.get(models.Foil, body.foil_id) is not None:
            _foil = body.foil_id
        else:
            _u = db.get(models.User, device.user_id)
            if _u and _u.settings_json:
                try:
                    _foil = (_json.loads(_u.settings_json) or {}).get("foil_id")
                except ValueError:
                    _foil = None
        # Standard-Sportart des Nutzers (docs/sport-classification.md): wer überwiegend Wingfoil
        # aufzeichnet, landet direkt in der richtigen Kategorie statt jede Session nachzuordnen.
        # `sport_source` bleibt „default" — es ist eine Voreinstellung, kein Einzelurteil.
        _sport_class = "pumpfoil"
        _uu = db.get(models.User, device.user_id)
        if _uu and _uu.settings_json:
            try:
                _sport_class = ((_json.loads(_uu.settings_json) or {}).get("default_sport_class")
                                or "pumpfoil")
            except ValueError:
                _sport_class = "pumpfoil"
        s = models.Session(
            session_uuid=body.session_uuid,
            user_id=device.user_id,
            device_id=device.id,
            sport=body.sport,
            started_at=body.started_at,
            gps_hz=body.gps_hz,
            accel_hz=body.accel_hz,
            accel_scale=body.accel_scale,
            status="recording",
            foil_id=_foil,
            # Restliches Setup (Stab/Board/Mast/Shim) als Schnappschuss aus dem Profil — sonst
            # erbt die Session es beim LESEN und der Stern im Profil wirkt rueckwirkend auf die
            # ganze Historie (s. app/setup_snapshot.py).
            **standard_setup(db, _uu),
            sport_class=_sport_class,
            placement=(body.placement or None),
            device_model=(body.device_model or None),
            # Angabe des Clients, sonst die letzte vom Gerät gemeldete Version (Uhren schicken sie
            # bei jedem /devices/config mit) -> Garmin & Co. brauchen dafür kein Update.
            app_version=(body.app_version or device.app_version or None),
            expected_chunks=body.expected_chunks,
        )
        db.add(s)
        # Uhr-Bezeichnung aus der Aufnahme nachziehen. Beim PAIRING kennt der Server das Modell
        # nicht — Apple und Wear melden dort nichts, und das Label kommt vom pairenden Client
        # (die Apps schickten dort bis 11.09.2026 fest "Garmin"). In der Aufnahme steht es aber:
        # `device_model` = "Watch7,12 · watchOS 26.6". Nur eine GATTUNG wird ersetzt, ein bereits
        # aufgeloester Modellname (Garmin-Partmap, Wear `Build.MODEL`) bleibt unangetastet.
        _modell = modell_aus_session(body.device_model)
        if _modell and ist_gattung(device.label):
            device.label = _modell[:120]
        db.commit()
        db.refresh(s)
    elif s.user_id != device.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Session belongs to another user")
    elif body.expected_chunks is not None and s.expected_chunks != body.expected_chunks:
        s.expected_chunks = body.expected_chunks   # Resume: erwartete Zahl aktualisieren
        db.commit()

    storage.write_meta(
        body.session_uuid,
        {
            "session_uuid": body.session_uuid,
            "started_at": body.started_at,
            "sport": body.sport,
            "gps_hz": body.gps_hz,
            "accel_hz": body.accel_hz,
            "accel_scale": body.accel_scale,
        },
    )
    _altlasten_abschliessen(db, device, s, background)
    received = [c.index for c in s.chunks]
    return SessionStartOut(session_id=s.id, received_chunks=sorted(set(received)))


# Wie lange nach dem letzten Chunk gewartet wird, bevor neu gerechnet wird. Nicht nach JEDEM
# Chunk rechnen (Jan, 06.09.) — bei 1372 Chunks waeren das 1372 volle Analysen, und waehrend ein
# Upload laeuft ist jeder Zwischenstand ohnehin gleich wieder veraltet. Erst wenn die Uebertragung
# zur Ruhe gekommen ist, lohnt sich die Rechnung. Ist sie dagegen VOLLSTAENDIG, wird sofort
# gerechnet — dann kommt nichts mehr, worauf man warten muesste.
RUHE_S = 180

# Wie lange eine aeltere Session ohne neuen Chunk sein muss, bevor sie beim Anmelden einer
# neueren Session desselben Geraets abgeschlossen wird. Grosszuegig: ein Upload, der gerade
# stockt, soll nicht abgeschnitten werden.
RUHE_ABSCHLUSS_S = 1800


def _nachrechnen_faellig(db: Session, s: "models.Session") -> bool:
    """Liegt die Analyse hinter den Daten — und ist der Upload so weit zur Ruhe gekommen,
    dass sich das Rechnen lohnt?

    Drei Bedingungen, alle noetig:
    1. Die Session laeuft noch (`recording`/`live`). Abgeschlossene rechnet `/complete`.
    2. Seit der letzten Analyse sind Chunks angekommen. `updated_at` ist der Zeitpunkt der
       letzten Analyse — `run_analysis` schreibt in die Session-Zeile, ein Chunk-Upload nicht.
       Das braucht keine neue Spalte und gilt ueber alle vier uvicorn-Arbeitsprozesse hinweg,
       weil der Zustand in der DB steht und nicht im Prozess.
    3. Entweder ist die Uebertragung vollstaendig (dann sofort), oder der letzte Chunk liegt
       mindestens `RUHE_S` zurueck.
    """
    from datetime import datetime, timezone

    from sqlalchemy import func as _f

    if s.status not in ("recording", "live", None):
        return False
    letzter, anzahl = (db.query(_f.max(models.IngestChunk.received_at),
                                _f.count(models.IngestChunk.id))
                       .filter_by(session_id=s.id).first() or (None, 0))
    if letzter is None:
        return False
    if letzter.tzinfo is None:
        letzter = letzter.replace(tzinfo=timezone.utc)
    stand = s.updated_at or s.created_at
    if stand is not None:
        if stand.tzinfo is None:
            stand = stand.replace(tzinfo=timezone.utc)
        if letzter <= stand:
            return False                      # seit der letzten Analyse kam nichts Neues
    if s.expected_chunks and (anzahl or 0) >= s.expected_chunks:
        return True                           # vollstaendig -> nicht warten
    return (datetime.now(timezone.utc) - letzter).total_seconds() >= RUHE_S


@router.post("/session/{session_uuid}/chunk", response_model=ChunkOut)
def upload_chunk(
    session_uuid: str,
    body: ChunkIn,
    background: BackgroundTasks,
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
) -> ChunkOut:
    s = _get_owned_session(db, device, session_uuid)

    if body.kind == "gps":
        if not isinstance(body.data, list):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "gps data must be a list")
        n = storage.save_gps_chunk(session_uuid, body.index, body.data)
    elif body.kind == "accel":
        if not isinstance(body.data, str):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "accel data must be base64 string")
        n = storage.save_accel_chunk(session_uuid, body.index, body.data, t0_ms=body.t0_ms)
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown kind {body.kind!r}")

    chunk = (
        db.query(models.IngestChunk)
        .filter_by(session_id=s.id, kind=body.kind, index=body.index)
        .first()
    )
    if chunk is None:
        chunk = models.IngestChunk(
            session_id=s.id, kind=body.kind, index=body.index, sample_count=n
        )
        db.add(chunk)
    else:
        chunk.sample_count = n
    db.commit()
    # Weiterrechnen, solange Daten nachkommen (Jan, 06.09.): auswerten und anzeigen, was DA ist —
    # bis zu dem Punkt, bis zu dem die Daten reichen. Kommt nichts mehr, hoert es von selbst auf;
    # es braucht also keinen Abschluss-Zeitpunkt und keine Aufraeum-Schleife. Der Anlass dafuer
    # war eine Apple Watch, deren Akku mitten in der Fahrt leer war: die Vorabanalyse lief genau
    # EINMAL beim Oeffnen der Session (`s.result is None`), stand danach fuer immer auf dem Stand
    # der ersten hochgeladenen Minuten — 4 statt 13 Laeufe — und niemand konnte es sehen.
    # `final=False`: der Status bleibt „live", die Uhr darf ihre Daten NICHT wegwerfen.
    if _nachrechnen_faellig(db, s):
        background.add_task(_analyze_in_background, s.id, False)
    return ChunkOut(ok=True, index=body.index)


def _analyze_in_background(session_id: int, final: bool = True) -> None:
    """Analyse in eigener DB-Session (die Request-Session ist nach Antwort geschlossen)."""
    db = SessionLocal()
    try:
        s = db.get(models.Session, session_id)
        if s is not None:
            run_analysis(db, s, final=final)
            if final and maybe_auto_trim(db, s):  # nach Abschluss Heimfahrt o.ä. wegschneiden
                run_analysis(db, s, final=True)
            if final:
                from ..notify import notify_session_analyzed
                notify_session_analyzed(db, s)
    finally:
        db.close()
    if not final:
        return
    # Ort + Spot direkt nach der Analyse bestimmen — NICHT erst, wenn jemand die
    # Detailansicht oeffnet. Bis 26.08. hing das ausschliesslich am Aufruf von
    # GET /api/sessions/{id}: wer nur die Liste ansah, bekam nie `place_lat`/`place_name` und
    # damit keinen Spot, keinen Marker, kein Spot-Wetter, keinen Spot-Chat. Gemessen waren so
    # 661 von 1940 Sessions (34 %) ohne Ort, bei einzelnen Nutzern 75-93 % ihrer eigenen.
    # Gleiche Gesamtlast wie vorher (jede Session genau einmal), nur frueher und unabhaengig
    # davon, ob jemand hinschaut. Eigene DB-Session, laeuft ohnehin im Hintergrund.
    try:
        from .sessions import _geocode_place
        _geocode_place(session_id)
    except Exception:      # Geocoding darf die Analyse nie nachtraeglich scheitern lassen
        pass


@router.post("/session/{session_uuid}/analyze")
def analyze_partial(
    session_uuid: str,
    background: BackgroundTasks,
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
) -> dict:
    """Zwischenanalyse während die Aufnahme noch läuft (Live-Sync). Rechnet die
    bisher hochgeladenen Rohdaten neu durch, ohne die Session abzuschließen ->
    der aktuelle Lauf ist schon auswertbar, ohne die Aktivität zu beenden."""
    s = _get_owned_session(db, device, session_uuid)
    # Bereits abgeschlossene Session NICHT durch einen späten /analyze wieder auf "live"
    # zurückstufen (sonst hängt eine verwaiste Uhr-Session in der Analyze-Schleife).
    if s.status == "complete":
        return {"session_id": s.id, "status": "complete", "analysis": "skipped"}
    background.add_task(_analyze_in_background, s.id, False)
    return {"session_id": s.id, "status": "live", "analysis": "queued"}


@router.get("/session/{session_uuid}/status")
def session_status(
    session_uuid: str,
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
) -> dict:
    """Abgleich für die Uhr: ist diese Session schon hochgeladen/abgeschlossen?
    Damit kann die Uhr eine lokal hängende Session (verlorene /complete-Bestätigung)
    erkennen und aufräumen, statt sie endlos erneut hochzuladen.
    Antwortet immer 200: {exists, status} (status: none|recording|complete)."""
    s = db.query(models.Session).filter_by(session_uuid=session_uuid).first()
    if s is None or s.user_id != device.user_id:
        return {"exists": False, "status": "none"}
    # Für die Uhr zählt nur: ist die Session serverseitig fertig? Jeder finalisierte
    # Zustand (complete/analyzed/…) -> "complete", damit die Uhr aufräumt; nur die noch
    # laufende Aufnahme (recording/live) hält sie offen.
    done = s.status not in ("recording", "live", None)
    # ABER: „complete" heisst fuer die Uhr „du darfst deine Kopie loeschen" (Uploader.mc ruft
    # daraufhin `_cleanup()`). Das duerfen wir nur sagen, wenn wir die Chunks auch wirklich alle
    # haben. Sonst genuegt EIN vorzeitiger Abschluss auf unserer Seite, um Daten endgueltig zu
    # vernichten, die nur noch auf der Uhr liegen — und der Abschluss kann kuenftig auch ohne
    # Zutun der Uhr passieren (s. `_altlasten_abschliessen`). Fehlt etwas, antworten wir „live":
    # der Uploader laedt dann weiter statt zu loeschen (Uploader.onStatus -> `_startSession()`),
    # und ueber `received_chunks` schickt er nur das Fehlende. Jan, 06.09.: „mach es so, dass
    # moeglichst nie Daten verloren gehen."
    # Nur fuer echte Uhr-Uploads: importierte Sessions (FIT/TCX aus einem verknuepften Konto)
    # setzen `total_chunks = 1`, legen aber nie `ingest_chunks` an — die saehen sonst alle
    # unvollstaendig aus. Sie haben kein `device_id`, weil sie nicht von einem gepaarten Geraet
    # stammen, und fragen diesen Endpunkt auch nie.
    if done and s.device_id is not None:
        soll = s.expected_chunks or s.total_chunks
        if soll:
            from sqlalchemy import func as _f
            haben = int(db.query(_f.count(models.IngestChunk.id))
                        .filter_by(session_id=s.id).scalar() or 0)
            if haben < soll:
                log.info("ingest: %s serverseitig fertig, aber %d von %d Chunks — Uhr behaelt",
                         session_uuid, haben, soll)
                done = False
    return {"exists": True, "status": "complete" if done else (s.status or "recording")}


@router.post("/session/{session_uuid}/complete")
def complete_session(
    session_uuid: str,
    body: SessionCompleteIn,
    background: BackgroundTasks,
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
) -> dict:
    s = _get_owned_session(db, device, session_uuid)
    # Pausen der Aufnahme (nur Garmin kann pausieren). Erst speichern, dann `ended_at` rechnen —
    # die Endzeit haengt daran.
    if body.pauses is not None:
        fenster = []
        for item in body.pauses:
            try:
                t, d = int(item[0]), int(item[1])
            except (ValueError, TypeError, IndexError):
                continue
            if t >= 0 and d > 0:
                fenster.append([t, d])
        s.pause_windows = _json_mod.dumps(sorted(fenster)) if fenster else None
    if body.ended_at is not None:
        s.ended_at = body.ended_at
    # Fehlt die Endzeit (Uhr schickt sie nicht / Aufnahme abgebrochen), aus dem letzten
    # GPS-Zeitstempel ableiten und PERSISTIEREN — so haben alle Uploads eine Endzeit.
    # WICHTIG: der GPS-Zeitstempel ist AKTIVE Zeit, die Pausen fehlen darin. `ended_at` ist eine
    # WANDUHR-Zeit („wann war ich draussen"), also kommt die Pausendauer dazu — sonst endet eine
    # Session mit 44 min Pause 44 min zu frueh (gemeldet 10.09.2026).
    if s.ended_at is None and s.started_at is not None:
        from datetime import timedelta
        lm = storage.gps_last_ms(s.session_uuid)
        if lm:
            s.ended_at = s.started_at + timedelta(milliseconds=lm + gesamt_pause_ms(s))
    s.total_chunks = body.total_chunks
    s.status = "complete"
    db.commit()

    # Analyse asynchron, damit der Upload-Abschluss der Uhr schnell quittiert wird.
    background.add_task(_analyze_in_background, s.id)
    return {"session_id": s.id, "status": s.status, "analysis": "queued"}
