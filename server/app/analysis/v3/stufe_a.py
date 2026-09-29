"""Erkennung v3, Stufe A anwenden: On-Foil-Maske je GPS-Sample aus dem trainierten Modell.

Gleiche Schnittstelle wie `detect_v2.model_mask_on_timebase(tb)` (bool-Array, Laenge = GPS-Samples),
damit Segmentierung, Pumps und Fremdkraft unveraendert bleiben. NICHT live: das Modell liegt unter
server/data/ml/v3/ (nicht im Repo) und wird nur von scripts/v3/ geladen.
"""
from __future__ import annotations

import pickle
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import merkmale as M

STANDARD = Path(__file__).resolve().parents[3] / "data" / "ml" / "v3" / "stufe_a.pkl"


@lru_cache(maxsize=2)
def _modell(pfad: str):
    with open(pfad, "rb") as f:
        return pickle.load(f)


FALTEN = STANDARD.with_name("stufe_a_falten.pkl")


def wahrscheinlichkeit(tb, pfad: Path = STANDARD, fahrer: int | None = None) -> np.ndarray | None:
    """Wahrscheinlichkeit „auf dem Foil" je GPS-Sample. Mit `fahrer` (nur fuer Messungen): das
    Teilmodell, das diesen Fahrer im Training NIE gesehen hat — sonst misst man Auswendiglernen.
    Fahrer, die gar nicht im Training waren, bekommen das Gesamtmodell."""
    if not tb.has_accel or len(tb.gps) == 0:
        return None
    _, X = M.merkmale(tb)

    def _spalten(modell: dict) -> np.ndarray:
        # Ein Modell kennt die Merkmale, mit denen es trainiert wurde (`namen`). Kommen spaeter
        # neue dazu (29.09.: Achsen gegen die Schwerkraft), nimmt ein altes Modell nur seine.
        namen = modell.get("namen") or M.NAMEN
        sp = [M.NAMEN.index(n) for n in namen]
        return M.windowize(X[:, sp], modell.get("kontext_r", M.KONTEXT_R))
    if fahrer is not None and FALTEN.exists():
        f = _modell(str(FALTEN))
        k = f["fahrer_falte"].get(int(fahrer))
        if k is not None:
            return f["falten"][k].predict_proba(_spalten(f))[:, 1]
    m = _modell(str(pfad))
    return m["clf"].predict_proba(_spalten(m))[:, 1]


# Glaettung + Hysterese (29.09.2026): die rohe Wahrscheinlichkeit pendelt in ruhigen Gleitphasen um
# 0,5, die Maske flackert, und die Segmentierung macht aus einem Lauf mehrere (erster Schattenlauf:
# 41 % mehr Laeufe bei 7 % mehr Fahrzeit). Werte auf einem eigenen Abstimm-Satz bestimmt.
GLAETTEN_S = 5
EIN, AUS = 0.6, 0.4


def glaetten(p: np.ndarray, k: int = GLAETTEN_S) -> np.ndarray:
    if k <= 1 or p.size < k:
        return p
    return np.convolve(np.pad(p, (k // 2, k - 1 - k // 2), mode="edge"), np.ones(k) / k, mode="valid")


def hysterese(p: np.ndarray, ein: float = EIN, aus: float = AUS) -> np.ndarray:
    m = np.zeros(p.size, bool)
    an = False
    for i, x in enumerate(p):
        an = (x >= ein) if not an else (x > aus)
        m[i] = an
    return m


def maske(tb, pfad: Path = STANDARD, k: int | None = None, ein: float | None = None,
          aus: float | None = None) -> np.ndarray | None:
    p = wahrscheinlichkeit(tb, pfad)
    if p is None:
        return None
    return hysterese(glaetten(p, GLAETTEN_S if k is None else k), EIN if ein is None else ein,
                     AUS if aus is None else aus)
