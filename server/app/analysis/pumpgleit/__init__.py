"""Pump- und Gleit-Erkennung am Handgelenk, Fassung pg-1 — NUR fuer die Admin-Vorschau (`?pumpgleit=1`).

Nicht in `run_analysis` eingebaut: die Live-Pipeline bleibt, wie sie ist. Herkunft und Messung:
docs/PUMP-GLEIT.md (Brett-Wahrheit von 5 Fahrern, Fahrer herausgehalten; Skripte unter scripts/pumpgleit/).

Je gespeichertem Lauf (Grenzen bleiben unveraendert), Zone = Lauf + 5 s Puffer (am naechsten Lauf gekappt):
  1. Pumps: heutige Kandidaten (find_pumps_cadence) durch den Takt-Filter (Doppel weg, Luecken im Takt fuellen),
     vereinigt mit dem adaptiven Takt-Verfolger (Pumps > 250 ms neben jedem Filter-Pump).
  2. Gleit-Zustand je 0,25 s: Gradient Boosting (7 Blaetter) auf fahrerunabhaengigen Merkmalen ohne
     Position im Lauf, ueberlappende 5-s-Fenster abgestimmt, HMM mit Mindest-/Mitteldauern geglaettet.
  3. Pumps im Zustand gleiten fallen nur weg, wenn ihr Gipfel < 0,4 x Median-Gipfel des Laufs ist.
  4. Gleitphasen = Zustand gleiten, an Pumps geteilt, 1,5-15 s, nach dem ersten Pump, bis zum Aufsetzen.
  5. „genauer hinschauen": Gleitphasen >= HIN_MIN_S, in denen das GPS-Tempo praktisch nicht faellt
     (Steigung > HIN_STEIGUNG m/s je s) — Welle, Fremdkraft oder verpasste Pumps. Zaehlen NICHT als Gleiten.
Nur Sportarten mit Pumpen ohne Fremdantrieb im Lauf-Sinn (SPORTARTEN); Wind/Parawing/Rest: keine Aussage.
"""
from __future__ import annotations

import json
import pickle
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import merkmale as M
from . import takt as TK

VERSION = "pg-1"
SPORTARTEN = ("pumpfoil", "efoil", "foildrive")
MODELL = Path(__file__).resolve().parent / "modelle" / "beste.pkl"
PUFFER_S = 5.0
GLEIT_MIN_S, GLEIT_MAX_S = 1.5, 15.0
HIN_MIN_S = 10.0
HIN_STEIGUNG = -0.02


@lru_cache(maxsize=1)
def laden() -> dict:
    with open(MODELL, "rb") as f:
        return pickle.load(f)


def uhr_daten(s) -> dict | None:
    """Accel auf dem Raster von Stufe 11 (Zuschnitt-Fenster, timebase.py, echte Messwerte) + GPS. Zeiten Session-ms."""
    from ... import storage
    from ..timebase import _accel_chunk_counts, build_timebase
    gps = storage.load_gps(s.session_uuid)
    accel = storage.load_accel(s.session_uuid)
    if accel.shape[0] == 0 or not gps:
        return None
    lo = s.trim_start_ms if s.trim_start_ms is not None else 0
    hi = s.trim_end_ms if s.trim_end_ms is not None else gps[-1][0]
    tb = build_timebase(gps, accel, s.accel_scale, s.accel_hz,
                        chunk_counts=_accel_chunk_counts(s.session_uuid),
                        t0_by_index=storage.load_accel_t0(s.session_uuid),
                        trim_start_ms=lo, trim_end_ms=hi, excluded_ranges=None,
                        accel_luecken=storage.accel_luecken(s.session_uuid),
                        t1_by_index=storage.load_accel_t1(s.session_uuid))
    if not (tb.has_accel and tb.accel_hz and tb.accel_hz > 0):
        return None
    fs = round(float(tb.accel_hz), 3)
    src = tb.t_accel_ms - float(lo)
    n = int(max(hi - lo, 0) / 1000.0 * fs) + 1
    grid = np.arange(n) / fs * 1000.0
    pick = np.clip(np.searchsorted(src, grid), 0, src.size - 1)
    links = src[np.clip(pick - 1, 0, src.size - 1)]
    abst = np.minimum(np.abs(src[pick] - grid), np.abs(links - grid))
    return {"fs": fs, "lo": float(lo), "t": grid + float(lo),
            "acc": tb.accel[pick].astype(np.float32) / float(s.accel_scale or 2048),
            "echt": abst <= max(2000.0 / fs, 250.0),
            "gps": np.asarray([[g[0], g[1], g[2], (g[3] if g[3] is not None else np.nan)] for g in gps], float),
            "gyro": None}


