"""Neubau Stufe A r7 (23.10.2026): der Live-Weg der v3-Nachbearbeitung REIN LESEND nachgebaut, mit
austauschbarem Modell. Gemeinsam fuer `messen_r7.py` (Fahrer herausgehalten) und `regression_r7.py`
(Bestand, Gesamtmodelle wie live).

Warum ein Nachbau statt `nachbearbeitung.laeufe()`: dort rechnet jeder Aufruf Merkmale und Haltung neu;
hier werden Merkmale (M.merkmale) und Haltung (HA.merkmale gegen die Referenz r3) EINMAL je Session
gerechnet und mehrere Modelle darauf angewandt. Die Schritte danach sind die Live-Funktionen aus
`app/analysis/v3/nachbearbeitung.py` (_vereinigung, _teil, _mittel, _segmente, ohne_ausschluss,
nach_empfindlichkeit, ganze_v2_laeufe) — Reihenfolge wie `_anwenden`. `run_analysis` wird NIE aufgerufen
(es committet selbst); Pumps/Gleiten (Stufe 11), is_pumpfoil (Stufe 10, inkl. Pruefung mit „attempts"),
Bestwerte (Stufe 14) und `sportauto.einordnen` (Stufe 15) sind unten aus `analysis/__init__.py`
abgeschrieben — nur rechnen, nie schreiben.
"""
from __future__ import annotations

import json
import pickle
from functools import lru_cache

import numpy as np


@lru_cache(maxsize=8)
def modell_laden(pfad: str) -> dict:
    with open(pfad, "rb") as f:
        return pickle.load(f)


def klassifikator(modell: dict, fahrer: int | None):
    """Gesamtmodell oder (mit Fahrer und Falten) das Teilmodell, das den Fahrer NIE gesehen hat."""
    if "falten" in modell:
        k = modell["fahrer_falte"].get(int(fahrer)) if fahrer is not None else None
        if k is not None:
            return modell["falten"][k], True
        if "gesamt" in modell:
            return modell["gesamt"]["clf"], False
        return None, False
    return modell["clf"], False


def vorhersage(modell: dict, clf, X: np.ndarray, H: np.ndarray | None) -> np.ndarray:
    from app.analysis.v3 import merkmale as M, haltung as HA
    alle = list(M.NAMEN) + list(HA.NAMEN)
    namen = modell.get("namen") or M.NAMEN
    X0 = X
    if any(n in HA.NAMEN for n in namen):
        X0 = np.hstack([X, H])
    sp = [alle.index(n) for n in namen]
    return clf.predict_proba(M.windowize(X0[:, sp], modell.get("kontext_r", M.KONTEXT_R)))[:, 1]


def kontext(db, sid: int, mit_kandidaten: bool = True) -> dict | None:
    """Alles, was je Session nur EINMAL gerechnet werden muss."""
    from app import models
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.detect_v2 import analyze_session_v2
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M, nachbearbeitung as N
    s = db.get(models.Session, sid)
    if s is None:
        return None
    owner = db.get(models.User, s.user_id)
    sens = getattr(owner, "foil_sensitivity", None) or "normal"
    preset = dict(SENSITIVITY_PRESETS.get(sens) or {}) if sens != "normal" else {}
    judge = (s.sport_class or "pumpfoil") == "pumpfoil"
    keep = []
    try:
        for item in (json.loads(s.fremdkraft_keep) if s.fremdkraft_keep else []):
            keep.append((int(item[0]), int(item[1])))
    except (ValueError, TypeError, IndexError):
        keep = []
    ctx = {"s": s, "sid": sid, "user": s.user_id, "sens": sens, "judge": judge, "keep": keep, "preset": preset}
    if mit_kandidaten:
        ctx["v2"] = analyze_session_v2(s, judge_fremdkraft=judge, **preset)["segments"]
        ctx["tief"] = analyze_session_v2(s, judge_fremdkraft=judge, **N.TIEF_KW)["segments"]
    tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": s.session_uuid, "accel_hz": s.accel_hz,
                                                     "accel_scale": s.accel_scale}))
    ctx["tb"] = tb
    if not tb.has_accel or len(tb.gps) == 0:
        ctx["X"] = None
        return ctx
    t, X = M.merkmale(tb)
    ctx["t"], ctx["X"] = t.astype(float), X
    return ctx


