#!/usr/bin/env python
"""Haengende Aufnahmen (`live`/`recording`) endgueltig auswerten und abschliessen.

WOZU: eine Aufnahme, die der Nutzer nie stoppen konnte (Akku leer, App gestorben, Abschluss-
Aufruf verloren), bleibt fuer immer `live`. Die Daten liegen bei uns, der Nutzer sieht nichts.
Am 21.09.2026 waren das 28 Sessions, 20 davon MIT Daten — eine (#8651) sogar mit allen
143 von 143 Chunks. Jans Freigabe am 21.09.: „Ja bitte machen."

Der regulaere Weg dafuer ist `_altlasten_abschliessen` in `app/api/ingest.py`: der schliesst
alte Aufnahmen ab, sobald dasselbe Geraet eine NEUERE anmeldet. Genau das ist bei diesen
Sessions nie passiert — 25 der 28 Nutzer haben danach nie wieder aufgezeichnet. Dieses Skript
ist der Nachzug von Hand fuer den Bestand; die Automatik dafuer steht noch aus.

WARUM DAS KEINE DATEN GEFAEHRDET: `/status` sagt einer Uhr erst „complete" (= du darfst deine
Kopie loeschen), wenn wir ALLE Chunks haben — sonst antwortet es weiter „live", und der
Uploader schickt ueber `received_chunks` nur das Fehlende nach (s. Kommentar in
`ingest.session_status`, Jan 06.09.: „mach es so, dass moeglichst nie Daten verloren gehen").
Ein Abschluss hier kann eine Aufnahme also nicht abschneiden, solange `expected_chunks` gesetzt
ist. Wo das fehlt (Altbestand vor der Einfuehrung), sagt das Skript es ausdruecklich.

KEINE BENACHRICHTIGUNG: `_analyze_in_background` wuerde „Deine Session ist ausgewertet" pushen.
Fuer eine Fahrt von vor einem Monat ist das genau der nachtraegliche Push, den Jans Regel
verbietet. Deshalb ruft dieses Skript `run_analysis` selbst auf und laesst `notify` weg.

Aufruf (READ-ONLY Voranzeige):
    cd server && DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" DETECTOR_V2=1 \
        .venv/bin/python ../scripts/haenger-abschliessen.py

Wirklich ausfuehren: `--machen`. Vorher wird der Ist-Zustand nach
`server/data/haenger-vorher-<stamp>.json` gesichert.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HIER = Path(__file__).resolve().parent
SERVER = HIER.parent / "server"
sys.path.insert(0, str(SERVER))

# .env von Hand lesen: `set -a; . ./.env` exportiert nicht zuverlaessig (s. CLAUDE.md), und ohne
# DETECTOR_V2 schreibt run_analysis stumm v1-Ergebnisse.
for zeile in (SERVER / ".env").read_text().splitlines():
    m = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", zeile.strip())
    if m and m.group(1) not in os.environ:
        os.environ[m.group(1)] = m.group(2)
if os.environ.get("DETECTOR_V2", "").strip().lower() not in ("1", "true", "yes", "on"):
    sys.exit("DETECTOR_V2 fehlt — sonst schreibt run_analysis stumm v1-Ergebnisse. Abbruch.")

from sqlalchemy import func, text                                    # noqa: E402

from app import models, storage                                      # noqa: E402
from app.analysis import maybe_auto_trim, run_analysis               # noqa: E402
from app.db import SessionLocal                                      # noqa: E402
from app.clockmap import gesamt_pause_ms                             # noqa: E402

HAENGT = ("live", "recording")


def kandidaten(db):
    return (db.query(models.Session)
            .filter(models.Session.deleted.is_(False),
                    models.Session.status.in_(HAENGT))
            .order_by(models.Session.started_at)
            .all())


def zustand(db, s) -> dict:
    chunks = int(db.query(func.count(models.IngestChunk.id))
                 .filter_by(session_id=s.id).scalar() or 0)
    r = s.result
    return {
        "id": s.id, "uuid": s.session_uuid, "user_id": s.user_id, "status": s.status,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "device_model": s.device_model, "app_version": s.app_version,
        "expected_chunks": s.expected_chunks, "total_chunks": s.total_chunks,
        "chunks_da": chunks, "is_pumpfoil": s.is_pumpfoil,
        "trim_start_ms": s.trim_start_ms, "trim_end_ms": s.trim_end_ms,
        "trim_auto": s.trim_auto, "analyzed_notified": s.analyzed_notified,
        "ergebnis": None if r is None else {
            "algo_version": r.algo_version, "total_distance_m": r.total_distance_m,
            "foiling_distance_m": r.foiling_distance_m, "pump_count": r.pump_count,
            "num_runs": r.num_runs, "detection": r.detection},
    }


def endzeit_nachtragen(s) -> bool:
    """Endzeit wie in `/complete`: letzter GPS-Zeitstempel plus die Pausendauer (Wanduhr)."""
    if s.ended_at is not None or s.started_at is None:
        return False
    lm = storage.gps_last_ms(s.session_uuid)
    if not lm:
        return False
    s.ended_at = s.started_at + timedelta(milliseconds=lm + gesamt_pause_ms(s))
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--machen", action="store_true", help="wirklich schreiben")
    ap.add_argument("--session", type=int, action="append",
                    help="nur diese Session-ID (mehrfach moeglich)")
    # Ruhezeit, bevor eine Aufnahme als haengend gilt. Der regulaere Weg
    # (`_altlasten_abschliessen`) nimmt 1800 s, hat aber ein zweites Signal: dasselbe Geraet
    # meldet eine neuere Aufnahme an. Das fehlt hier, also deutlich grosszuegiger — eine lange
    # Fahrt plus Heimweg ohne Netz muss durchpassen, ohne dass wir sie fuer tot erklaeren.
    ap.add_argument("--ruhe-h", type=float, default=12.0,
                    help="erst anfassen, wenn so viele Stunden kein Chunk mehr kam (Vorgabe 12)")
    args = ap.parse_args()

    db = SessionLocal()
    alle = kandidaten(db)
    if args.session:
        alle = [s for s in alle if s.id in set(args.session)]
    vorher = [zustand(db, s) for s in alle]

    jetzt = datetime.now(timezone.utc)
    mit, ohne, zu_frisch = [], [], []
    for s, z in zip(alle, vorher):
        if z["chunks_da"] == 0:
            ohne.append((s, z))
            continue
        letzter = (db.query(func.max(models.IngestChunk.received_at))
                   .filter_by(session_id=s.id).scalar())
        if letzter is not None and letzter.tzinfo is None:
            letzter = letzter.replace(tzinfo=timezone.utc)
        still_h = (jetzt - letzter).total_seconds() / 3600.0 if letzter else 1e9
        z["still_h"] = round(still_h, 1)
        (mit if still_h >= args.ruhe_h else zu_frisch).append((s, z))

    print(f"{len(alle)} haengende Aufnahmen: {len(mit)} zum Abschliessen, "
          f"{len(zu_frisch)} noch zu frisch, {len(ohne)} ohne einen Chunk\n")
    for s, z in mit:
        soll = z["expected_chunks"] or z["total_chunks"] or 0
        warn = "" if soll else "   ! kein expected_chunks - /status koennte zu frueh complete sagen"
        print(f"  #{z['id']:5d} N{z['user_id']:4d} {z['status']:9} {z['started_at'][:16]}  "
              f"Chunks {z['chunks_da']:5d}/{soll:5d}  still seit {z['still_h']:6.1f} h  "
              f"Endzeit {'ja' if z['ended_at'] else 'FEHLT'}{warn}")
    if zu_frisch:
        print(f"\n  NOCH ZU FRISCH (unter {args.ruhe_h:g} h ohne Chunk, laedt vielleicht noch): "
              + ", ".join(f"#{z['id']} ({z['still_h']:.1f} h)" for _, z in zu_frisch))
    if ohne:
        print(f"\n  UNANGETASTET (kein einzelner Chunk, es gibt nichts auszuwerten): "
              f"{', '.join('#%d' % z['id'] for _, z in ohne)}")

    if not args.machen:
        print("\n(Voranzeige — nichts geschrieben. Mit --machen ausfuehren.)")
        return

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    sicherung = SERVER / "data" / f"haenger-vorher-{stamp}.json"
    sicherung.write_text(json.dumps(vorher, indent=2, ensure_ascii=False))
    print(f"\nIst-Zustand gesichert: {sicherung}")

    for s, z in mit:
        neu = endzeit_nachtragen(s)
        if neu:
            db.commit()
        try:
            run_analysis(db, s, final=True)
            if maybe_auto_trim(db, s):
                run_analysis(db, s, final=True)
        except Exception as e:                                  # noqa: BLE001
            print(f"  #{s.id}: FEHLER {e!r}")
            db.rollback()
            continue
        # Ort/Spot nachziehen — sonst fehlen Marker, Spot-Wetter und Spot-Chat.
        try:
            from app.api.sessions import _geocode_place
            _geocode_place(s.id)
        except Exception:                                       # noqa: BLE001
            pass
        r = s.result
        print(f"  #{s.id}: {z['status']} -> {s.status}, Endzeit "
              f"{'nachgetragen' if neu else 'war da'}, "
              f"{(r.total_distance_m or 0) if r else 0:.0f} m, "
              f"{(r.num_runs or 0) if r else 0} Laeufe, pumpfoil={s.is_pumpfoil}")
    print("\nFertig. KEINE Push-Benachrichtigung verschickt (nachtraeglich pushen ist verboten).")


if __name__ == "__main__":
    main()
