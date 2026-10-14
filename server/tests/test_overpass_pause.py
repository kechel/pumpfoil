"""Overpass: nach einem Komplettausfall wird eine Weile gar nicht mehr gefragt (14.10.2026).

Sonst wartet jede synchrone Neuanalyse (z. B. Sportart umstellen) erneut ueber eine Minute auf
Timeouts, und die Apps geben vorher auf.
"""
import urllib.request

from app import places

# Beim Einsammeln holen — das autouse-Fixture in conftest.py ersetzt places._overpass erst danach.
_ECHT = places._overpass


def test_nach_komplettausfall_keine_weiteren_versuche(monkeypatch):
    aufrufe = []

    def kaputt(*a, **k):
        aufrufe.append(1)
        raise OSError("weg")

    monkeypatch.setattr(urllib.request, "urlopen", kaputt)
    monkeypatch.setattr("time.sleep", lambda s: None)
    monkeypatch.setattr(places, "_alle_weg_bis", 0.0)

    assert _ECHT("q", timeout=1) is None
    erste_runde = len(aufrufe)
    assert erste_runde == 2 * len(places.OVERPASS_URLS)   # alle Instanzen, je 2 Versuche

    assert _ECHT("q", timeout=1) is None
    assert len(aufrufe) == erste_runde                    # Pause: kein neuer Netz-Versuch

    # Nach der Pause wird wieder gefragt.
    monkeypatch.setattr(places, "_alle_weg_bis", 0.0)
    assert _ECHT("q", timeout=1) is None
    assert len(aufrufe) == 2 * erste_runde
