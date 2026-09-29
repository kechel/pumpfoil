"""Erkennung v3 als Veto (nicht live): verwirft nur Laeufe, in denen Stufe A im Mittel unsicher
ist, und laesst Grenzen und alle anderen Laeufe unangetastet. Synthetisch, ohne Modelldatei."""
from types import SimpleNamespace

import numpy as np

from app.analysis.v3 import stufe_a, veto


def _tb(n=200):
    return SimpleNamespace(t_gps_ms=np.arange(n) * 1000.0, has_accel=True, gps=[None] * n)


def test_verwirft_nur_den_unsicheren_lauf(monkeypatch):
    p = np.full(200, 0.95)
    p[100:130] = 0.05                    # z. B. die Parkplatzrunde
    monkeypatch.setattr(stufe_a, "wahrscheinlichkeit", lambda tb, fahrer=None: p)
    segs = [{"t_start_ms": 10_000, "t_end_ms": 60_000}, {"t_start_ms": 102_000, "t_end_ms": 128_000}]
    behalten, weg = veto.pruefen(_tb(), segs)
    assert [s["t_start_ms"] for s in behalten] == [10_000]
    assert [s["t_start_ms"] for s in weg] == [102_000]
    assert behalten[0]["t_end_ms"] == 60_000          # Grenzen bleiben, wie v2 sie fand
    assert weg[0]["v3_p"] < veto.SCHWELLE


def test_ohne_beschleunigung_bleibt_alles(monkeypatch):
    monkeypatch.setattr(stufe_a, "wahrscheinlichkeit", lambda tb, fahrer=None: None)
    segs = [{"t_start_ms": 0, "t_end_ms": 5000}]
    assert veto.pruefen(_tb(), segs) == (segs, [])


def test_session_zeit_hat_vorrang(monkeypatch):
    p = np.zeros(200); p[150:190] = 1.0
    monkeypatch.setattr(stufe_a, "wahrscheinlichkeit", lambda tb, fahrer=None: p)
    # t_start_ms auf den Zuschnitt bezogen (0), die Session-Zeit ist die Wahrheit
    segs = [{"t_start_ms": 0, "t_end_ms": 30_000, "t_start_session_ms": 155_000, "t_end_session_ms": 185_000}]
    behalten, weg = veto.pruefen(_tb(), segs)
    assert len(behalten) == 1 and not weg
