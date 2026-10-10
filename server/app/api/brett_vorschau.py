"""Vorschau der Brett-Regeln (app/analysis/brett_regeln.py) in der normalen Session-Antwort — NUR LESEND.

Jan, 10.10.2026: bevor die Regeln live gehen, will er sie an echten Sessions sehen, und zwar in der
Vergleichsansicht wie zwei normale Sessions (alt gegen neu, mit Pump-Markern). Dafuer liefert
`GET /api/sessions/{id}?brett=neu` fuer Admins dieselbe Antwort, nur mit den Laeufen und Summen nach
den Regeln ueberlagert. Gerechnet wird bei jedem Aufruf neu; in die Datenbank schreibt das nichts.

Ueberlagert je Lauf (nur wo die Regeln eine Aussage haben, `ok`): Pumps + Marker, Ende am Aufsetzen
(nur kuerzer), Gleitphasen. Laeufe mit zu wenig Zyklen behalten die bisherigen Zahlen. Die Distanz
bleibt die alte (beim Kuerzen um wenige Sekunden ein kleiner Fehler, fuer die Vorschau egal).
"""
from __future__ import annotations

import copy

import numpy as np

from .. import models, storage


def _track_zeiten(s: models.Session, n_punkte: int) -> np.ndarray | None:
    """Session-ms je Punkt der gespeicherten Spur (Zuschnitt), None wenn es nicht aufgeht."""
    gps = storage.load_gps(s.session_uuid)
    if not gps:
        return None
    lo = s.trim_start_ms if s.trim_start_ms is not None else 0
    hi = s.trim_end_ms if s.trim_end_ms is not None else gps[-1][0]
    t = np.array([g[0] for g in gps if lo <= g[0] <= hi], float)
    return t if t.size == n_punkte else None


def echt_maske(s: models.Session, t: np.ndarray) -> np.ndarray:
    """Je Rasterpunkt (Session-ms): liegt ein ECHTER Beschleunigungswert naeher als zwei Abtastschritte
    (mind. 250 ms)? Dieselbe Regel wie `accel_echt` in run_analysis — wo Daten fehlen, gibt es weder
    Pump noch Gleiten."""
    from types import SimpleNamespace
    from ..analysis.timebase import build_timebase_for_session
    tb = build_timebase_for_session(SimpleNamespace(
        session_uuid=s.session_uuid, accel_scale=s.accel_scale, accel_hz=s.accel_hz,
        trim_start_ms=None, trim_end_ms=None, excluded_ranges=None, fremdkraft_keep=None))
    src = np.asarray(tb.t_accel_ms, float)
    if src.size < 2:
        return np.zeros(t.size, bool)
    hz = float(tb.accel_hz or 0) or 1000.0 / max(float(np.median(np.diff(src))), 1.0)
    i = np.clip(np.searchsorted(src, t), 1, src.size - 1)
    abstand = np.minimum(np.abs(src[i] - t), np.abs(src[i - 1] - t))
    return abstand <= max(2000.0 / hz, 250.0)


