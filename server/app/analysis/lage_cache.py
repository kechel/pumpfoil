"""Brett-Lage-Kennzahlen je Lauf, EINMAL je Session gerechnet und gespeichert.

Anlass (Jan, 06.10.2026): der Abschnitt „Board attitude" auf der Startseite lud lange — 11,4 s fuer
12 Brett-Sessions, und es wurde mit jeder Aufnahme mehr. `community.board_attitude` rechnete bei
JEDEM Aufruf die Lage aus den Rohdaten aller Brett-Sessions neu (Accel, Kreisel, Magnetfeld, GPS);
der Zwischenspeicher dort lebte nur 10 Minuten und je Worker (4 Stueck).

Jetzt: die Zahlen je Lauf stehen in `analysis_results.lage_json`, zusammen mit einem Fingerabdruck
der Eingaben (Laeufe, Zuschnitt, Montage-Drehung, Rechenstand `lage.LAGE_VERSION`). Passt der
Fingerabdruck nicht mehr, wird die Session beim naechsten Bedarf einmal neu gerechnet — so muss
nicht jeder Weg, der eine Session aendert, an den Speicher denken. Zusaetzlich rechnet
`run_analysis` Brett-Sessions direkt nach der Auswertung vor, damit neue und geaenderte Sessions
schon fertig sind, wenn jemand die Startseite oeffnet.

Das Foil steht bewusst NICHT im Speicher: es aendert sich ohne neue Rechnung und wird beim
Zusammenfassen frisch von der Session gelesen.
"""
from __future__ import annotations

import json
import zlib

import numpy as np


def fingerabdruck(s, result) -> str:
    from . import lage
    seg = (result.segments_json or "") if result is not None else ""
    return (f"{lage.LAGE_VERSION}|{zlib.crc32(seg.encode()):08x}|{int(s.trim_start_ms or 0)}|"
            f"{s.attitude_rot_deg if s.attitude_rot_deg is not None else '-'}")


def _rechnen(s, result) -> dict:
    """Die Rechnung, wie sie bis 06.10. in community.board_attitude stand — unveraendert."""
    from .. import storage
    from . import lage
    leer = {"gezaehlt": False, "ohne_kreisel": False, "laeufe": []}
    uuid = s.session_uuid
    acc = storage.load_accel(uuid)
    if len(acc) < 4:
        return leer
    t_acc = lage.zeitachse(storage.load_accel_t0(uuid), storage.chunk_laengen(uuid, "accel"))
    if len(t_acc) != len(acc):
        # Ohne `.t0`-Sidecars keine exakte Zeitachse — lieber auslassen als raten
        # (dieselbe Regel wie im Lage-Endpunkt, s. docs/DATA-PIPELINE.md).
        return leer
    gyr = storage.load_gyro(uuid)
    t_gyr = lage.zeitachse(storage.load_gyro_t0(uuid), storage.chunk_laengen(uuid, "gyro"))
    hat_kreisel = len(gyr) >= 4 and len(t_gyr) == len(gyr)
    if not hat_kreisel:
        gyr, t_gyr = np.empty((0, 3)), np.empty(0)
    try:
        segmente = json.loads(result.segments_json) if result and result.segments_json else []
    except (ValueError, AttributeError):
        segmente = []
    aus = {"gezaehlt": False, "ohne_kreisel": not hat_kreisel, "laeufe": []}
    if not segmente:
        return aus
    off = int(s.trim_start_ms or 0)
    bereiche = lage.laufbereiche(segmente, off)
    if not bereiche:
        return aus
    starts = [float(g.get("t_start_session_ms", float(g["t_start_ms"]) + off))
              for g in segmente if g.get("t_start_ms") is not None]
    kennzahlen = lage.kennzahlen_je_lauf(
        acc, t_acc, gyr, t_gyr, bereiche, starts,
        gps=storage.load_gps(uuid),
        rot_vorgabe=(float(s.attitude_rot_deg) if s.attitude_rot_deg is not None else None),
        mag=lage.magnetfeld(storage.load_mag(uuid), lage.zeitachse(
            storage.load_mag_t0(uuid), storage.chunk_laengen(uuid, "mag"))))
    aus["gezaehlt"] = True
    for (a, b), k in zip(bereiche, kennzahlen):
        if not k.get("ok"):
            continue
        aus["laeufe"].append({
            "dauer_s": (b - a) / 1000.0,
            "pitch": k.get("pitch_amplitude_deg"),
            "roll": k.get("roll_amplitude_deg"),
            # Takt und Hub nur, wenn die Rechnung sie selbst fuer belastbar haelt (`hub_sicher`,
            # s. lage.py) — Begruendung im Kommentar an community.board_attitude.
            "takt": k.get("pitch_hz") if k.get("hub_sicher") else None,
            "hub": k.get("hub_pp_cm") if k.get("hub_sicher") else None,
            # Technik-Kennzahlen aus dem Mittelteil, mit und ohne Fliehkraft-Korrektur (lage.py).
            "technik": k.get("technik"),
        })
    return aus


def laeufe_der_session(db, s, speichern: bool = True) -> dict:
    """Kennzahlen je Lauf einer Brett-Session: aus dem Speicher, wenn der Fingerabdruck passt,
    sonst frisch gerechnet und (mit `speichern`) abgelegt."""
    result = s.result
    if result is None:
        return {"gezaehlt": False, "ohne_kreisel": False, "laeufe": []}
    fp = fingerabdruck(s, result)
    if result.lage_json:
        try:
            d = json.loads(result.lage_json)
            if d.get("fp") == fp:
                return d
        except ValueError:
            pass
    d = _rechnen(s, result)
    d = {"fp": fp, **d}
    if speichern:
        result.lage_json = json.dumps(d)
        db.commit()
    return d