def haltung(ctx, p_ref):
    from app.analysis.v3 import haltung as HA
    return HA.merkmale(ctx["tb"], ctx["t"], ctx["X"][:, 0], p_ref)


def p_fuer(ctx, modell: dict, ref: dict, fahrer=None) -> tuple[np.ndarray, dict]:
    """p je GPS-Sample: Referenz (r3) -> Haltung -> Modell. Mit `fahrer`: beide Teilmodelle ohne ihn."""
    clf_ref, ho_ref = klassifikator(ref, fahrer)
    p_ref = vorhersage(ref, clf_ref, ctx["X"], None)
    H = haltung(ctx, p_ref)
    clf, ho = klassifikator(modell, fahrer)
    return vorhersage(modell, clf, ctx["X"], H), {"ref_herausgehalten": ho_ref, "herausgehalten": ho}


def laeufe_mit_p(t, p, v2_segmente, tief_segmente, sens, keep=None):
    """= nachbearbeitung.laeufe(), nur mit gegebenem p (Live-Hilfsfunktionen)."""
    from app.analysis.v3 import nachbearbeitung as N
    pg = N._glaetten(p)
    iv = lambda s: (float(s["t_start_session_ms"]), float(s["t_end_session_ms"]))  # noqa: E731
    geschuetzt = [s for s in v2_segmente
                  if keep and any(ka < iv(s)[1] and kb > iv(s)[0] for ka, kb in keep)]
    frei_v2 = [iv(s) for s in v2_segmente if s not in geschuetzt]
    frei_tief = [iv(s) for s in tief_segmente
                 if not any(iv(s)[0] < iv(g)[1] and iv(s)[1] > iv(g)[0] for g in geschuetzt)]
    theta, tau = N.TEIL.get(sens, N.TEIL["normal"])
    L = N._teil(N._vereinigung(frei_v2, frei_tief), t, pg, theta)
    L = [(a, b) for a, b in L if (N._mittel(t, pg, a, b) or 0) >= tau]
    k = N.KURZ.get(sens, N.KURZ["normal"])
    L = [(a, b) for a, b in L if b - a >= N.KURZ_S * 1000 or (N._mittel(t, p, a, b) or 0) >= k]
    return L, geschuetzt


def v3_segmente(ctx, p, v2=None, sens=None) -> tuple[list, list]:
    """= nachbearbeitung._anwenden ab `laeufe()` -> (Segmente, von v3 verworfene v2-Laeufe)."""
    from app.analysis import analyse_ausschluss
    from app.analysis.v3 import nachbearbeitung as N
    s = ctx["s"]
    v2 = ctx["v2"] if v2 is None else v2
    sens = ctx["sens"] if sens is None else sens
    L, geschuetzt = laeufe_mit_p(ctx["t"], p, v2, ctx["tief"], sens, ctx["keep"])
    L = N.ohne_ausschluss(L, analyse_ausschluss(s))
    off = (int(v2[0]["t_start_session_ms"]) - int(v2[0]["t_start_ms"])) if v2 else int(s.trim_start_ms or 0)
    segs = N.nach_empfindlichkeit(N._segmente(L, v2, s, off), v2, sens, geschuetzt)
    if N.plattform(s) in N.OHNE_RANDSCHNITT:
        segs = N.ganze_v2_laeufe(segs, v2)
        if any(x.get("_neu_vermessen") for x in segs):
            iv = [(float(x["t_start_session_ms"]), float(x["t_end_session_ms"])) for x in segs if x not in geschuetzt]
            segs = [x for x in segs if x in geschuetzt] + N._segmente(iv, v2, s, off)
    for g in geschuetzt:
        if g not in segs:
            segs.append(g)
    segs.sort(key=lambda x: x["t_start_session_ms"])
    verworfen = []
    for x in v2:
        a, b = float(x["t_start_session_ms"]), float(x["t_end_session_ms"])
        bleibt = sum(max(0.0, min(b, float(y["t_end_session_ms"])) - max(a, float(y["t_start_session_ms"]))) for y in segs)
        if bleibt < 0.5 * max(b - a, 1.0):
            verworfen.append((a, b))
    return segs, verworfen


# ---------------------------------------------------------------------------------------------------
# Stufe 11 (Pumps/Gleiten je Lauf), 10 (is_pumpfoil), 14 (Bestwerte), 15 (sportauto) — nur rechnen.
# Abgeschrieben aus app/analysis/__init__.py (Stand 23.10.2026), ohne Karten-Felder (pump_idx, pump_hz).

