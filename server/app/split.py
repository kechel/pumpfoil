"""Session TEILEN — das Gegenstueck zu app/merge.py (Nutzerwunsch 25.10.2026: „eine Session aus
Wingfoilen und Pumpfoilen trennen und die Teile neu kategorisieren").

An EINER Stelle (Session-ms) entstehen zwei neue Sessions mit eigenen Rohdaten; das Original wird
archiviert wie eine Merge-Quelle (deleted=True), die Teile tragen `split_from = Original-id`. Aufheben
(`unsplit_session`) loescht beide Teile und holt das Original zurueck — nichts geht verloren.

ALLE SPUREN werden geschnitten, nicht nur GPS und Accel: Handy-Aufnahmen haben auch Kreisel und
Magnetfeld (Brett-Lage), die Tanz-Variante einen eigenen Pulskanal. Die Zeitachsen kommen dabei aus
denselben Stellen wie in der Auswertung (Accel: timebase.py, Kreisel/Magnetfeld: lage.zeitachse) und
landen als Chunks MIT `t0`-Sidecar in den Teilen — die Teile haben damit eine exakte Achse.

ZEIT: Der zweite Teil beginnt bei Session-ms 0 = Schnittstelle. Seine Startzeit ist die WANDUHR der
Schnittstelle (`clockmap.wanduhr_ms`), sonst laege er nach einer Pause um deren Dauer zu frueh.
Pausen, Zuschnitt und alle Zeitfenster-Listen (aussortiert, zurueckgeholte Fremdkraft) werden je Teil
beschnitten und verschoben.
"""
from __future__ import annotations

import json
import shutil
import uuid as _uuid
from datetime import timedelta

import numpy as np
from sqlalchemy.orm import Session as DbSession

from . import clockmap, models, storage
from .analysis import run_analysis
from .merge import CHUNK_SAMPLES, _save_accel_mit_ankern, sync_video_mirror

MIN_TEIL_MS = 60_000      # jeder Teil mindestens 1 min — sonst ist es ein Zuschnitt, keine Trennung

# Werden in den Teilen 1:1 uebernommen (Geraet, Raten, Ausruestung, Einstufung, Sichtbarkeit).
_KOPIEREN = (
    "user_id", "device_id", "sport", "gps_hz", "accel_hz", "accel_scale", "placement", "placement_quelle",
    "ort_sichtbarkeit", "attitude_rot_deg", "hr_source", "messweg_json", "device_model", "app_version",
    "trim_auto", "place_name", "place_water", "place_lat", "place_lon", "foil_id", "stab_id", "mast_len_cm",
    "shim_deg", "board_id", "rider_weight_kg", "caption", "is_pumpfoil", "pumpfoil_override", "sport_class",
    "data_quality", "sport_source", "mod_ok",
)


def _fenster(roh: str | None, lo: int, hi: int) -> str | None:
    """JSON-Liste [[start_ms, end_ms], …] auf [lo, hi) beschneiden und um lo verschieben."""
    if not roh:
        return None
    try:
        daten = json.loads(roh) or []
    except (ValueError, TypeError):
        return None
    out = []
    for f in daten:
        try:
            a, b = int(f[0]), int(f[1])
        except (ValueError, TypeError, IndexError):
            continue
        a, b = max(a, lo), min(b, hi)
        if b > a:
            out.append([a - lo, b - lo] + list(f[2:]))
    return json.dumps(out) if out else None


def _pausen(s: models.Session, lo: int, hi: int) -> str | None:
    """Pausen, die echt INNERHALB des Teils beginnen, verschoben. Eine Pause genau an der
    Schnittstelle zaehlt clockmap zur Zeit davor -> sie steckt in der Startzeit des zweiten Teils."""
    out = [[t - lo, d] for t, d in clockmap.pausen(s) if (lo < t < hi) or (lo == 0 and t < hi)]
    return json.dumps(out) if out else None