# ------------------------------------------------------------------ Ableitung

def _stuecke(maske):
    d = np.diff(np.concatenate([[0], maske.astype(np.int8), [0]]))
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


def _vereinigen(abl1, abl2, abstand_ms=250.0):
    out = []
    for a1, a2 in zip(abl1, abl2):
        p1, p2 = np.asarray(a1["pump_ms"]), np.asarray(a2["pump_ms"])
        if p1.size and p2.size:
            d = np.min(np.abs(p2[:, None] - p1[None, :]), axis=1)
            p = np.sort(np.concatenate([p1, p2[d > abstand_ms]]))
        else:
            p = p1 if p1.size else p2
        out.append({**a1, "pump_ms": list(p)})
    return out


def _schwach_streichen(abl, tw, zust, S, frac):
    t, v = S["t"], S["v"]
    out = []
    for a in abl:
        ps = np.asarray(a["pump_ms"])
        if ps.size == 0 or tw.size == 0:
            out.append(a); continue
        amp = v[np.clip(np.searchsorted(t, ps), 0, t.size - 1)]
        j = np.clip(np.searchsorted(tw, ps - 125), 0, tw.size - 1)
        weg = (zust[j] == 1) & (amp < frac * float(np.median(amp)))
        out.append({**a, "pump_ms": list(ps[~weg])})
    return out


def _gleit_aus_zustand(tw, zust, laeufe, abl):
    out = []
    for (a, b, bp), ap in zip(M.zone(laeufe, PUFFER_S), abl):
        m = (tw >= a) & (tw < bp)
        tz, zz = tw[m], zust[m]
        pumps = np.asarray(ap["pump_ms"])
        gl = []
        if pumps.size and tz.size:
            for s0, s1 in _stuecke((zz == 1) & (tz < ap["ende"]) & (tz > pumps[0])):
                x0, x1 = tz[s0] - 125, min(tz[s1 - 1] + 125, ap["ende"])
                gr = [x0] + [x for x in pumps if x0 < x < x1] + [x1]
                for y0, y1 in zip(gr[:-1], gr[1:]):
                    if GLEIT_MIN_S <= (y1 - y0) / 1000.0 <= GLEIT_MAX_S:
                        gl.append((float(y0), float(y1)))
        out.append({**ap, "gleit": gl})
    return out


def _hinschauen(abl, gps):
    out = []
    for a in abl:
        gl, hin = [], []
        for x0, x1 in a["gleit"]:
            m = (gps[:, 0] >= x0) & (gps[:, 0] <= x1) & np.isfinite(gps[:, 3])
            if ((x1 - x0) / 1000.0 >= HIN_MIN_S and m.sum() >= 3
                    and np.polyfit(gps[m, 0] / 1000.0, gps[m, 3], 1)[0] > HIN_STEIGUNG):
                hin.append((x0, x1))
            else:
                gl.append((x0, x1))
        out.append({**a, "gleit": gl, "hinschauen": hin,
                    "longest": round(max([(y - x) / 1000.0 for x, y in gl], default=0.0), 2)})
    return out


def ableiten(U: dict, laeufe: list[tuple[float, float]], mod: dict | None = None) -> list[dict]:
    """Eingang: Uhr-Daten (`uhr_daten`), Laeufe [(Start, Ende) Session-ms]. Ausgang je Lauf:
    {pump_ms, gleit [(Start, Ende)], hinschauen [(Start, Ende)], ende, longest} — Zeiten in Session-ms."""
    mod = mod or laden()
    S = M.signale(U)
    tw, X, _, _ = M.merkmale(S, laeufe, PUFFER_S)
    if X.shape[0] == 0:
        return [{"pump_ms": [], "gleit": [], "hinschauen": [], "ende": b, "longest": 0.0} for _, b in laeufe]
    p = mod["clf"].predict_proba(X[:, mod["sp"]])
    p5 = TK.abstimmen_5s(tw, p)
    p5[:, 1] *= (1 - mod["theta"]) / mod["theta"]
    p5 = p5 / p5.sum(1, keepdims=True)
    z = TK.hsmm_glaetten(p5, mod["prior"])
    takt = TK.physik_filter(S, laeufe, mod["takt"], PUFFER_S, U["gps"])
    pll = TK.physik(S, laeufe, mod["pll"], PUFFER_S, U["gps"])
    abl = _gleit_aus_zustand(tw, z, laeufe, _schwach_streichen(_vereinigen(takt, pll), tw, z, S, mod["schwach"]))
    return _hinschauen(abl, U["gps"])


