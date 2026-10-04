"""Erkennung v3 LIVE: Nachbearbeitung der v2-Laeufe mit dem Erkennungsmodell (Jans OK 30.09.2026).

Was hier passiert (Begruendung und Messungen: docs/DETECTION-V3.md, Regressionstest ueber 2743
Sessions, Nerd-Analysen Teil 5):

1. Ausgang GROSSZUEGIG: die v2-Laeufe mit der Empfindlichkeit des Besitzers UND die Laeufe einer
   v2-Rechnung fast ohne Tempo-Grenzen (TIEF_KW), vereinigt.
2. Stufe A (Modell r4, zweistufig mit r3 als Haltungs-Referenz) gibt je Sekunde p(auf dem Foil).
3. teil: jeden Kandidaten in die Stuecke mit p >= theta zerlegen (Loecher <= 3 s geschlossen).
4. veto: Stuecke mit mittlerem p < tau fallen weg.
5. kurz (mild): Stuecke unter 8 s brauchen ein klar hohes UNGEGLAETTETES p.
   theta/tau/kurz je Profil-Empfindlichkeit — die Einstellung stellt jetzt die Modell-Schwellen.
6. Ein Stueck, das sich mit einem v2-Lauf deckt, behaelt dessen Werte exakt; neue Stuecke bekommen
   ihre Felder wie v2 (`gps._seg_fields`) und dieselbe Plausibilitaets-Schranke.
7. Ganz NEUE Stuecke (kein v2-Lauf beruehrt sie) muessen die Grenzen der Profil-Empfindlichkeit
   erfuellen — Mindestdauer und Mindest-Schnitt, gemessen am Stueck NACH dem Modell (`nach_empfindlichkeit`).

Kandidaten seit v3-r4-mild-2 (03.10.2026, Befund #12632): `tief` OHNE das alte On-Foil-Modell
(`use_model=False`, reine GPS-Heuristik). Vorher lief auch `tief` durch `foil_rf.pkl` — wo das alte
Modell nein sagte, sah das neue die Stelle nie (ein Lauf brauchte damit das Ja BEIDER Modelle).
Regression ueber 2802 Sessions: scripts/v3/regression-kandidaten.py, docs/DETECTION-V3.md.

Lauf-Status manuell/auto (Jan, 29.09.: „bei 'manuell' nicht wieder ueberschreiben"):
- Vom Nutzer AUSSORTIERT (`excluded_ranges`): die GPS-Punkte fehlen schon vor jeder Rechnung.
- Vom Nutzer ZURUECKGEHOLT (`fremdkraft_keep`): v2-Laeufe, die ein solches Fenster beruehren,
  bleiben unangetastet — kein Zerlegen, kein Veto.
- AUTO aussortiert: jeder v2-Lauf, den v3 wegnimmt, steht mit Grund und Modellfassung in
  `metrics.fremdkraft_laeufe` (`quelle = "v3"`) — dieselbe Liste, dieselbe Ein-Tipp-Rueckholung
  wie bei der Fremdkraft, auf allen Plattformen. Nach einem Modell-Update werden nur diese
  Auto-Urteile neu gerechnet; zurueckgeholte Laeufe bleiben zurueckgeholt.

Nur in der FINALEN Analyse (die Zwischenanalyse waehrend des Uploads bleibt v2) und nur fuer
Modell-Sessions am Handgelenk. Jeder Fehler hier faellt still auf das v2-Ergebnis zurueck — die
Analyse darf daran nie scheitern.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

VERSION = "v3-r4-mild-2"
# Die Live-Modelle liegen IM REPO neben dem Code (wie `foil_rf.pkl`), nicht unter data/ (Jan, 30.09.:
# „bitte ins repo committen, nicht dass das verloren geht"). Sie enthalten nur Baeume und
# Bin-Grenzen, keine Sessions. Neue Fassung: unter neuem Namen trainieren, pruefen, HIER ablegen,
# VERSION hochzaehlen.
MODELLE = Path(__file__).resolve().parent / "modelle"
MODELL, REF = MODELLE / "stufe_a_r4.pkl", MODELLE / "stufe_a_r3.pkl"
TIEF_KW = {"enter_speed": 1.4, "exit_speed": 1.1, "min_segment_s": 3, "min_seg_avg_speed": 1.4,
           "use_model": False}
# (theta fuer `teil`, tau fuer das Veto) und die Schwelle fuer kurze Stuecke, je Empfindlichkeit
TEIL = {"normal": (0.4, 0.5), "light": (0.3, 0.4), "attempts": (0.25, 0.3)}
KURZ = {"normal": 0.8, "light": 0.7, "attempts": 0.6}
KURZ_S, LUECKE_S, MIN_S, GLAETTEN_S = 8, 3, 3, 5


def detector_v3_enabled() -> bool:
    """Schalter aus der Umgebung (server/.env). Default AUS."""
    return os.environ.get("DETECTOR_V3", "").strip().lower() in ("1", "true", "yes", "on")


def _glaetten(p: np.ndarray, k: int = GLAETTEN_S) -> np.ndarray:
    if p.size < k:
        return p
    return np.convolve(np.pad(p, (k // 2, k - 1 - k // 2), mode="edge"), np.ones(k) / k, mode="valid")


def _vereinigung(L1, L2):
    out = []
    for a, b in sorted(list(L1) + list(L2)):
        if out and a <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return out


def _teil(L, t, pg, theta):
    out = []
    for a, b in L:
        idx = np.flatnonzero((t >= a) & (t <= b))
        if idx.size == 0:
            continue
        gut = pg[idx] >= theta
        i = 0
        while i < gut.size:                      # kurze Loecher schliessen
            if not gut[i]:
                j = i
                while j + 1 < gut.size and not gut[j + 1]:
                    j += 1
                if i > 0 and j + 1 < gut.size and (t[idx[j + 1]] - t[idx[i - 1]]) / 1000 <= LUECKE_S + 1:
                    gut[i:j + 1] = True
                i = j + 1
            else:
                i += 1
        i = 0
        while i < gut.size:
            if gut[i]:
                j = i
                while j + 1 < gut.size and gut[j + 1]:
                    j += 1
                x, y = t[idx[i]], t[idx[j]]
                if y - x >= MIN_S * 1000:
                    out.append((float(x), float(y)))
                i = j + 1
            else:
                i += 1
    return out


def _mittel(t, p, a, b):
    m = (t >= a) & (t <= b)
    return float(p[m].mean()) if m.any() else None


def laeufe(tb, v2_segmente, tief_segmente, sens: str, keep=None):
    """Kern (rein, testbar): -> (Lauf-Intervalle in Session-ms, unberuehrte v2-Laeufe, p je GPS-Sample).
    Mit `keep` beruehrte v2-Laeufe werden unveraendert durchgereicht."""
    from . import stufe_a
    p_ref = stufe_a.wahrscheinlichkeit(tb, REF)
    p = stufe_a.wahrscheinlichkeit(tb, MODELL, p_ref=p_ref)
    if p is None:
        return None
    t = tb.t_gps_ms.astype(float)
    pg = _glaetten(p)
    iv = lambda s: (float(s["t_start_session_ms"]), float(s["t_end_session_ms"]))  # noqa: E731
    geschuetzt = [s for s in v2_segmente
                  if keep and any(ka < iv(s)[1] and kb > iv(s)[0] for ka, kb in keep)]
    frei_v2 = [iv(s) for s in v2_segmente if s not in geschuetzt]
    frei_tief = [iv(s) for s in tief_segmente
                 if not any(iv(s)[0] < iv(g)[1] and iv(s)[1] > iv(g)[0] for g in geschuetzt)]
    theta, tau = TEIL.get(sens, TEIL["normal"])
    L = _teil(_vereinigung(frei_v2, frei_tief), t, pg, theta)
    L = [(a, b) for a, b in L if (_mittel(t, pg, a, b) or 0) >= tau]
    k = KURZ.get(sens, KURZ["normal"])
    L = [(a, b) for a, b in L if b - a >= KURZ_S * 1000 or (_mittel(t, p, a, b) or 0) >= k]
    return L, geschuetzt, (t, p)


def _segmente(L, v2_segmente, session, off):
    """Intervalle -> Segment-Dicts (v2-Werte, wo deckungsgleich; sonst wie v2 gerechnet + Schranke)."""
    from ... import storage
    from .. import gps as v1
    from ..detect_v2 import _clean_speed
    from ..gps import step_distances_m
    alt = [(float(s["t_start_session_ms"]), float(s["t_end_session_ms"]), s) for s in v2_segmente]
    g = storage.load_gps(session.session_uuid)
    t = np.array([float(x[0]) for x in g])
    lat = np.array([float(x[1]) for x in g]); lon = np.array([float(x[2]) for x in g])
    lat, lon = v1._fill_invalid_coords(lat, lon)
    lat, lon = v1._repair_spikes(lat, lon)
    step = step_distances_m(lat, lon)
    step = np.where(step > v1.OUTLIER_STEP_M, 0.0, step)
    hz = session.gps_hz or 1
    dt = np.diff(t, prepend=t[0]) / 1000.0
    dt = np.where(dt <= 0, 1.0 / max(hz, 1), dt)
    roh = np.array([float(x[3]) if len(x) > 3 and x[3] is not None else np.nan for x in g])
    speed = _clean_speed(np.where(np.isnan(roh), step / dt, roh), hz)
    win = max(int(round(v1.SMOOTH_WINDOW_S * hz)), 1)
    speeds = {"1": speed, "3": v1._running_median(speed, win),
              "5": v1._running_median(speed, max(int(round(5 * hz)), 1))}
    gleich, neu = [], []
    for a, b in L:
        treffer = [s for x, y, s in alt if abs(x - a) <= 1000 and abs(y - b) <= 1000]
        if treffer:
            gleich.append(treffer[0]); continue
        i = np.flatnonzero((t >= a) & (t <= b))
        if i.size < 2:
            continue
        seg = v1._seg_fields(int(i[0]), int(i[-1]) + 1, t, step, speeds)
        seg["t_start_session_ms"], seg["t_end_session_ms"] = int(seg["t_start_ms"]), int(seg["t_end_ms"])
        seg["t_start_ms"] -= off
        seg["t_end_ms"] -= off
        # i_start/i_end sind bei v2 Indizes in den ZUGESCHNITTENEN GPS-Punkten; neu hier auf
        # derselben Basis bestimmen (Zeit ab dem Zuschnitt), sonst zeigen Karten-Marker daneben.
        seg["i_start"], seg["i_end"] = _index_im_zuschnitt(session, seg)
        # Start-/Endpunkt fuer die Karten-Marker wie bei v2 ([lon, lat])
        seg["start_pt"] = [round(float(lon[i[0]]), 6), round(float(lat[i[0]]), 6)]
        seg["end_pt"] = [round(float(lon[i[-1]]), 6), round(float(lat[i[-1]]), 6)]
        seg["v3"] = VERSION
        neu.append(seg)
    neu, _ = v1._gate_implausible_runs(neu)
    return sorted(gleich + neu, key=lambda s: s["t_start_session_ms"])


def _index_im_zuschnitt(session, seg):
    """i_start/i_end wie v2 sie liefert: Index in den GPS-Punkten NACH Zuschnitt und Ausschluss."""
    from ... import storage
    from .. import analyse_ausschluss
    g = storage.load_gps(session.session_uuid)
    ts0, ts1 = session.trim_start_ms, session.trim_end_ms
    lo = ts0 if ts0 is not None else 0
    hi = ts1 if ts1 is not None else (g[-1][0] if g else 0)
    excl = analyse_ausschluss(session)
    tt = [x[0] for x in g if lo <= x[0] <= hi and not any(a <= x[0] <= b for a, b in excl)]
    tt = np.asarray(tt, float)
    a = int(np.searchsorted(tt, seg["t_start_session_ms"]))
    b = int(np.searchsorted(tt, seg["t_end_session_ms"], side="right")) - 1
    return max(a, 0), max(min(b, tt.size - 1), 0)


def nach_empfindlichkeit(segs: list, v2_segmente: list, sens: str, geschuetzt=()) -> list:
    """Rein: ganz neue Stuecke (keinen v2-Lauf beruehrend) unter den Grenzen der Empfindlichkeit
    fallen weg. Gemessen wird das Stueck NACH dem Modell — kuerzer als die GPS-Linie des
    Startversuchs (Jan, 03.10.2026). v2-Laeufe und vom Nutzer Zurueckgeholtes bleiben unangetastet."""
    from ..gps import SENSITIVITY_PRESETS
    g = SENSITIVITY_PRESETS.get(sens) or SENSITIVITY_PRESETS["normal"]
    alt = [(float(s["t_start_session_ms"]), float(s["t_end_session_ms"])) for s in v2_segmente]
    out = []
    for x in segs:
        a, b = float(x["t_start_session_ms"]), float(x["t_end_session_ms"])
        if x in geschuetzt or not x.get("v3") or any(a < y and b > w for w, y in alt):
            out.append(x)
        elif (float(x.get("duration_s") or 0) >= g["min_segment_s"]
              and float(x.get("avg_speed_mps") or 0) >= g["min_seg_avg_speed"]):
            out.append(x)
    return out


def anwenden(res: dict, session, judge: bool, sens: str) -> dict:
    """v2-Ergebnis -> v3-Ergebnis (gleiches Format). Bei jedem Fehler: v2 unveraendert zurueck."""
    try:
        return _anwenden(res, session, judge, sens)
    except Exception:
        log.exception("v3-Nachbearbeitung fehlgeschlagen fuer Session %s — v2-Ergebnis bleibt", session.id)
        res.setdefault("metrics", {})["v3"] = {"version": VERSION, "fehler": True}
        return res


def _anwenden(res, session, judge, sens):
    import json
    from ..detect_v2 import analyze_session_v2
    from ..timebase import build_timebase_for_session
    from . import merkmale as M
    if not MODELL.exists() or not REF.exists():
        log.warning("v3: Modelle fehlen unter %s — v2-Ergebnis bleibt", MODELLE)
        return res
    v2 = res["segments"]
    keep = []
    try:
        for item in (json.loads(session.fremdkraft_keep) if session.fremdkraft_keep else []):
            keep.append((int(item[0]), int(item[1])))
    except (ValueError, TypeError, IndexError):
        keep = []
    tief = analyze_session_v2(session, judge_fremdkraft=judge, **TIEF_KW)["segments"]
    tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": session.session_uuid, "accel_hz": session.accel_hz,
                                                     "accel_scale": session.accel_scale}))
    out = laeufe(tb, v2, tief, sens, keep)
    if out is None:
        return res
    L, geschuetzt, (tp, p) = out
    off = (int(v2[0]["t_start_session_ms"]) - int(v2[0]["t_start_ms"])) if v2 else int(session.trim_start_ms or 0)
    segs = nach_empfindlichkeit(_segmente(L, v2, session, off), v2, sens, geschuetzt)
    for g in geschuetzt:                       # vom Nutzer zurueckgeholt: unveraendert
        if g not in segs:
            segs.append(g)
    segs.sort(key=lambda s: s["t_start_session_ms"])
    # Auto aussortiert: v2-Laeufe, von denen v3 weniger als die Haelfte behaelt
    verworfen = []
    for s in v2:
        a, b = float(s["t_start_session_ms"]), float(s["t_end_session_ms"])
        bleibt = sum(max(0.0, min(b, float(x["t_end_session_ms"])) - max(a, float(x["t_start_session_ms"]))) for x in segs)
        if bleibt < 0.5 * max(b - a, 1.0):
            pm = _mittel(tp, p, a, b)
            verworfen.append({
                "t_start_ms": int(a), "t_end_ms": int(b),
                "dauer_s": round(float(s.get("duration_s") or 0), 1),
                "kmh": round(float((s.get("avg_speed_mps") or 0) * 3.6), 1),
                "quelle": "v3", "modell": VERSION,
                "v3_p": None if pm is None else round(pm, 2),
                "grund": (f"{(s.get('duration_s') or 0):.0f} s bei {(s.get('avg_speed_mps') or 0) * 3.6:.1f} km/h — "
                          f"das Erkennungsmodell sieht hier kein Foilen (p {pm:.2f})" if pm is not None else
                          "das Erkennungsmodell sieht hier kein Foilen"),
            })
    res["segments"] = segs
    res["foiling_time_s"] = round(sum(s["t_end_ms"] - s["t_start_ms"] for s in segs) / 1000.0, 1)
    res["foiling_distance_m"] = round(float(sum(s.get("distance_m") or 0 for s in segs)), 1)
    res["max_speed_mps"] = round(max((float(s.get("max_speed_mps") or 0) for s in segs), default=0.0), 2)
    m = res.setdefault("metrics", {})
    m["num_segments"] = len(segs)
    m["longest_segment_s"] = round(max((s["duration_s"] for s in segs), default=0.0), 1)
    m["farthest_segment_m"] = round(max((s["distance_m"] for s in segs), default=0.0), 1)
    m["fremdkraft_laeufe"] = list(m.get("fremdkraft_laeufe") or []) + verworfen
    m["v3"] = {"version": VERSION, "laeufe_v2": len(v2), "laeufe_v3": len(segs), "verworfen": len(verworfen),
               "neu": sum(1 for s in segs if s.get("v3")), "empfindlichkeit": sens}
    return res
