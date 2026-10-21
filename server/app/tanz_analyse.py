"""Tanzerkennung aus Rohdaten (Accel + Kreisel), dieselbe Rechnung wie auf der Uhr (watch-dance/Tanz.mc).

NUR Tanz (Regel „nur Pumpfoil -> Tanz", CLAUDE.md) — beruehrt die Pumpfoil-Auswertung nicht.
Muster je Tanz: app/data/tanz_muster.json (abgeleitet von scripts/tanz_muster_ableiten.py aus Jans
beschrifteten Sessions). Hintergrund, Befunde und Jans Hinweise: docs/TANZ.md.

Je 10-s-Fenster (250 Werte bei 25 Hz):
  akt     Streuung des Accel-Betrags (g)
  tempo   Auf-und-ab-Rhythmus: Autokorrelation der SENKRECHTEN Beschleunigung (Projektion auf das
          Schwerkraft-Mittel), Abstand 6..37 Werte = 40..250 /min; der kleinste Abstand mit >= 85 % der
          staerksten Korrelation (Schlag statt Takt)
  klar    Korrelation an dieser Stelle / Energie — wie rhythmisch
  quer    Streuung waagrecht / Streuung senkrecht (Arm fuehrt seitlich vs. federt auf und ab)
  umdr    Drehung um die Senkrechte im Fenster, netto, in Umdrehungen (Kreisel)
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np

HZ = 25
N = 250
MIN_LAG, MAX_LAG = 6, 37
AKT_G = 0.08
KLAR = 0.15
START_N, ENDE_N = 3, 4
MUSTER_DATEI = Path(__file__).parent / "data" / "tanz_muster.json"
S_TEMPO, S_QUER, S_UMDR = 0.15, 0.15, 0.2   # gemeinsame Streuung (log-Tempo, quer, Umdr./10 s)


def _tempo(x: np.ndarray):
    x = x - x.mean()
    r0 = float((x * x).sum())
    if r0 <= 0:
        return 0, 0.0
    r = {L: float((x[L:] * x[:-L]).sum()) for L in range(MIN_LAG - 1, MAX_LAG + 2)}
    best = max(r[L] for L in range(MIN_LAG, MAX_LAG + 1))
    lag = -1
    for L in range(MIN_LAG, MAX_LAG + 1):
        if r[L] >= 0.85 * best and r[L] >= r[L - 1] and r[L] >= r[L + 1]:
            lag = L
            break
    if lag < 0 or best <= 0:
        return 0, 0.0
    d = r[lag - 1] - 2 * r[lag] + r[lag + 1]
    lf = lag + (0.5 * (r[lag - 1] - r[lag + 1]) / d if d else 0.0)
    return int(1500 / lf), r[lag] / r0


def fenster(a_g: np.ndarray, gyro_dps: np.ndarray | None, t0_ms: int = 0) -> list[dict]:
    """a_g (n,3) in g, gyro_dps (n,3) in Grad/s (gleiche Indizes) -> Merkmale je 10-s-Fenster."""
    out = []
    for i in range(0, len(a_g) - N + 1, N):
        w = a_g[i:i + N]
        u = w.mean(0)
        nu = float(np.linalg.norm(u))
        if nu <= 0:
            continue
        u = u / nu
        mag = np.linalg.norm(w, axis=1)
        akt = float(mag.std())
        vert = w @ u
        hor = np.linalg.norm(w - np.outer(vert, u), axis=1)
        tempo, klar = _tempo(vert)
        quer = float(hor.std() / (vert.std() + 1e-9))
        umdr = None
        if gyro_dps is not None and len(gyro_dps) >= i + N:
            umdr = abs(float((gyro_dps[i:i + N] @ u).sum()) / HZ / 360.0)
        out.append({"t_ms": t0_ms + i * 40, "akt": akt, "tempo": tempo, "klar": klar, "quer": quer, "umdr": umdr})
    return out


def tanzt(f: dict) -> bool:
    return f["akt"] >= AKT_G and f["klar"] >= KLAR


def abschnitte(fs: list[dict]) -> list[tuple[int, int, list[dict]]]:
    """Zustandsmaschine wie auf der Uhr: Beginn bei 3 von 4 tanzenden Fenstern, Ende nach 4 ruhigen."""
    out, hist, kand, offen, folge = [], [], [], False, 0
    for f in fs:
        t = tanzt(f)
        hist = (hist + [t])[-4:]
        if not offen:
            if t:
                kand.append(f)
            if t and sum(hist) >= START_N:
                offen, folge = True, 0
            elif sum(hist) == 0:
                kand = []
        else:
            if t:
                kand.append(f)
                folge = 0
            else:
                folge += 1
                if folge >= ENDE_N:
                    out.append((kand[0]["t_ms"], f["t_ms"] + N * 40 - ENDE_N * N * 40, kand))
                    offen, folge, kand, hist = False, 0, [], []
    if offen and kand:
        out.append((kand[0]["t_ms"], fs[-1]["t_ms"] + N * 40, kand))
    return out


@lru_cache(maxsize=1)
def muster() -> dict:
    try:
        return json.loads(MUSTER_DATEI.read_text())["taenze"]
    except (OSError, ValueError, KeyError):
        return {}


def merkmale(ws: list[dict]) -> dict:
    """Zusammenfassung einer Strecke (nur tanzende Fenster zaehlen fuer Tempo/quer)."""
    tz = [w for w in ws if tanzt(w)] or ws
    tempi = [w["tempo"] for w in tz if w["tempo"] > 0]
    um = [w["umdr"] for w in ws if w.get("umdr") is not None]
    return {
        "tempo": float(np.median(tempi)) if tempi else 0.0,
        "quer": float(np.median([w["quer"] for w in tz])) if tz else 0.0,
        "umdr": float(np.median(um)) if um else None,
        "dreh": int(100 * sum(1 for x in um if x >= 0.8) / len(um)) if um else None,
    }


def bewerten(m: dict, erlaubt: set[str] | None = None) -> list[tuple[str, float]]:
    """Abstand zu jedem Muster (kleiner = passender), sortiert. Tempo logarithmisch, Kreisel nur wenn da."""
    out = []
    for key, mu in muster().items():
        if erlaubt and key not in erlaubt:
            continue
        d = 0.0
        # Gemeinsame Streuung je Merkmal fuer alle Taenze (wie LDA): je Tanz geschaetzt waere sie bei
        # wenigen Fenstern Zufall, und ein breites Muster schluckte dann alles (21.10.: Tango, n=8).
        # Tempo: Verdopplung/Halbierung (Takt statt Schlag) nur mit Aufschlag 1,0 statt voll falsch.
        if m["tempo"] > 0 and mu.get("tempo"):
            lt, lm = math.log(m["tempo"]), math.log(mu["tempo"][0])
            d += min(((lt - lm) / S_TEMPO) ** 2,
                     ((lt - lm - math.log(2)) / S_TEMPO) ** 2 + 1.0,
                     ((lt - lm + math.log(2)) / S_TEMPO) ** 2 + 1.0)
        else:
            d += 4.0
        # Fehlt einem Muster ein Merkmal (geschaetzte Taenze), zaehlt es mit 1,5 — sonst gewaenne das
        # Muster mit den wenigsten Angaben, weil weniger Summanden.
        d += ((m["quer"] - mu["quer"][0]) / S_QUER) ** 2 if mu.get("quer") else 1.5
        if m.get("umdr") is not None:
            d += ((m["umdr"] - mu["umdr"][0]) / S_UMDR) ** 2 if mu.get("umdr") else 1.5
        if mu.get("geschaetzt"):
            d += 1.0   # ohne eigene Daten nur, wenn nichts Gemessenes passt
        out.append((key, d))
    return sorted(out, key=lambda x: x[1])


def vorschlag(ws: list[dict], erlaubt: set[str] | None = None) -> str | None:
    b = bewerten(merkmale(ws), erlaubt)
    return b[0][0] if b else None


def marker_deuten(marker: list[tuple[int, str]], fs: list[dict]) -> list[tuple[int, int, str]]:
    """Jan setzt den Marker NACH dem Tanz (21.10.2026). Deutung: der Tanz lief zwischen dem vorigen
    Marker (bzw. Sessionbeginn) und diesem; ruhige Fenster an beiden Enden werden abgeschnitten.
    Rueckgabe (start_ms, ende_ms, tanz) je Marker mit erkennbarer Bewegung. Nur EINE Deutung — andere
    Fahrer markieren anders (vorher/zwischendurch), dafuer bleiben die Marker roh gespeichert."""
    out, vorher = [], 0
    for ms, key in sorted(marker):
        drin = [f for f in fs if f["t_ms"] >= vorher and f["t_ms"] + N * 40 <= ms + 5000]
        bewegt = [f for f in drin if f["akt"] >= AKT_G]
        if bewegt and key:
            out.append((bewegt[0]["t_ms"], bewegt[-1]["t_ms"] + N * 40, key))
        vorher = ms
    return out