def zustaendig(s, result) -> bool:
    """Rechnet pg-1 fuer diese Session? Modell-Erkennung, Accel, Sportart, nicht am Brett."""
    return (result is not None and getattr(result, "detection", None) == "model"
            and (s.sport_class or "pumpfoil") in SPORTARTEN and (s.placement or "") != "board")


def track_zeiten(s, n_punkte: int) -> np.ndarray | None:
    """Zuschnitt-ms je Punkt der gespeicherten Spur (wie run_analysis: Zuschnitt + Ausschluss), sonst None."""
    from ... import storage
    from .. import analyse_ausschluss
    gps = storage.load_gps(s.session_uuid)
    if not gps:
        return None
    ts0, ts1 = s.trim_start_ms, s.trim_end_ms
    lo = ts0 if ts0 is not None else 0
    hi = ts1 if ts1 is not None else gps[-1][0]
    g = [x[0] - lo for x in gps if lo <= x[0] <= hi] if (ts0 is not None or ts1 is not None) else [x[0] for x in gps]
    excl = analyse_ausschluss(s)
    if excl:
        off = lo if (ts0 is not None or ts1 is not None) else 0
        w = [(a - off, b - off) for a, b in excl]
        g = [t for t in g if not any(a <= t <= b for a, b in w)]
    t = np.asarray(g, float)
    return t if t.size == n_punkte else None


def segmente_ueberlagern(s, segmente: list[dict], n_track: int) -> dict | None:
    """Segmente (Kopien) mit pg-1-Pumps/Gleitphasen; None = keine Aussage. Laufgrenzen unveraendert."""
    import copy
    segs = copy.deepcopy(segmente)
    alle = [i for i, g in enumerate(segs) if "t_start_session_ms" in g]
    if not any(segs[i].get("pumps") is not None for i in alle):
        return None
    U = uhr_daten(s)
    if U is None:
        return None
    laeufe = [(float(segs[i]["t_start_session_ms"]), float(segs[i]["t_end_session_ms"])) for i in alle]
    abl = ableiten(U, laeufe)
    nutz_abl = [(i, a) for i, a in zip(alle, abl) if segs[i].get("pumps") is not None]   # Laeufe ohne Accel bleiben
    tz = track_zeiten(s, n_track)
    off = float(s.trim_start_ms or 0)

    def idx(ms: float, g: dict) -> int:
        if tz is not None:
            return int(np.clip(np.searchsorted(tz, ms - off), 0, tz.size - 1))
        a0, b0 = float(g["t_start_session_ms"]), float(g["t_end_session_ms"])
        f = (ms - a0) / (b0 - a0) if b0 > a0 else 0.0
        return int(round(g["i_start"] + min(max(f, 0.0), 1.0) * (g["i_end"] - g["i_start"])))

    hin_alle = []
    for i, a in nutz_abl:
        g = segs[i]
        dur = float(g.get("duration_s") or 0.0)
        a0, b0 = float(g["t_start_session_ms"]), float(g["t_end_session_ms"])
        pumps = [x for x in a["pump_ms"] if a0 <= x <= b0]      # Pumps im Lauf (Puffer nur fuer Gleiten/Ende)
        g["pumps_vorher"] = g.get("pumps")
        g["pumps"] = len(pumps)
        g["pump_idx"] = [idx(x, g) for x in pumps]
        g["avg_pump_hz"] = round(len(pumps) / dur, 3) if dur > 0 and len(pumps) >= 2 else None
        g["pumps_per_min"] = round(len(pumps) / (dur / 60.0), 1) if dur > 0 and pumps else None
        g["dist_per_pump_m"] = round(g["distance_m"] / len(pumps), 1) if pumps and g.get("distance_m") else None
        g["t_to_first_pump_s"] = round((pumps[0] - a0) / 1000.0, 1) if pumps else None
        g["glides_vorher"] = g.get("glides")
        g["glides"] = [[idx(x, g), idx(y, g), round((y - x) / 1000.0, 1), int(round(x))] for x, y in a["gleit"]]
        lang = [(y - x) / 1000.0 for x, y in a["gleit"]]
        g["num_glides"] = len(lang)
        g["avg_glide_s"] = round(float(np.mean(lang)), 2) if lang else 0.0
        g["longest_glide_s_vorher"] = g.get("longest_glide_s")
        g["longest_glide_s"] = a["longest"]
        g["hinschauen"] = [[int(round(x)), round((y - x) / 1000.0, 1)] for x, y in a["hinschauen"]]
        g["pumpgleit"] = VERSION
        hin_alle += [{"lauf": i, "start_ms": int(round(x)), "dauer_s": round((y - x) / 1000.0, 1)} for x, y in a["hinschauen"]]
    pc = int(sum(int(g.get("pumps") or 0) for g in segs))
    best = max(((float(g.get("longest_glide_s") or 0.0), j) for j, g in enumerate(segs)), default=(0.0, None))
    return {"segments": segs, "pump_count": pc, "best_glide_s": best[0], "best_glide_idx": best[1],
            "hinschauen": hin_alle,
            "gleit_s": round(sum(sum(x[2] for x in (g.get("glides") or [])) for g in segs), 1)}


