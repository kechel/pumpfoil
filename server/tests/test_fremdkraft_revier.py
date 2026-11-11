"""Fremdkraft-Regel (detect_v2._fremdkraft_laeufe): Gegenbeweise seit 11.11.2026.

- Mit Accel (Modell hat den Lauf gesehen) entscheidet im Pumpfoil-Tempo das Modell, nicht der Puls.
- Ohne Accel: liegt der Lauf auf Pumpfoil-Heatmap-Zellen anderer Sessions und im Pumpfoil-Tempo, greift die
  Puls-Regel nicht (app/analysis/revier.py). Schneller oder abseits jedes Reviers bleibt alles wie bisher.
"""
import numpy as np

from app.analysis import detect_v2


def _lauf(kmh: float, dauer_s: int = 400):
    n = dauer_s + 200
    t = np.arange(n, dtype=float) * 1000.0
    # 100 s Ruhe davor (Puls 120), dann der Lauf mit gleichem Puls (keine Antwort), dann 100 s danach
    hr = np.full(n, 120.0) + (np.arange(n) % 3)          # lebt (kein eingefrorener Wert)
    seg = {"t_start_ms": 100_000.0, "t_end_ms": float(100_000 + dauer_s * 1000), "duration_s": float(dauer_s),
           "avg_speed_mps": kmh / 3.6, "i_start": 100, "i_end": 100 + dauer_s}
    lat = np.linspace(47.8, 47.81, n)
    lon = np.linspace(9.3, 9.31, n)
    return [seg], t, hr, np.zeros(n), lat, lon


def test_ohne_gegenbeweis_bleibt_fremdkraft(monkeypatch):
    monkeypatch.setattr("app.analysis.revier.anteil_auf_revier", lambda lat, lon, sid: 0.0)
    segs, t, hr, ger, lat, lon = _lauf(13.0)
    behalten, fremd = detect_v2._fremdkraft_laeufe(segs, t, hr, ger, lat=lat, lon=lon, session_id=1)
    assert behalten == [] and len(fremd) == 1


def test_auf_pumpfoil_revier_im_pumpfoil_tempo_zaehlt(monkeypatch):
    monkeypatch.setattr("app.analysis.revier.anteil_auf_revier", lambda lat, lon, sid: 0.95)
    segs, t, hr, ger, lat, lon = _lauf(13.0)
    behalten, fremd = detect_v2._fremdkraft_laeufe(segs, t, hr, ger, lat=lat, lon=lon, session_id=1)
    assert fremd == [] and behalten[0]["fremdkraft_entschieden"] == "revier"


def test_revier_hilft_nicht_ueber_pumpfoil_tempo(monkeypatch):
    monkeypatch.setattr("app.analysis.revier.anteil_auf_revier", lambda lat, lon, sid: 1.0)
    segs, t, hr, ger, lat, lon = _lauf(24.0)
    behalten, fremd = detect_v2._fremdkraft_laeufe(segs, t, hr, ger, lat=lat, lon=lon, session_id=1)
    assert behalten == [] and len(fremd) == 1


def test_mit_modell_entscheidet_im_pumpfoil_tempo_das_modell(monkeypatch):
    monkeypatch.setattr("app.analysis.revier.anteil_auf_revier", lambda lat, lon, sid: 0.0)
    segs, t, hr, ger, lat, lon = _lauf(15.0)
    behalten, fremd = detect_v2._fremdkraft_laeufe(segs, t, hr, ger, lat=lat, lon=lon, session_id=1, mit_modell=True)
    assert fremd == [] and behalten[0]["fremdkraft_entschieden"] == "modell"
    segs, t, hr, ger, lat, lon = _lauf(24.0)        # schneller: wieder der Puls (#17722, abgeschnittene 3,9 Hz)
    behalten, fremd = detect_v2._fremdkraft_laeufe(segs, t, hr, ger, lat=lat, lon=lon, session_id=1, mit_modell=True)
    assert behalten == [] and len(fremd) == 1


def test_kurze_laeufe_werden_nie_beurteilt(monkeypatch):
    monkeypatch.setattr("app.analysis.revier.anteil_auf_revier", lambda lat, lon, sid: 0.0)
    segs, t, hr, ger, lat, lon = _lauf(13.0, dauer_s=100)
    behalten, fremd = detect_v2._fremdkraft_laeufe(segs, t, hr, ger, lat=lat, lon=lon, session_id=1)
    assert fremd == [] and len(behalten) == 1