def accel_raster(ctx) -> dict:
    """Accel-Raster wie run_analysis (Zuschnitt-Fenster, timebase.py, echte Messwerte) + GPS gefiltert."""
    if "raster" in ctx:
        return ctx["raster"]
    from app import storage
    from app.analysis import analyse_ausschluss
    from app.analysis.timebase import _accel_chunk_counts, build_timebase
    from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND
    s = ctx["s"]
    gps = storage.load_gps(s.session_uuid)
    accel = storage.load_accel(s.session_uuid)
    ts0, ts1 = s.trim_start_ms, s.trim_end_ms
    lo = ts0 if ts0 is not None else 0
    hi = ts1 if ts1 is not None else (gps[-1][0] if gps else 0)
    accel_hz = float(s.accel_hz or 0.0)
    echt = None
    if accel.shape[0] > 0 and gps:
        tb = build_timebase(gps, accel, s.accel_scale, s.accel_hz,
                            chunk_counts=_accel_chunk_counts(s.session_uuid),
                            t0_by_index=storage.load_accel_t0(s.session_uuid),
                            trim_start_ms=lo, trim_end_ms=hi, excluded_ranges=None,
                            accel_luecken=storage.accel_luecken(s.session_uuid),
                            t1_by_index=storage.load_accel_t1(s.session_uuid))
        if tb.has_accel and tb.accel_hz and tb.accel_hz > 0:
            accel_hz = round(float(tb.accel_hz), 3)
            src = tb.t_accel_ms - float(lo)
            n = int(max(hi - lo, 0) / 1000.0 * accel_hz) + 1
            grid = np.arange(n) / accel_hz * 1000.0
            pick = np.clip(np.searchsorted(src, grid), 0, src.size - 1)
            accel = tb.accel[pick]
            links = src[np.clip(pick - 1, 0, src.size - 1)]
            abst = np.minimum(np.abs(src[pick] - grid), np.abs(links - grid))
            echt = abst <= max(2000.0 / accel_hz, 250.0)
        else:
            accel = accel[0:0]
    g = gps
    if (ts0 is not None or ts1 is not None) and g:
        g = [[x[0] - lo] + list(x[1:]) for x in g if lo <= x[0] <= hi]
    excl = analyse_ausschluss(s)
    if excl and g:
        off = (ts0 or 0) if (ts0 is not None or ts1 is not None) else 0
        w = [(a - off, b - off) for a, b in excl]
        g = [x for x in g if not any(a <= x[0] <= b for a, b in w)]
    r = {"accel_hz": accel_hz, "n": int(accel.shape[0]), "gps": g}
    if accel.shape[0] > 0:
        fs = accel_hz
        r["vsig"] = bandpass_fft(vertical_against_gravity(accel, s.accel_scale, fs), fs, *FILTER_BAND)
        r["echt"] = echt if echt is not None and echt.size == r["vsig"].size else np.ones(r["vsig"].size, bool)
    ctx["raster"] = r
    return r


def pumps_und_gleiten(ctx, segs) -> list:
    """Stufe 11 je Lauf: pumps, longest_glide_s (wie run_analysis). Gibt Kopien zurueck."""
    from app.analysis import MAX_GLIDE_S
    from app.ml.pumps import find_pumps_cadence
    r = accel_raster(ctx)
    out = [dict(x) for x in segs]
    if "vsig" not in r:
        return out
    fs, vsig, echt = r["accel_hz"], r["vsig"], r["echt"]
    for seg in out:
        a_lo = max(int(round(seg["t_start_ms"] / 1000.0 * fs)), 0)
        a_hi = min(int(round(seg["t_end_ms"] / 1000.0 * fs)), vsig.size)
        abgedeckt = echt[a_lo:a_hi] if a_hi > a_lo else np.zeros(0, bool)
        if abgedeckt.size == 0 or abgedeckt.mean() < 0.5:
            seg.update({"pumps": None, "longest_glide_s": None})
            continue
        idx = find_pumps_cadence(vsig[a_lo:a_hi], fs) if a_hi > a_lo else np.empty(0, dtype=int)
        idx = idx[abgedeckt[idx]] if idx.size else idx
        pts = (a_lo + idx) / fs * 1000.0
        seg["pumps"] = int(pts.size)
        if pts.size >= 1:
            ps = np.sort(pts)
            pi = np.round(ps / 1000.0 * fs).astype(int)
            luecke = np.concatenate([[0], np.cumsum(~echt)])
            gaps = [float(ps[k + 1] - ps[k]) / 1000.0 for k in range(ps.size - 1)
                    if luecke[min(pi[k + 1], echt.size)] - luecke[min(pi[k], echt.size)] == 0]
            drin = np.flatnonzero(abgedeckt)
            acc_start = (a_lo + int(drin[0])) / fs * 1000.0
            acc_end = (a_lo + int(drin[-1]) + 1) / fs * 1000.0
            lead = (float(ps[0]) - acc_start) / 1000.0
            tail = (acc_end - float(ps[-1])) / 1000.0
            glides = [x for x in ([lead] + gaps + [tail]) if 0 < x <= MAX_GLIDE_S]
            seg["longest_glide_s"] = round(float(max(glides)), 2) if glides else 0.0
        else:
            seg["longest_glide_s"] = 0.0
    return out