def _kanal_schreiben(uuid: str, art: str, arr: np.ndarray, t_ms: np.ndarray) -> int:
    """Kreisel/Magnetfeld als Chunks mit t0-Sidecar (Format wie storage.save_gyro_chunk)."""
    if not arr.shape[0]:
        return 0
    d = storage.ensure_session_dir(uuid) / art
    d.mkdir(parents=True, exist_ok=True)
    n = 0
    for start in range(0, arr.shape[0], CHUNK_SAMPLES):
        stop = min(start + CHUNK_SAMPLES, arr.shape[0])
        (d / f"{n}.bin").write_bytes(np.ascontiguousarray(arr[start:stop], dtype="<i2").tobytes())
        (d / f"{n}.t0").write_text(str(int(round(float(t_ms[start])))))
        n += 1
    return n


def _rohdaten_schreiben(s: models.Session, uuid: str, lo: int, hi: int) -> None:
    """Alle Spuren der Quelle im Fenster [lo, hi) in die neue Session `uuid`, auf lo rebased."""
    from .analysis import lage
    from .analysis.timebase import _accel_chunk_counts, build_timebase

    src = s.session_uuid
    storage.ensure_session_dir(uuid)
    gps = storage.load_gps(src, roh=True)
    storage.save_gps_chunk(uuid, 0, [[p[0] - lo] + list(p[1:]) for p in gps if lo <= p[0] < hi])

    accel = storage.load_accel(src)
    if accel is not None and accel.shape[0]:
        luecken = storage.accel_luecken(src)
        tb = build_timebase(
            gps, accel, s.accel_scale, s.accel_hz,
            chunk_counts=_accel_chunk_counts(src), t0_by_index=storage.load_accel_t0(src),
            # ohne Obergrenze: sonst schneidet timebase am letzten GPS-Punkt ab, und der Rest ginge verloren
            trim_start_ms=None, trim_end_ms=10 ** 12, excluded_ranges=None,
            accel_luecken=luecken, t1_by_index=storage.load_accel_t1(src),
        )
        if tb.t_accel_ms.size == tb.accel.shape[0]:
            m = (tb.t_accel_ms >= lo) & (tb.t_accel_ms < hi)
            _save_accel_mit_ankern(uuid, [(tb.accel[m], tb.t_accel_ms[m] - float(lo))], luecken)
            if luecken:
                storage.markiere_accel_luecken(uuid)

    for art, laden, t0 in (("gyro", storage.load_gyro, storage.load_gyro_t0),
                           ("mag", storage.load_mag, storage.load_mag_t0)):
        arr = laden(src)
        if arr is None or not arr.shape[0]:
            continue
        t = lage.zeitachse(t0(src), storage.chunk_laengen(src, art))
        if t.size != arr.shape[0]:
            continue                      # Achse nicht rekonstruierbar -> lieber weglassen als verschieben
        m = (t >= lo) & (t < hi)
        _kanal_schreiben(uuid, art, arr[m], t[m] - float(lo))

    hr_dir = storage.session_dir(src) / "hr"
    if hr_dir.exists():
        zeilen = []
        for f in sorted(hr_dir.glob("*.json"), key=lambda p: int(p.stem) if p.stem.isdigit() else 0):
            try:
                zeilen += json.loads(f.read_text()) or []
            except (ValueError, OSError):
                continue
        teil = [[z[0] - lo] + list(z[1:]) for z in zeilen if lo <= z[0] < hi]
        if teil:
            storage.save_hr_chunk(uuid, 0, teil)


def _ende_ms(s: models.Session) -> int:
    """Letzte Session-ms der Aufnahme (GPS, sonst Accel-Achse ueber duration)."""
    return int(storage.gps_last_ms(s.session_uuid) or 0)


def kann_teilen(s: models.Session, t_ms: int, merged_count: int = 0) -> tuple[bool, str]:
    if s.deleted:
        return False, "Session ist geloescht"
    if (s.status or "") != "analyzed":
        return False, "Session ist noch nicht fertig hochgeladen/ausgewertet"
    if merged_count:
        return False, "Zusammengefuehrte Session: bitte erst die Zusammenfuehrung aufloesen"
    ende = _ende_ms(s)
    if t_ms < MIN_TEIL_MS or t_ms > ende - MIN_TEIL_MS:
        return False, "Jeder Teil muss mindestens eine Minute lang sein"
    return True, ""


