"""Die EINE Sportartenliste (data/sportarten.json, app/sportarten.py, GET /api/app/sports — 25.10.2026)."""
from app import sportarten as SA

SPRACHEN = {"en", "de", "de-AT", "gsw", "fr", "it", "es", "pt", "pt-PT", "nl", "nb", "fi", "cs", "pl", "ru", "ja", "zh", "id"}


def test_liste_ist_gueltig():
    assert SA.SPORTS[-1] == "other"
    assert len(set(SA.SPORTS)) == len(SA.SPORTS)
    assert all(len(i) <= 16 for i in SA.SPORTS + SA.SPORTS_LEGACY)       # DB-Spalte String(16)
    assert all(g in ("pump", "wind", "welle", "motor", "paddel") for g in SA.GRUPPE.values())
    for e in SA.EINTRAEGE:
        assert set(e["namen"]) == SPRACHEN, (e["id"], SPRACHEN - set(e["namen"]))
        if e.get("rekorde"):
            from app.sportrekorde import SAETZE
            assert e["rekorde"] in SAETZE


def test_endpunkt_liefert_liste_mit_profil(client):
    r = client.get("/api/app/sports")
    assert r.status_code == 200
    d = r.json()
    assert [x["id"] for x in d["sportarten"]] == list(SA.SPORTS)
    w = next(x for x in d["sportarten"] if x["id"] == "wingfoil")
    assert w["gruppe"] == "wind" and w["profil"]["karte"] == "ganz" and w["namen"]["de"]
    assert d["version"]