def kennzahlen(ctx, segs, is_pumpfoil: bool) -> dict:
    """Stufe 14 + Summen wie run_analysis/_anwenden, dazu sportauto (Stufe 15, nur als Urteil)."""
    from app.analysis.sportauto import einordnen
    r = accel_raster(ctx)
    best = {}
    for k, sk in (("distance", "distance_m"), ("duration", "duration_s"), ("speed", "max_speed_mps"),
                  ("glide", "longest_glide_s")):
        vals = [(float(x.get(sk) or 0.0), j) for j, x in enumerate(segs)]
        b = (0.0, None)
        for v, j in vals:
            if v > b[0]:
                b = (v, j)
        best[k] = b
    hat_accel = "vsig" in r
    urteil = None
    try:
        urteil = einordnen(segs, r["gps"])
    except Exception:
        urteil = {"fehler": True}
    return {
        "num_runs": len(segs),
        "foiling_time_s": round(sum(x["t_end_ms"] - x["t_start_ms"] for x in segs) / 1000.0, 1),
        "foiling_distance_m": round(float(sum(x.get("distance_m") or 0 for x in segs)), 1),
        "max_speed_mps": round(max((float(x.get("max_speed_mps") or 0) for x in segs), default=0.0), 2),
        "pump_count": int(sum(int(x.get("pumps") or 0) for x in segs)) if hat_accel else None,
        "best_distance_m": best["distance"][0], "best_distance_idx": best["distance"][1],
        "best_duration_s": best["duration"][0], "best_duration_idx": best["duration"][1],
        "best_speed_mps": best["speed"][0], "best_speed_idx": best["speed"][1],
        "best_glide_s": best["glide"][0], "best_glide_idx": best["glide"][1],
        "is_pumpfoil": bool(is_pumpfoil),
        "laengster_lauf_s": round(max((float(x.get("duration_s") or 0) for x in segs), default=0.0), 1),
        "sportauto": None if urteil is None else (urteil.get("hinweis") if isinstance(urteil, dict) else str(urteil)),
        "sportauto_klasse": urteil.get("sport_class") if isinstance(urteil, dict) else None,
    }


def ist_pumpfoil(ctx, segs, p) -> tuple[bool, dict | None]:
    """Stufe 10 fuer detection == model: Laeufe > 0, sonst Pruefung mit „attempts" (v2 + v3 mit p)."""
    from app.analysis import ERKENNUNG_STUFE, pumpfoil_per_light
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.detect_v2 import analyze_session_v2
    s = ctx["s"]
    ja = len(segs) > 0
    info = None
    if (not ja and ctx["sens"] != ERKENNUNG_STUFE and (s.sport_class or "pumpfoil") == "pumpfoil"
            and s.pumpfoil_override is None):
        if "v2_attempts" not in ctx:
            ctx["v2_attempts"] = analyze_session_v2(s, judge_fremdkraft=True,
                                                    **dict(SENSITIVITY_PRESETS[ERKENNUNG_STUFE]))["segments"]
        segs_l, _ = v3_segmente(ctx, p, v2=ctx["v2_attempts"], sens=ERKENNUNG_STUFE)
        ok, grund = pumpfoil_per_light(segs_l, "model")
        info = {"ja": bool(ok), "laeufe": len(segs_l)}
        ja = ja or ok
    if s.pumpfoil_override is not None:
        ja = bool(s.pumpfoil_override)
    return ja, info
