"""Tanzerkennung (app/tanz_analyse.py) und Gleichlauf mit der Uhr (watch-dance/Tanz.mc)."""
import json
import math
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]


def _signal(tempo_min, sekunden=60, drehung_dps=0.0, quer=0.3):
    t = np.arange(int(sekunden * 25)) / 25
    f = tempo_min / 60
    a = np.zeros((len(t), 3))
    a[:, 2] = 1.0 + 0.15 * np.sin(2 * math.pi * f * t)            # senkrecht federn
    a[:, 0] = quer * 0.15 * np.sin(2 * math.pi * f * t + 1.0)       # waagrecht
    g = np.zeros((len(t), 3))
    g[:, 2] = drehung_dps
    return a, g


def test_tempo_auch_unter_71_pro_minute():
    from app import tanz_analyse as ta
    for soll in (48, 57, 87, 131):
        a, g = _signal(soll)
        fs = ta.fenster(a, g)
        tempi = [f["tempo"] for f in fs if ta.tanzt(f)]
        assert tempi, soll
        assert abs(np.median(tempi) - soll) <= 3, (soll, tempi)


def test_drehung_und_abschnitt():
    from app import tanz_analyse as ta
    a, g = _signal(57, sekunden=90, drehung_dps=36.0)               # 1 Umdrehung je 10 s
    fs = ta.fenster(a, g)
    assert abs(fs[0]["umdr"] - 1.0) < 0.05
    ab = ta.abschnitte(fs)
    assert len(ab) == 1 and ab[0][0] == 0


def test_marker_nach_dem_tanz():
    from app import tanz_analyse as ta
    fs = [{"t_ms": i * 10000, "akt": 0.2 if i < 5 or 8 <= i < 12 else 0.01, "tempo": 60, "klar": 0.5,
           "quer": 0.5, "umdr": None} for i in range(15)]
    d = ta.marker_deuten([(65000, "lw"), (125000, "jive")], fs)
    assert d == [(0, 50000, "lw"), (80000, 120000, "jive")]


def test_muster_auf_der_uhr_wie_in_der_json():
    sys.path.insert(0, str(ROOT / "scripts"))
    import importlib.util
    spec = importlib.util.spec_from_file_location("tma", ROOT / "scripts" / "tanz_muster_ableiten.py")
    tma = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tma)
    muster = json.loads((ROOT / "server" / "app" / "data" / "tanz_muster.json").read_text())["taenze"]
    mc = (ROOT / "watch-dance" / "source" / "Tanz.mc").read_text()
    block = re.search(r"    // MUSTER-BEGINN.*?// MUSTER-ENDE", mc, re.S).group(0)
    assert block == tma.uhr_block(muster), "Tanz.mc-Muster veraltet: scripts/tanz_muster_ableiten.py --uhr"
    keys = re.search(r"const KEYS = \[(.*?)\];", mc, re.S).group(1)
    assert [k.strip().strip('"') for k in keys.replace("\n", "").split(",")] == tma.UHR_KEYS