# ------------------------------------------------------------------ Speichern (Weg B, live)

PG_FELDER = ("pumps", "pump_idx", "avg_pump_hz", "pumps_per_min", "dist_per_pump_m", "t_to_first_pump_s",
             "glides", "num_glides", "avg_glide_s", "longest_glide_s")


def _leeren(result) -> None:
    result.pg_version = None
    result.pg_pump_count = None
    result.pg_avg_cadence_hz = None
    result.pg_best_glide_s = None
    result.pg_best_glide_idx = None
    if result.metrics_json:
        try:
            m = json.loads(result.metrics_json)
        except ValueError:
            m = None
        if isinstance(m, dict) and "pumpgleit" in m:
            m.pop("pumpgleit")
            result.metrics_json = json.dumps(m)


def stufe(s, result, rechnen: bool = True) -> bool:
    """pg-1 ZUSAETZLICH speichern: analysis_results.pg_*, je Lauf `pg_<feld>` + `pg_hinschauen` in segments_json,
    metrics_json.pumpgleit. Die bisherigen Felder bleiben unveraendert. Nicht zustaendig (oder `rechnen` False,
    z. B. Zwischenanalyse): pg-Felder geleert. Gibt True zurueck, wenn etwas zu speichern ist (immer, ausser
    es gibt kein Ergebnis). Wirft bei Rechenfehlern — der Aufrufer faengt ab."""
    if result is None:
        return False
    if not rechnen or not zustaendig(s, result) or not result.segments_json:
        _leeren(result)
        return True
    segs = json.loads(result.segments_json)
    # Alte pg-Schluessel aus einem frueheren Lauf entfernen (der Nachtrag kann wiederholt laufen)
    for g in segs:
        for k in [k for k in g if k.startswith("pg_")]:
            g.pop(k)
    track = (json.loads(result.track_geojson or "{}").get("geometry") or {}).get("coordinates") or []
    erg = segmente_ueberlagern(s, segs, len(track))
    if erg is None:
        _leeren(result)
        return True
    for g, n in zip(segs, erg["segments"]):
        if n.get("pumpgleit") != VERSION:
            continue
        for k in PG_FELDER:
            g["pg_" + k] = n.get(k)
        g["pg_hinschauen"] = n.get("hinschauen") or []
    result.segments_json = json.dumps(segs)
    ft = float(result.foiling_time_s or 0.0)
    result.pg_version = VERSION
    result.pg_pump_count = int(erg["pump_count"])
    result.pg_avg_cadence_hz = round(erg["pump_count"] / ft, 3) if ft > 0 else None
    result.pg_best_glide_s = float(erg["best_glide_s"])
    result.pg_best_glide_idx = erg["best_glide_idx"]
    m = {}
    if result.metrics_json:
        try:
            m = json.loads(result.metrics_json) or {}
        except ValueError:
            m = {}
    m["pumpgleit"] = {"version": VERSION, "gleit_s": erg["gleit_s"], "hinschauen": erg["hinschauen"],
                      "avg_pump_hz": result.pg_avg_cadence_hz}
    result.metrics_json = json.dumps(m)
    return True