def ueberlagern(db, s: models.Session, out) -> bool:
    """`out` (SessionOut mit Analyse) nach den Brett-Regeln umschreiben. False = nichts gemacht."""
    from ..analysis import brett_regeln as BR
    from .sessions import _lage_antwort
    a = out.analysis
    if a is None or not a.segments or s.placement != "board":
        return False
    if any("t_start_session_ms" not in g or "t_end_session_ms" not in g for g in a.segments):
        return False
    segs = copy.deepcopy(a.segments)
    laeufe = [(float(g["t_start_session_ms"]), float(g["t_end_session_ms"])) for g in segs]
    # Dieselbe Spanne wie scripts/v3/brett_regeln_vergleich.py: der Bandpass laeuft per FFT ueber das
    # ganze Stueck, eine andere Laenge verschiebt die Gipfel knapp an der Schwelle (gemessen: 152 statt
    # 159 Pumps an #12610). Vorschau und Tabelle sollen dieselben Zahlen zeigen.
    dauer = ((s.ended_at - s.started_at).total_seconds() * 1000 if s.ended_at and s.started_at
             else laeufe[-1][1] + 10000)
    r = _lage_antwort(db, s, from_ms=0, to_ms=int(dauer), pad_s=0.0, hz=BR.HZ)
    if not r.get("ok") or not r.get("hub_cm"):
        return False
    t = np.asarray(r["t_ms"], float)
    gps = np.asarray(storage.load_gps(s.session_uuid), float)
    _, lauf = BR.je_lauf(t, r["hub_cm"], r["pitch_deg"], gps, laeufe, echt=echt_maske(s, t))
    coords = (a.track_geojson or {}).get("geometry", {}).get("coordinates") or []
    tz = _track_zeiten(s, len(coords))

    def idx(ms: float, g: dict) -> int:
        if tz is not None:
            return int(np.clip(np.searchsorted(tz, ms), 0, tz.size - 1))
        # Rueckfall: linear im Lauf zwischen i_start und i_end
        a0, b0 = float(g["t_start_session_ms"]), float(g["t_end_session_ms"])
        f = (ms - a0) / (b0 - a0) if b0 > a0 else 0.0
        return int(round(g["i_start"] + f * (g["i_end"] - g["i_start"])))

    off = float(s.trim_start_ms or 0)
    for g, k in zip(segs, lauf):
        if not k.get("ok"):
            g["brett_regel"] = "zu_wenig_zyklen"
            continue
        td = float(k["aufsetzen_ms"])
        if td < float(g["t_end_session_ms"]):
            g["t_end_session_ms"] = td
            g["t_end_ms"] = td - off
            g["i_end"] = idx(td, g)
            g["duration_s"] = round((td - float(g["t_start_session_ms"])) / 1000.0, 1)
        dur = g.get("duration_s") or 0.0
        g["pumps"] = k["pumps"]
        g["pump_idx"] = [idx(ms, g) for ms in k["pump_ms"]]
        g["avg_pump_hz"] = round(k["pumps"] / dur, 3) if dur > 0 and k["pumps"] >= 2 else None
        g["pumps_per_min"] = round(k["pumps"] / (dur / 60.0), 1) if dur > 0 and k["pumps"] else None
        g["dist_per_pump_m"] = round(g["distance_m"] / k["pumps"], 1) if k["pumps"] and g.get("distance_m") else None
        g["t_to_first_pump_s"] = (round((k["pump_ms"][0] - float(g["t_start_session_ms"])) / 1000.0, 1)
                                  if k["pump_ms"] else None)
        # gleit_phasen_ms ist schon nach der Anzeige-Regel gefiltert (1,5-15 s, kein Anlauf, keine Luecke)
        ph = [(x, y, (y - x) / 1000.0) for x, y in k["gleit_phasen_ms"] if y > x]
        g["glides"] = [[idx(x, g), idx(y, g), round(d, 1), int(round(x))] for x, y, d in ph]
        g["num_glides"] = len(g["glides"])
        lang = [d for _, _, d in ph]
        g["avg_glide_s"] = round(float(np.mean(lang)), 2) if lang else 0.0
        g["longest_glide_s"] = round(max(lang), 2) if lang else 0.0
        g["gleit_s"] = k["gleit_s"]
        g["pump_s"] = k["pump_s"]
        g["aufsetzen_quelle"] = k["aufsetzen_quelle"]
        g["brett_regel"] = BR.REGEL_VERSION
    a.segments = segs
    a.foiling_time_s = round(sum(float(g.get("duration_s") or 0) for g in segs), 1)
    a.pump_count = int(sum(int(g.get("pumps") or 0) for g in segs))
    a.avg_cadence_hz = round(a.pump_count / a.foiling_time_s, 3) if a.foiling_time_s else None
    if a.metrics is not None:
        a.metrics = {**a.metrics, "avg_pump_hz": a.avg_cadence_hz, "brett_regel": BR.REGEL_VERSION,
                     "gleit_s": round(sum(float(g.get("gleit_s") or 0) for g in segs), 1)}
    return True
