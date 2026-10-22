"""Tanz-Vorschlag NUR am Server (Version s1) — neben der Uhr-Rechnung (app/tanz_analyse.py = Tanz.mc).

NUR Tanz (Regel „nur Pumpfoil -> Tanz", CLAUDE.md). Jan, 22.10.2026: „versuch doch mal regeln fuer salsa zu
finden, einfach erstmal nur serverseitig … ob das dann spaeter auch auf der Uhr funktioniert ist erstmal egal".

Gleiche 10-s-Fenster und Abschnitte wie die Uhr, zusaetzlich zwei Anteile am Spektrum der senkrechten
Beschleunigung (0,3–8 Hz):
  b1   1,0–1,5 Hz (60–90 /min) — bei Salsa deutlich hoeher (Median 0,21–0,27) als bei Samba, Boogie,
       Jive, Langsamem Walzer (0,10–0,13), auch wenn das gefundene Tempo dicht an Samba liegt
  b2   2,0–2,5 Hz — Boogie/Jive hoch, Salsa niedrig
Vorschlag wie auf der Uhr: naechstes Muster, Abstand je Merkmal durch eine gemeinsame Streuung geteilt;
die Streuung ist hier auf 1-min-Stuecken geschaetzt (so lang ist ein kurzer Abschnitt), nicht je Fenster.
Muster: app/data/tanz_muster_server.json aus scripts/tanz_server_ableiten.py. Befund: docs/TANZ.md.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import tanz_analyse as ta

VERSION = "s1"
MUSTER_DATEI = Path(__file__).parent / "data" / "tanz_muster_server.json"
BAENDER = {"b1": (1.0, 1.5), "b2": (2.0, 2.5)}
_GESAMT = (0.3, 8.0)
_FR = np.fft.rfftfreq(ta.N, 1 / ta.HZ)
_HANN = np.hanning(ta.N)


def fenster(a_g: np.ndarray, gyro_dps: np.ndarray | None, t0_ms: int = 0) -> list[dict]:
    """Fenster der Uhr-Rechnung plus Spektrum-Anteile b1/b2."""
    fs = ta.fenster(a_g, gyro_dps, t0_ms)
    for f in fs:
        i = (f["t_ms"] - t0_ms) // 40
        w = a_g[i:i + ta.N]
        u = w.mean(0)
        u = u / np.linalg.norm(u)
        x = w @ u
        x = x - x.mean()
        p = np.abs(np.fft.rfft(x * _HANN)) ** 2
        ges = float(p[(_FR > _GESAMT[0]) & (_FR < _GESAMT[1])].sum())
        for k, (lo, hi) in BAENDER.items():
            f[k] = float(p[(_FR >= lo) & (_FR < hi)].sum()) / ges if ges > 0 else 0.0
    return fs


@lru_cache(maxsize=1)
def muster() -> dict:
    try:
        return json.loads(MUSTER_DATEI.read_text())
    except (OSError, ValueError):
        return {}


def merkmale(ws: list[dict]) -> dict:
    tz = [w for w in ws if ta.tanzt(w)] or ws
    tempi = [w["tempo"] for w in tz if w["tempo"] > 0]
    m = {"tempo": float(np.median(tempi)) if tempi else 0.0}
    for k in ("quer", *BAENDER):
        v = [w[k] for w in tz if k in w]
        m[k] = float(np.median(v)) if v else None
    return m


def bewerten(m: dict, mu_alle: dict | None = None) -> list[tuple[str, float]]:
    """Abstand zu jedem Muster (kleiner = passender). Tempo wie auf der Uhr logarithmisch, mit
    Aufschlag 1,0 fuer Verdopplung/Halbierung. Nur gemessene Taenze (>= 5 min Daten) haben ein Muster;
    geschaetzte wie auf der Uhr gibt es hier bewusst nicht (s. scripts/tanz_server_ableiten.py)."""
    mu_alle = mu_alle if mu_alle is not None else muster()
    s = mu_alle.get("streuung") or {}
    out = []
    for key, mu in (mu_alle.get("taenze") or {}).items():
        d = 0.0
        if m["tempo"] > 0 and mu.get("tempo"):
            lt, lm, st = math.log(m["tempo"]), math.log(mu["tempo"]), s.get("tempo", 0.15)
            d += min(((lt - lm) / st) ** 2, ((lt - lm - math.log(2)) / st) ** 2 + 1.0,
                     ((lt - lm + math.log(2)) / st) ** 2 + 1.0)
        else:
            d += 4.0
        for k in ("quer", *BAENDER):
            if m.get(k) is None:
                continue
            d += ((m[k] - mu[k]) / s[k]) ** 2
        out.append((key, d))
    return sorted(out, key=lambda x: x[1])


def vorschlag(ws: list[dict], mu_alle: dict | None = None) -> str | None:
    b = bewerten(merkmale(ws), mu_alle)
    return b[0][0] if b else None


def vorschlaege(fs: list[dict], abschnitte: list[dict]) -> list[str | None]:
    """Je Zeile der Tabelle (start_ms/ende_ms in Session-ms) der Server-Vorschlag; None ohne Daten."""
    out = []
    for r in abschnitte:
        bis = r.get("ende_ms") or r["start_ms"]
        ws = [f for f in fs if r["start_ms"] <= f["t_ms"] < bis]
        out.append(vorschlag(ws) if ws else None)
    return out