def _sport_setzen(ns: models.Session, user, neu: str | None) -> None:
    """Sportart eines Teils wie beim Umstellen von Hand (api/sessions.set_classification): Ausruestung auf
    den Standard der neuen Sportart, ein AUTOMATISCHER Zuschnitt faellt weg, wenn es kein Pumpfoilen ist."""
    from .equipment_sport import umstellen
    from .sportarten import SPORTS
    if not neu or neu not in SPORTS or neu == ns.sport_class:
        return
    umstellen(ns, user, ns.sport_class, neu)
    ns.sport_class = neu
    ns.sport_source = "owner"
    ns.needs_classification = False
    if neu != "pumpfoil" and ns.trim_auto:
        ns.trim_start_ms = ns.trim_end_ms = ns.trim_auto = None


def split_session(db: DbSession, s: models.Session, t_ms: int,
                  sports: list[str | None] | None = None) -> list[models.Session]:
    """`s` an Session-ms `t_ms` in zwei neue Sessions teilen. -> [erster Teil, zweiter Teil].
    `sports` = Sportart je Teil (None = wie das Original)."""
    # Zeile sperren: ein zweiter Klick waehrend der (langen) Reanalyse wartet und scheitert dann
    # an `deleted` statt eine zweite Kopie zu bauen (s. merge._schon_zusammengefuehrt).
    db.query(models.Session).filter_by(id=s.id).with_for_update().populate_existing().one()
    merged = db.query(models.Session).filter(models.Session.merged_into == s.id).count()
    ok, why = kann_teilen(s, int(t_ms), merged)
    if not ok:
        raise ValueError(why)
    t_ms = int(t_ms)
    # Der zweite Teil laeuft bis zum Ende ALLER Spuren (Accel/Kreisel reichen oft ueber den letzten GPS-Punkt).
    ende = 10 ** 12
    teile = []
    for lo, hi in ((0, t_ms), (t_ms, ende)):
        uuid = "split-" + _uuid.uuid4().hex
        _rohdaten_schreiben(s, uuid, lo, hi)
        start = s.started_at + timedelta(milliseconds=clockmap.wanduhr_ms(clockmap.pausen(s), lo)) \
            if lo else s.started_at
        if hi >= ende:
            stop = s.ended_at
        else:
            stop = s.started_at + timedelta(milliseconds=clockmap.wanduhr_ms(
                [(t, d) for t, d in clockmap.pausen(s) if t < hi], hi))
        # Zuschnitt beschneiden: liegt er ganz ausserhalb, faellt er weg; ein Rand, der genau auf
        # dem Teil-Rand laege, ist kein Zuschnitt mehr.
        ts = s.trim_start_ms if s.trim_start_ms is not None and lo < s.trim_start_ms < hi else None
        te = s.trim_end_ms if s.trim_end_ms is not None and lo < s.trim_end_ms < hi else None
        ns = models.Session(
            session_uuid=uuid, started_at=start, ended_at=stop, status="complete",
            **{k: getattr(s, k) for k in _KOPIEREN},
            trim_start_ms=ts - lo if ts is not None else None,
            trim_end_ms=te - lo if te is not None else None,
            excluded_ranges=_fenster(s.excluded_ranges, lo, hi),
            fremdkraft_keep=_fenster(s.fremdkraft_keep, lo, hi),
            pause_windows=_pausen(s, lo, hi),
            split_from=s.id, analyzed_notified=True,
        )
        db.add(ns)
        teile.append(ns)
    db.flush()
    # Fotos und Videos haengen am ersten Teil (Herkunft gemerkt -> Aufheben bringt sie zurueck).
    db.query(models.SessionPhoto).filter_by(session_id=s.id).update(
        {models.SessionPhoto.session_id: teile[0].id, models.SessionPhoto.merged_from_session_id: s.id})
    db.query(models.SessionVideo).filter_by(session_id=s.id).update(
        {models.SessionVideo.session_id: teile[0].id, models.SessionVideo.merged_from_session_id: s.id})
    s.deleted = True
    s.share_token = None
    db.flush()
    for ns, sp in zip(teile, sports or []):
        _sport_setzen(ns, s.user, sp)
    for ns in teile:
        sync_video_mirror(db, ns)
    db.commit()
    return teile


