"""Wind-Erkennung (analysis/windlauf.py): Schwellen je Session aus der Tempo-Luecke."""
import numpy as np


def _spur(tempi_kmh):
    # [t_ms, lat, lon, speed_mps, hr, hacc] im 1-Hz-Takt, nach Norden
    out, y = [], 0.0
    for i, v in enumerate(tempi_kmh):
        y += v / 3.6
        out.append([i * 1000, 47.0 + y / 111320.0, 9.0, v / 3.6, None, 4])
    return out


def test_leichtwind_und_starkwind():
    from app.analysis.windlauf import schwellen
    rng = np.random.default_rng(1)
    # Leichtwind: Brett im Wasser ~4 km/h, on-foil ~13 km/h
    leicht = list(np.r_[rng.normal(4, 0.8, 300), rng.normal(13, 1.2, 900), rng.normal(4, 0.8, 200)].clip(0))
    s = schwellen(_spur(leicht))
    assert s["quelle"] == "luecke" and 6.5 <= s["start_kmh"] <= 11 and s["ende_kmh"] < s["start_kmh"]
    # Starkwind, kleines Foil: ~8 km/h im Wasser, ~24 km/h on-foil
    stark = list(np.r_[rng.normal(8, 1.0, 300), rng.normal(24, 2.0, 900), rng.normal(8, 1.0, 200)].clip(0))
    t = schwellen(_spur(stark))
    assert t["quelle"] == "luecke" and t["start_kmh"] > s["start_kmh"] and t["ende_kmh"] > 8.5


def test_ohne_luecke_feste_werte():
    from app.analysis.windlauf import FEST_ENDE, FEST_START, schwellen
    rng = np.random.default_rng(2)
    nur_foil = list(rng.normal(22, 2.0, 1200).clip(0))     # keine langsame Haeufung
    s = schwellen(_spur(nur_foil))
    assert s["quelle"] == "fest" and (s["start_kmh"], s["ende_kmh"]) == (FEST_START, FEST_ENDE)
    assert schwellen(_spur([10.0] * 30))["quelle"] == "fest"   # zu kurz


def test_pumpfoil_unveraendert():
    """Die neuen Parameter haben Standardwerte = bisheriges Verhalten."""
    import inspect
    from app.analysis import gps
    from app.analysis.detect_v2 import detect_v2
    assert inspect.signature(gps._heuristic_mask).parameters["exit_dwell_s"].default == gps.EXIT_DWELL_S
    assert inspect.signature(detect_v2).parameters["exit_dwell_s"].default == gps.EXIT_DWELL_S
