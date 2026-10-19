"""Stand-Buch je Sportart (19.10.2026): vollstaendig, keine internen Notizen nach draussen."""
import json


def test_buch_vollstaendig_und_ohne_notizen(client):
    from app.api.appmeta import _SPORT_STAND
    from app.api.sessions import SPORTS
    buch = json.load(open(_SPORT_STAND, encoding="utf-8"))
    ids = {m["id"] for m in buch["merkmale"]}
    status = set(buch["status_en"])
    for g in buch["gruppen"].values():
        assert set(g["merkmale"]) == ids, "jede Gruppe beschreibt jedes Merkmal"
        assert all(e["status"] in status for e in g["merkmale"].values())
    for sp in buch["sportarten"]:
        assert sp["gruppe"] in buch["gruppen"]
        assert set(sp.get("merkmale") or {}) <= ids
        assert all(e["status"] in status for e in (sp.get("merkmale") or {}).values())
    # Jede waehlbare Sportart steht drin (ausser „other")
    assert {sp["id"] for sp in buch["sportarten"]} == set(SPORTS) - {"other"}

    r = client.get("/api/app/sport-status")
    assert r.status_code == 200
    d = r.json()
    assert "notiz" not in r.text and "verlauf" not in d and "stufen" not in d
    pf = next(s for s in d["sportarten"] if s["id"] == "pumpfoil")
    assert len(pf["merkmale"]) == len(ids)
    assert next(m for m in pf["merkmale"] if m["id"] == "erkennung")["status"] == "live"
    wing = next(s for s in d["sportarten"] if s["id"] == "wingfoil")
    assert next(m for m in wing["merkmale"] if m["id"] == "karte")["status"] == "geplant"