def teile_auswerten(ids: list[int]) -> None:
    """Die Teile neu auswerten — im HINTERGRUND (eigene DB-Session): eine 7-h-Aufnahme braucht dafuer
    Minuten, das hielte keine Anfrage durch. Bis dahin stehen die Teile auf `complete` („wird
    verarbeitet"); haengt eine Auswertung, holt sie das Sicherheitsnetz in GET /sessions/{id} nach."""
    from .api.sessions import _spot_nachziehen
    from .db import SessionLocal
    db = SessionLocal()
    try:
        for i in ids:
            ns = db.get(models.Session, i)
            if ns is None or ns.deleted:
                continue
            run_analysis(db, ns)
            _spot_nachziehen(db, ns)
            db.commit()
            from . import sportprofil
            if sportprofil.profil(ns.sport_class)["gruppe"] == "wind":
                from .sessionwind import vorholen
                vorholen(ns.id)
    finally:
        db.close()


def unsplit_session(db: DbSession, teil: models.Session) -> models.Session:
    """Teilung aufheben: Original zurueck, ALLE Teile (auch der andere) samt Rohdaten weg."""
    if teil.split_from is None:
        raise ValueError("keine geteilte Session")
    orig = db.get(models.Session, teil.split_from)
    if orig is None:
        raise ValueError("Original nicht mehr vorhanden")
    teile = db.query(models.Session).filter(models.Session.split_from == orig.id).all()
    if any(t.deleted for t in teile):
        raise ValueError("Ein Teil wurde weiter geteilt oder geloescht — bitte erst dort aufheben")
    if any(db.query(models.Session).filter(models.Session.merged_into == t.id).count() for t in teile):
        raise ValueError("Ein Teil wurde zusammengefuehrt — bitte erst dort aufloesen")
    orig.deleted = False
    for t in teile:
        for p in db.query(models.SessionPhoto).filter_by(session_id=t.id).all():
            p.session_id = p.merged_from_session_id or orig.id
            p.merged_from_session_id = None
        for v in db.query(models.SessionVideo).filter_by(session_id=t.id).all():
            v.session_id = v.merged_from_session_id or orig.id
            v.merged_from_session_id = None
    db.flush()
    sync_video_mirror(db, orig)
    for t in teile:
        # Nutzer-Feedback und Rekord-Verlauf ans Original haengen, nicht wegwerfen (Bewertung: eine je
        # Nutzer und Session — hat das Original schon eine, bleibt die).
        for b in db.query(models.SessionBewertung).filter_by(session_id=t.id).all():
            if db.query(models.SessionBewertung).filter_by(session_id=orig.id, user_id=b.user_id).first():
                db.delete(b)
            else:
                b.session_id = orig.id
        db.query(models.RecordEvent).filter_by(session_id=t.id).update({models.RecordEvent.session_id: orig.id})
        db.query(models.RecordEvent).filter_by(prev_session_id=t.id).update(
            {models.RecordEvent.prev_session_id: orig.id})
        db.query(models.RecordSnapshot).filter_by(session_id=t.id).update(
            {models.RecordSnapshot.session_id: orig.id})
        db.flush()
        for m in (models.AnalysisResult, models.Label, models.SessionLike, models.SessionVote,
                  models.SessionFlag, models.SessionTransfer, models.PumpTruth,
                  models.BoardAttitudeCache, models.IngestChunk):
            db.query(m).filter_by(session_id=t.id).delete()
        try:
            d = storage.session_dir(t.session_uuid)
            if d.exists():
                shutil.rmtree(d, ignore_errors=True)
        except ValueError:
            pass
        db.delete(t)
    db.commit()
    return orig
