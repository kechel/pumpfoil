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
    assert next(m for m in wing["merkmale"] if m["id"] == "karte")["status"] == "live"


def test_profil_pumpfoil_unveraendert_wind_ganz():
    """Stufe 1: Pumpfoil (und alles Unbekannte) behaelt das bisherige Verhalten."""
    from app.sportprofil import GRUPPE, profil
    alt = {"karte": "laeufe", "hauptzahl": "foil", "pumpzahlen": True}
    for sc in (None, "", "pumpfoil", "unbekannt"):
        p = profil(sc)
        assert p["gruppe"] == "pump" and {k: p[k] for k in alt} == alt
    for sc in ("wingfoil", "kitefoil", "parawing"):
        assert profil(sc) == {"gruppe": "wind", "karte": "ganz", "hauptzahl": "gesamt", "pumpzahlen": False}
    for sc in ("foil_scoot", "wakethief", "surf_wave", "efoil"):
        assert {k: profil(sc)[k] for k in alt} == alt


def test_profil_gruppen_wie_im_buch():
    import json
    from app.api.appmeta import _SPORT_STAND
    from app.sportprofil import GRUPPE
    buch = json.load(open(_SPORT_STAND, encoding="utf-8"))
    assert {sp["id"]: sp["gruppe"] for sp in buch["sportarten"]} == GRUPPE


def test_releases_traegt_sportstand_fuer_alte_apps(client):
    """Alte Apps kennen den Abschnitt nicht -> erste „Coming next"-Zeile; das Web laesst sie weg."""
    alt = client.get("/api/app/releases").json()
    assert alt["next"][0]["name"] == "Analysis by sport"
    assert any(p.startswith("Wingfoil (wind)") for p in alt["next"][0]["items"])
    web = client.get("/api/app/releases?ohne_sport=1").json()
    assert all(z["name"] != "Analysis by sport" for z in web["next"])
    assert len(alt["next"]) == len(web["next"]) + 1
