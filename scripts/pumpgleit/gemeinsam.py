"""Pump-/Gleit-Modell am Handgelenk (23.10.2026): gemeinsame Bausteine. REIN LESEND.

- `db_lesend()`      DB-Sitzung, deren commit()/flush() eine Ausnahme wirft (Messen nie ueber
                     Funktionen, die heimlich speichern — Memory „messen-nie-ueber-api-funktionen").
- `brett_wahrheit()` Brett-Regeln (app/analysis/brett_regeln.je_lauf) hierher kopiert und erweitert:
                     je Lauf zusaetzlich jeder Pumpzyklus mit Gipfel, Folgegipfel und TIEFSTEM PUNKT
                     (Jans Marker-Definition, GROUND-TRUTH §5), alle Zyklen ohne Energie, Gieren fuer Carves.
- `uhr_daten()`      Uhr-Session wie Stufe 11 (Raster, Vertikal-Bandpass, echte Messwerte) plus alles,
                     was das Modell bekommt: Accel 3 Achsen (g), Kreisel (falls da), GPS.
- `heute_pumps()`    Stufe 11 nachgebaut: find_pumps_cadence je Lauf -> Pump-Zeiten, Gleitphasen
                     (gleit_anzeige-Regel), longest_glide_s (inkl. Anlauf + Schwanz wie live).
Zeiten: alles in SESSION-ms der jeweiligen Session; Brett -> Uhr: t_uhr = t_brett - versatz_ms.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
# Umgebung (24.10.2026, pg-2): PG_AUS = eigener Ausgabeordner, PG_PAARE = andere Paarliste — die pg-1-Dateien bleiben.
AUS = pathlib.Path(os.environ.get("PG_AUS") or WURZEL / "server" / "data" / "ml" / "pumpgleit")
PAARE = pathlib.Path(os.environ.get("PG_PAARE") or WURZEL / "server" / "data" / "ml" / "v3" / "paare-2026-10-23.json")

GLEIT_MIN_S, GLEIT_MAX_S = 1.5, 15.0


class SchreibVersuch(RuntimeError):
    pass


def db_lesend():
    from app.db import SessionLocal
    db = SessionLocal()

    def nein(*a, **k):
        raise SchreibVersuch("Schreibzugriff in einem rein lesenden Skript")
    db.commit = nein
    db.flush = nein
    return db


# ------------------------------------------------------------------ Paare

def qualitaet(p) -> str:
    """Wie scripts/v3/brett_daten_r7.qualitaet."""
    r = p.get("r_je_lauf") or []
    rmed = float(np.median(r)) if r else 0.0
    st = p.get("streuung_ms")
    if st is None or p.get("versatz_ms") is None:
        return "schwach"
    if st <= 400 and len(r) >= 2 and rmed >= 0.35:
        return "gut"
    if st <= 1200 and rmed >= 0.25:
        return "mittel"
    return "schwach"


def paare_beste() -> list[dict]:
    """Je Uhr-Session das am besten ausgerichtete Paar (wie brett_daten_r7), nur Uhren mit Accel."""
    paare = [p for p in json.loads(PAARE.read_text()) if p.get("uhr_accel", True)]
    rang = {"gut": 0, "mittel": 1, "schwach": 2}
    beste = {}
    for p in paare:
        p["qualitaet"] = qualitaet(p)
        k = p["uhr"]
        if k not in beste or (rang[p["qualitaet"]], p.get("streuung_ms") or 1e9) < \
                (rang[beste[k]["qualitaet"]], beste[k].get("streuung_ms") or 1e9):
            beste[k] = p
    return sorted(beste.values(), key=lambda x: x["uhr"])


# ------------------------------------------------------------------ Brett

BR_HZ = 25.0


def _band(x, lo, hi, hz=BR_HZ):
    X = np.fft.rfft(x - np.mean(x))
    f = np.fft.rfftfreq(x.size, 1 / hz)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n=x.size)


def _phasen(t, maske):
    if not maske.any():
        return []
    d = np.diff(np.concatenate([[0], maske.astype(np.int8), [0]]))
    an, ab = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
    return [[round(float(t[i])), round(float(t[min(j, t.size - 1)]))] for i, j in zip(an, ab)]


def je_lauf_erweitert(t, hub_cm, pitch_deg, gps, laeufe, echt):
    """Kopie von brett_regeln.je_lauf (brett-regeln-2), gleiche Entscheidungen, mehr Ausgabe."""
    from app.analysis import brett_regeln as BR
    from scipy.signal import find_peaks
    hub = np.nan_to_num(np.asarray(hub_cm, float))
    pitch = np.nan_to_num(np.asarray(pitch_deg, float))
    gps = np.asarray(gps, float) if len(gps) else np.empty((0, 4))
    lab = np.zeros(t.size, dtype=np.int8)
    echt = np.asarray(echt, bool)
    luecke = np.concatenate([[0], np.cumsum(~echt)])
    hb = _band(hub, 0.5, 3.0)
    pf = _band(pitch, 0.5, 3.0)
    vz = np.gradient(hb) * BR_HZ
    pk, _ = find_peaks(hb, prominence=0.5, distance=int(0.35 * BR_HZ))
    aus = []
    for a, b in laeufe:
        td, quelle = BR.aufsetzen_ms(gps, a, b)
        ia, itd = np.searchsorted(t, a), np.searchsorted(t, td)
        lab[ia:itd] = 1
        zyklen = [(pk[i], pk[i + 1], float(np.mean(pf[pk[i]:pk[i + 1]] * vz[pk[i]:pk[i + 1]])))
                  for i in range(len(pk) - 1)
                  if a <= t[pk[i]] and t[pk[i + 1]] <= td and t[pk[i + 1]] - t[pk[i]] <= BR.MAX_ZYKLUS_MS
                  and luecke[pk[i + 1]] == luecke[pk[i]]]
        ok = len(zyklen) >= BR.MIN_ZYKLEN
        pumps, schwach = [], []
        if not ok:
            lab[ia:itd] = 0
        else:
            wref = float(np.median([w for _, _, w in zyklen]))
            sg = np.sign(wref) or 1.0
            for p0, p1, w in zyklen:
                tief = p0 + int(np.argmin(hb[p0:p1 + 1]))
                ev = {"gipfel": float(t[p0]), "folge": float(t[p1]), "tief": float(t[tief]),
                      "hub": float(hb[p0] - hb[tief]), "energie": float(sg * w / abs(wref)) if wref else 0.0}
                if wref != 0 and sg * w / abs(wref) > BR.ENERGIE_ANTEIL:
                    lab[p0:p1] = 2
                    pumps.append(ev)
                else:
                    schwach.append(ev)
        stueck = lab[ia:itd]
        phasen = []
        if ok:
            for x, y in _phasen(np.arange(ia, itd, dtype=float), stueck == 1):
                i0, i1 = int(x), int(y)
                d = (t[min(i1, t.size - 1)] - t[i0]) / 1000.0
                if i0 > ia and GLEIT_MIN_S <= d <= GLEIT_MAX_S and luecke[min(i1, t.size)] == luecke[i0]:
                    phasen.append([round(float(t[i0])), round(float(t[min(i1, t.size - 1)]))])
        aus.append({"ok": ok, "start": float(a), "ende": float(b), "aufsetzen": float(td),
                    "aufsetzen_quelle": quelle, "zyklen": len(zyklen), "pumps": pumps, "schwach": schwach,
                    "gleit": phasen})
    return lab, aus


def brett_wahrheit(db, b_id: int) -> dict:
    from app import models, storage
    from app.api.sessions import _lage_antwort
    from app.analysis.brett_anwenden import echt_maske
    s = db.get(models.Session, b_id)
    segs = json.loads(s.result.segments_json or "[]")
    laeufe = [(float(g["t_start_session_ms"]), float(g.get("t_end_session_ms_vorher", g["t_end_session_ms"])))
              for g in segs]
    gespeichert = [g.get("pumps") for g in segs]
    dauer = ((s.ended_at - s.started_at).total_seconds() * 1000 if s.ended_at and s.started_at
             else laeufe[-1][1] + 10000)
    r = _lage_antwort(db, s, from_ms=0, to_ms=int(dauer), pad_s=0.0, hz=BR_HZ)
    if not r.get("ok") or not r.get("hub_cm"):
        return {"ok": False, "grund": r.get("grund")}
    t = np.asarray(r["t_ms"], float)
    gps = np.asarray(storage.load_gps(s.session_uuid), float)
    echt = echt_maske(s, t)
    lab, lauf = je_lauf_erweitert(t, r["hub_cm"], r["pitch_deg"], gps, laeufe, echt)
    gier = np.asarray(r["gier_delta_deg"], float) / float(r.get("yaw_fenster_s") or 1.0)  # Grad/s, 1 s rueckwaerts
    roll = np.asarray(r["roll_deg"], float)
    return {"ok": True, "t": t, "lab": lab, "laeufe": lauf, "gier_dps": gier, "roll": roll,
            "echt": echt, "gespeichert_pumps": gespeichert, "user": s.user_id}


def carve_maske(t, gier_dps, fenster_s=2.0, grad=60.0):
    """Carve-Wahrheit am Brett: Kursaenderung des Bretts >= `grad` Grad innerhalb `fenster_s` (zentriert).
    Gieren aus dem Kreisel (Betrag, vorn/hinten egal)."""
    if t.size < 3:
        return np.zeros(t.size, bool)
    hz = 1000.0 / float(np.median(np.diff(t)))
    w = max(int(round(fenster_s * hz)), 1)
    c = np.concatenate([[0], np.cumsum(np.nan_to_num(gier_dps) / hz)])
    i = np.arange(t.size)
    lo, hi = np.clip(i - w // 2, 0, t.size), np.clip(i + w // 2, 0, t.size)
    return np.abs(c[hi] - c[lo]) >= grad


# ------------------------------------------------------------------ Uhr

def uhr_daten(db, u_id: int, mit_gyro: bool = True) -> dict | None:
    """Raster wie Stufe 11 (Zuschnitt-Fenster), dazu Accel (g), Kreisel, GPS. Zeiten Session-ms (`t`)."""
    from app import models, storage
    from app.analysis.timebase import _accel_chunk_counts, build_timebase
    from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND
    s = db.get(models.Session, u_id)
    if s is None or s.result is None:
        return None
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
    acc_raw = tb.accel[pick]
    links = src[np.clip(pick - 1, 0, src.size - 1)]
    abst = np.minimum(np.abs(src[pick] - grid), np.abs(links - grid))
    echt = abst <= max(2000.0 / fs, 250.0)
    vsig = bandpass_fft(vertical_against_gravity(acc_raw, s.accel_scale, fs), fs, *FILTER_BAND)
    m = json.loads(s.result.metrics_json or "{}")
    segs = json.loads(s.result.segments_json or "[]")
    d = {"id": u_id, "user": s.user_id, "fs": fs, "lo": float(lo), "t": grid + float(lo),
         "acc": acc_raw.astype(np.float32) / float(s.accel_scale or 2048), "vsig": vsig, "echt": echt,
         "gps": np.asarray([[g[0], g[1], g[2], (g[3] if g[3] is not None else np.nan)] for g in gps], float),
         "segs": segs, "device_model": s.device_model or "Garmin", "app_version": s.app_version,
         "accel_hz_measured": m.get("accel_hz_measured"), "time_base": m.get("time_base"),
         "sport_class": s.sport_class, "detection": s.result.detection,
         "v3": (m.get("v3") or {}).get("version"), "gyro": None}
    if mit_gyro and storage.chunk_laengen(s.session_uuid, "gyro"):
        from app.analysis import lage
        gy = storage.load_gyro(s.session_uuid)
        tg = lage.zeitachse(storage.load_gyro_t0(s.session_uuid), storage.chunk_laengen(s.session_uuid, "gyro"))
        if tg.size == gy.shape[0] and tg.size > 10:
            j = np.clip(np.searchsorted(tg, d["t"]), 0, tg.size - 1)
            ok = np.abs(tg[j] - d["t"]) <= 250
            g = gy[j].astype(np.float32)
            g[~ok] = np.nan
            d["gyro"] = g
    return d


def heute_pumps(u: dict, laeufe_ms: list[tuple[float, float]]) -> list[dict]:
    """Stufe 11 je Lauf (Session-ms Grenzen): Pump-Zeiten (Session-ms), Gleitphasen (Anzeige-Regel),
    longest_glide_s (live: Anlauf + Luecken + Schwanz, je <= 15 s)."""
    from app.ml.pumps import find_pumps_cadence
    fs, vsig, echt, lo = u["fs"], u["vsig"], u["echt"], u["lo"]
    luecke = np.concatenate([[0], np.cumsum(~echt)])
    out = []
    for a, b in laeufe_ms:
        a_lo = max(int(round((a - lo) / 1000.0 * fs)), 0)
        a_hi = min(int(round((b - lo) / 1000.0 * fs)), vsig.size)
        abg = echt[a_lo:a_hi] if a_hi > a_lo else np.zeros(0, bool)
        if abg.size == 0 or abg.mean() < 0.5:
            out.append({"a": a, "b": b, "pumps": None, "pump_ms": [], "gleit": [], "longest": None})
            continue
        idx = find_pumps_cadence(vsig[a_lo:a_hi], fs)
        idx = idx[abg[idx]] if idx.size else idx
        pts = (a_lo + idx) / fs * 1000.0
        gleit, longest = [], 0.0
        if pts.size:
            ps = np.sort(pts)
            pi = np.round(ps / 1000.0 * fs).astype(int)
            ohne = [luecke[min(pi[k + 1], echt.size)] - luecke[min(pi[k], echt.size)] == 0 for k in range(ps.size - 1)]
            gaps = [float(ps[k + 1] - ps[k]) / 1000.0 for k in range(ps.size - 1) if ohne[k]]
            drin = np.flatnonzero(abg)
            acc_start = (a_lo + int(drin[0])) / fs * 1000.0
            acc_end = (a_lo + int(drin[-1]) + 1) / fs * 1000.0
            lead = (float(ps[0]) - acc_start) / 1000.0
            tail = (acc_end - float(ps[-1])) / 1000.0
            gl = [x for x in ([lead] + gaps + [tail]) if 0 < x <= GLEIT_MAX_S]
            longest = round(float(max(gl)), 2) if gl else 0.0
            for k in range(ps.size - 1):
                dd = (ps[k + 1] - ps[k]) / 1000.0
                if GLEIT_MIN_S <= dd <= GLEIT_MAX_S and ohne[k]:
                    gleit.append((float(ps[k]) + lo, float(ps[k + 1]) + lo))
            ende = min(acc_end, b - lo)
            dd = (ende - float(ps[-1])) / 1000.0
            if GLEIT_MIN_S <= dd <= GLEIT_MAX_S:
                gleit.append((float(ps[-1]) + lo, float(ende) + lo))
        out.append({"a": a, "b": b, "pumps": int(pts.size), "pump_ms": list(pts + lo), "gleit": gleit,
                    "longest": longest})
    return out


def gespeicherte_laeufe(u: dict) -> list[tuple[float, float]]:
    return [(float(g["t_start_session_ms"]), float(g["t_end_session_ms"])) for g in u["segs"]
            if "t_start_session_ms" in g]


# ------------------------------------------------------------------ Vergleich

def zuordnen(wahr: np.ndarray, erk: np.ndarray, tol_ms: float, lag_ms: float = 0.0):
    """Eins-zu-eins-Zuordnung (gierig nach Abstand). -> (treffer, verpasst, extra, abstaende)."""
    wahr = np.sort(np.asarray(wahr, float)); erk = np.sort(np.asarray(erk, float) - lag_ms)
    if wahr.size == 0 or erk.size == 0:
        return 0, int(wahr.size), int(erk.size), []
    paare = []
    for i, w in enumerate(wahr):
        j0, j1 = np.searchsorted(erk, w - tol_ms), np.searchsorted(erk, w + tol_ms, side="right")
        for j in range(j0, j1):
            paare.append((abs(erk[j] - w), i, j, erk[j] - w))
    paare.sort()
    uw, ue, d = set(), set(), []
    for dist, i, j, sd in paare:
        if i not in uw and j not in ue:
            uw.add(i); ue.add(j); d.append(sd)
    return len(uw), int(wahr.size - len(uw)), int(erk.size - len(ue)), d


def intervalle_vergleich(wahr: list, erk: list, anteil: float = 0.5):
    """Intervall-Treffer: ein erkanntes Intervall ist richtig, wenn >= `anteil` davon in Brett-Gleiten
    liegt; ein Brett-Intervall ist gefunden, wenn >= `anteil` davon erkannt ist. -> (tp_e, n_e, tp_w, n_w)."""
    def ueber(x, menge):
        return sum(max(0.0, min(x[1], y[1]) - max(x[0], y[0])) for y in menge)
    tp_e = sum(1 for x in erk if x[1] > x[0] and ueber(x, wahr) >= anteil * (x[1] - x[0]))
    tp_w = sum(1 for x in wahr if x[1] > x[0] and ueber(x, erk) >= anteil * (x[1] - x[0]))
    return tp_e, len(erk), tp_w, len(wahr)


def sekunden_maske(t: np.ndarray, intervalle: list) -> np.ndarray:
    m = np.zeros(t.size, bool)
    for a, b in intervalle:
        m[(t >= a) & (t < b)] = True
    return m
