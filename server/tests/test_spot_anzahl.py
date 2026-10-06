"""Banner-Spotzahl und Spots-Seite muessen dieselbe Zahl zeigen (26.08.: 196/198 gegen 203;
06.10.2026: 546 gegen 514). Seit 06.10. zaehlt der Banner genau die Eintraege der Karte."""
from __future__ import annotations


def test_banner_zaehlt_die_eintraege_der_karte(monkeypatch):
    import app.api.community as C
    gesehen = {}

    def fake(db, viewer_id, accel_only, sport):
        gesehen.update(viewer_id=viewer_id, accel_only=accel_only, sport=sport)
        return [{"spot": "A"}, {"spot": "B"}, {"spot": "C"}]

    monkeypatch.setattr(C, "_spot_eintraege", fake)
    assert C._spot_anzahl(None) == 3
    # Fuer alle gleich: ohne Betrachter, alle Sportarten, inkl. GPS-only — wie die Spots-Seite.
    assert gesehen == {"viewer_id": None, "accel_only": False, "sport": "all"}
