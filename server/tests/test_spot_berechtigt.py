"""Spot auch fuer Sessions, die einer anderen Sportart zugeordnet sind (Jan, 25.10.2026)."""
from types import SimpleNamespace

from app.spots import spot_berechtigt


def _s(**k):
    d = dict(deleted=False, is_pumpfoil=False, sport_class="wingfoil", sport_source="admin",
             needs_classification=False, data_quality="ok", pumpfoil_override=None)
    d.update(k)
    return SimpleNamespace(**d)


def test_zugeordnet_bekommt_spot_auch_ohne_pumpfoil():
    for quelle in ("owner", "admin", "default", "file"):
        assert spot_berechtigt(_s(sport_source=quelle), 3)
    assert spot_berechtigt(_s(sport_class="pumpfoil", is_pumpfoil=True), 1)   # bisheriger Weg unveraendert


def test_kein_spot_fuer_aussortierte_offene_und_ohne_laeufe():
    assert not spot_berechtigt(_s(), 0)
    assert not spot_berechtigt(_s(deleted=True), 3)
    assert not spot_berechtigt(_s(sport_source="auto"), 3)            # nur vorgeschlagen
    assert not spot_berechtigt(_s(needs_classification=True), 3)      # noch nicht zugeordnet
    assert not spot_berechtigt(_s(data_quality="junk"), 3)            # Datenmuell
    assert not spot_berechtigt(_s(pumpfoil_override=False), 3)        # aussortiert
    assert not spot_berechtigt(_s(sport_class="other"), 3)            # Sammelposten
    assert not spot_berechtigt(_s(sport_class="pumpfoil"), 3)         # Pumpfoil, aber Erkennung sagt nein
