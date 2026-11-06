"""Geerbte Pausen der Apple Watch (06.11.2026) erkennen und die Zeitachse richtigstellen.

Die Apple-Watch-App (seit der Pause vom 24.09.2026, bis 1.1.61) setzte beim Start einer neuen Aufnahme Pausenzeit und
Pausenliste der vorigen NICHT zurueck (`Recorder.start()`). Jeder Zeitstempel der neuen Aufnahme lag damit um die
Summe der geerbten Pausen zu frueh — bei Mysia (u989) am 03.11. um 4553 s, die ganze Aufnahme vor dem Start, Auswertung
„0 m, nur GPS". Und die Uhr schickte die geerbten Pausenfenster als eigene mit. So lange, bis die App neu startet.

Die Daten selbst sind vollstaendig und untereinander richtig — nur gegen den Start verschoben. Geerbt ist ein Fenster,
wenn die vorige Aufnahme DERSELBEN Uhr es genauso hatte ([Beginn, Dauer] auf die ms gleich). Der Versatz ist die Summe
der geerbten Dauern, wenn der erste Messwert dazu passt (er kommt Millisekunden nach dem Start), sonst der erste
Messwert selbst. Ausgeloest wird nur, wenn der erste Messwert mehr als 2 s VOR dem Start liegt — das gibt es sonst nie. Die eigenen Pausen der Aufnahme lagen ebenfalls verschoben (bei grossem Versatz unter 0 und gingen beim
Speichern verloren) und werden mitgeschoben.

Die Dateien werden neu geschrieben und per os.replace getauscht, nie an Ort und Stelle: server/data ist mit den
Sicherungen hardgelinkt, die behalten so den alten Stand. meta.json bekommt `zeitversatz_ms` und die geerbten Fenster.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from . import models, storage

log = logging.getLogger(__name__)

# Erster Messwert gegen die Summe der geerbten Pausen: Accel kommt Millisekunden nach dem Start, der erste GPS-Punkt
# auch einmal ein paar Sekunden spaeter.
TOLERANZ_MS = 3000
# Ab hier gilt eine Aufnahme als verschoben (darunter ist es die normale Verzoegerung bis zum ersten Messwert).
SCHWELLE_MS = -2000


def _fenster(roh) -> list[list[int]]:
    out = []
    if isinstance(roh, str):
        try:
            roh = json.loads(roh)
        except ValueError:
            return []
    for f in roh or []:
        try:
            out.append([int(f[0]), int(f[1])])
        except (ValueError, TypeError, IndexError):
            continue
    return out


def erster_messwert_ms(session_uuid: str) -> int | None:
    """Fruehester Zeitstempel: Accel-Chunk-Start, sonst erster GPS-Punkt."""
    t0 = storage.load_accel_t0(session_uuid)
    werte = [min(t0.values())] if t0 else []
    g = storage.load_gps(session_uuid, roh=True)
    if g:
        werte.append(int(g[0][0]))
    return min(werte) if werte else None


def vorige_fenster(db, s: models.Session) -> list[list[int]]:
    """Pausenfenster der vorigen Aufnahme derselben Uhr, wie die Uhr sie geschickt hat (meta `pausen_uhr`, sonst DB)."""
    if s.device_id is None or s.started_at is None:
        return []
    S = models.Session
    v = (db.query(S).filter(S.device_id == s.device_id, S.id != s.id, S.started_at < s.started_at)
         .order_by(S.started_at.desc()).first())
    if v is None:
        return []
    meta = _meta(v.session_uuid)
    if "pausen_uhr" in meta:
        return _fenster(meta["pausen_uhr"])
    return _fenster(v.pause_windows)


def bestimmen(fenster: list[list[int]], vorige: list[list[int]], erster_ms: int | None) -> tuple[int, list, list] | None:
    """-> (versatz_ms, geerbte Fenster, eigene Fenster) oder None, wenn die Aufnahme nicht verschoben ist."""
    if erster_ms is None or erster_ms > SCHWELLE_MS:
        return None
    vor = {tuple(f) for f in vorige}
    geerbt = [f for f in fenster if tuple(f) in vor]
    eigene = [f for f in fenster if tuple(f) not in vor]
    versatz = sum(d for _, d in geerbt)
    # Passt die Summe nicht, fehlen geerbte Fenster in der Liste: eigene Pausen einer schon verschobenen Aufnahme lagen
    # unter 0, wurden beim Speichern verworfen und trotzdem weitervererbt (Mysia ab #19857, bis 76 s mehr). Dann traegt
    # der erste Messwert den Versatz — vor dem Start gibt es bei der Apple Watch keine Werte, Accel kommt ms danach.
    if abs(erster_ms + versatz) > TOLERANZ_MS:
        versatz = -erster_ms
    return versatz, geerbt, eigene


def _meta(session_uuid: str) -> dict:
    p = storage.session_dir(session_uuid) / "meta.json"
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return {}


def _ersetzen(p: Path, inhalt: str) -> None:
    neu = p.with_name(p.name + ".neu")
    neu.write_text(inhalt)
    os.replace(neu, p)


def dateien_schieben(session_uuid: str, versatz_ms: int) -> int:
    """Alle Zeitstempel der Rohdaten um `versatz_ms` verschieben. -> Anzahl geaenderter Dateien."""
    d = storage.session_dir(session_uuid)
    n = 0
    for art in ("gps", "hr"):
        for f in sorted((d / art).glob("*.json")) if (d / art).exists() else []:
            zeilen = json.loads(f.read_text())
            for z in zeilen:
                if z:
                    z[0] = int(z[0]) + versatz_ms
            _ersetzen(f, json.dumps(zeilen)); n += 1
    for art in ("accel", "gyro", "mag"):
        if not (d / art).exists():
            continue
        for f in list((d / art).glob("*.t0")) + list((d / art).glob("*.t1")):
            _ersetzen(f, str(int(f.read_text().strip()) + versatz_ms)); n += 1
    return n


def korrigieren(db, s: models.Session, fenster_uhr=None) -> int:
    """Erkennen und richtigstellen. `fenster_uhr` = Pausen, wie die Uhr sie gerade geschickt hat (beim Abschluss, inkl.
    der verschobenen unter 0); fehlt es, gilt die gespeicherte Liste. Committet NICHT. -> Versatz in ms (0 = nichts)."""
    meta = _meta(s.session_uuid)
    if meta.get("zeitversatz_ms"):
        return 0   # schon geschehen
    fenster = _fenster(fenster_uhr) if fenster_uhr is not None else _fenster(s.pause_windows)
    ergebnis = bestimmen(fenster, vorige_fenster(db, s), erster_messwert_ms(s.session_uuid))
    if ergebnis is None:
        return 0
    versatz, geerbt, eigene = ergebnis
    n = dateien_schieben(s.session_uuid, versatz)
    eigene_neu = sorted([t + versatz, dauer] for t, dauer in eigene if t + versatz >= 0)
    s.pause_windows = json.dumps(eigene_neu) if eigene_neu else None
    # Ein Zuschnitt von Hand lag auf der verschobenen Achse; der automatische wird bei der Auswertung neu bestimmt.
    if s.trim_auto is not True:
        if s.trim_start_ms is not None:
            s.trim_start_ms = max(0, s.trim_start_ms + versatz)
        if s.trim_end_ms is not None:
            s.trim_end_ms = max(0, s.trim_end_ms + versatz)
    # Die Liste, wie sie von der Uhr kam, fuer die naechste Aufnahme derselben Uhr (s. vorige_fenster).
    meta.update({"zeitversatz_ms": versatz, "pausen_geerbt": geerbt, "pausen_uhr": fenster})
    _ersetzen(storage.session_dir(s.session_uuid) / "meta.json", json.dumps(meta, default=str, indent=2))
    log.info("zeitversatz: #%s um %d ms verschoben (%d geerbte Pausen, %d Dateien)", s.id, versatz, len(geerbt), n)
    return versatz


def pausen_merken(s: models.Session, fenster_uhr) -> None:
    """Pausen, wie die Uhr sie geschickt hat, in meta.json ablegen — die naechste Aufnahme derselben Uhr erkennt daran,
    was sie geerbt hat (die DB-Liste ist gefiltert und nach der Korrektur verschoben)."""
    p = storage.session_dir(s.session_uuid) / "meta.json"
    if not p.exists():
        return
    meta = _meta(s.session_uuid)
    meta["pausen_uhr"] = _fenster(fenster_uhr)
    _ersetzen(p, json.dumps(meta, default=str, indent=2))
