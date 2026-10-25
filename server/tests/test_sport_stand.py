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
    # Status „nein" wird nicht ausgeliefert (Jan 19.10.: nur auflisten, was Sinn macht)
    assert all(m["status"] != "nein" for sp in d["sportarten"] for m in sp["merkmale"])
    assert all(m["status"] != "nein" for m in d["allgemein"])
    assert 0 < len(pf["merkmale"]) <= len(ids)
    assert next(m for m in pf["merkmale"] if m["id"] == "erkennung")["status"] == "live"
    wing = next(s for s in d["sportarten"] if s["id"] == "wingfoil")
    assert next(m for m in wing["merkmale"] if m["id"] == "karte")["status"] == "live"
    # Sportartuebergreifendes steht nur im Abschnitt „All sports", nicht je Sportart
    allg = {m["id"] for m in d["allgemein"]}
    assert {"sport_auf_uhr", "equipment_je_sport", "lauf_sportart"} <= allg
    assert not allg & {m["id"] for m in wing["merkmale"]}
    assert set(buch["allgemein"]["merkmale"]) == {m["id"] for m in buch["merkmale_allgemein"]}


def test_profil_pumpfoil_unveraendert_wind_ganz():
    """Stufe 1: Pumpfoil (und alles Unbekannte) behaelt das bisherige Verhalten."""
    from app.sportprofil import GRUPPE, profil
    alt = {"karte": "laeufe", "hauptzahl": "foil", "pumpzahlen": True, "tempo_skala": [8, 25]}
    for sc in (None, "", "pumpfoil", "unbekannt"):
        p = profil(sc)
        assert p["gruppe"] == "pump" and {k: p[k] for k in alt} == alt
    for sc in ("wingfoil", "kitefoil", "parawing"):
        assert profil(sc) == {"gruppe": "wind", "karte": "ganz", "hauptzahl": "gesamt", "pumpzahlen": False,
                              "tempo_skala": [10, 40], "foil": True}
    # Wind ohne Foil (25.10.2026): gleiches Profil, nur foil=False
    for sc in ("kitesurf", "windsurf", "snowkite", "kite_atb", "kitebuggy"):
        assert profil(sc) == {"gruppe": "wind", "karte": "ganz", "hauptzahl": "gesamt", "pumpzahlen": False,
                              "tempo_skala": [10, 40], "foil": False}
    for sc in ("foil_scoot", "surf_wave"):
        assert {k: profil(sc)[k] for k in alt} == alt
    # SUP und Wake thief: nur der Kartenschalter weicht ab (20.10.2026)
    for sc in ("sup_paddle", "wakethief", "surf_downwind"):
        assert {k: profil(sc)[k] for k in alt} == {**alt, "karte": "ganz"}
    for sc in ("efoil", "foildrive", "towed"):
        assert profil(sc)["pumpzahlen"] is False and profil(sc)["tempo_skala"] == [8, 30]
    # eFoil/Foildrive fahren durchgehend (ganze Fahrt), Towed bleibt bei Laeufen (19.10.2026)
    assert profil("efoil")["karte"] == "ganz" and profil("foildrive")["hauptzahl"] == "gesamt"
    assert profil("towed")["karte"] == "laeufe" and profil("towed")["hauptzahl"] == "foil"


def test_profil_gruppen_wie_im_buch():
    import json
    from app.api.appmeta import _SPORT_STAND
    from app.sportprofil import GRUPPE
    buch = json.load(open(_SPORT_STAND, encoding="utf-8"))
    assert {sp["id"]: sp["gruppe"] for sp in buch["sportarten"]} == GRUPPE



def test_releases_ohne_sportzeile(client):
    """Die Ersatzzeile fuer alte Apps ist wieder raus (Jan 19.10.); `ohne_sport` stoert nicht."""
    for url in ("/api/app/releases", "/api/app/releases?ohne_sport=1"):
        assert all(z["name"] != "Analysis by sport" for z in client.get(url).json()["next"])


def test_plattform_zeile():
    from app.api.appmeta import _APP_META, _plattform_zeile
    live = _APP_META["android"]["latest"]
    z = _plattform_zeile({"web": "2026-10-19", "android": live, "ios": ""})
    assert z == f"website since October 19, 2026, Android {live}, iOS coming next"
    assert _plattform_zeile({"ios": "99.0.0"}) == "iOS 99.0.0"


def test_rekorde_wind_mit_gesamtstrecke(client):
    """Wind-Sportarten bekommen den Rekord „laengste Fahrt (gesamt)"; Pumpfoil bleibt wie es war."""
    r = client.post("/api/auth/register", json={"email": "rekwind@t.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    w = client.get("/api/community/records?sport=wingfoil&period=all", headers=auth).json()
    p = client.get("/api/community/records?sport=pumpfoil&period=all", headers=auth).json()
    assert "session_total" in w["all"] and "session_total" not in p["all"]


def test_nicht_oeffentliche_merkmale_fehlen():
    """`oeffentlich: false` (20.10.2026): Merkmal bleibt im Buch, erscheint aber nirgends in der Ausgabe."""
    from app.api.appmeta import sport_stand_aufgeloest
    d = sport_stand_aufgeloest()
    assert "autofahrt" not in {m["id"] for m in d["merkmale"]}
    assert all(w["id"] != "autofahrt" for sp in d["sportarten"] for w in sp["merkmale"])


def test_sup_ohne_foil_gruppe_paddel():
    """SUP ohne Foil (25.10.2026): eigene Gruppe paddel, ganze Fahrt, keine Pumps, Fahrten-Erkennung ohne Modell."""
    from app.analysis import _gps_only_ok
    from app.analysis.paddellauf import v2_parameter
    from app.sportprofil import profil
    from app.sportrekorde import JE_SPORT
    assert profil("sup") == {"gruppe": "paddel", "karte": "ganz", "hauptzahl": "gesamt", "pumpzahlen": False,
                             "tempo_skala": [2, 12], "foil": False}
    assert profil("sup_paddle")["gruppe"] == "pump" and profil("sup_paddle")["foil"] is True
    kw = v2_parameter()
    assert kw["use_model"] is False and kw["move_floor_mps"] < 1.0 and kw["enter_speed"] < 1.0
    assert _gps_only_ok("cycling", "sup") and not _gps_only_ok("cycling", "sup_paddle")
    assert [m.key for m in JE_SPORT["sup"]] == ["ride_longest", "ride_farthest"]


def test_land_sportarten_ohne_gewaessersuche(monkeypatch):
    """Snowkite, Kite-ATB, Kitebuggy (25.10.2026): Spot-Name nur aus dem Ort, keine Gewaesser-/Ufer-Abfrage."""
    from app import places, spots
    from app.sportarten import LAND
    assert LAND == {"snowkite", "kite_atb", "kitebuggy"}

    def verboten(*a, **k):
        raise AssertionError("Gewaessersuche bei Land-Sportart")
    monkeypatch.setattr(places, "lookup_water_name", verboten)
    monkeypatch.setattr(places, "lookup_shore_name", verboten)
    monkeypatch.setattr(places, "lookup_place_name", lambda lat, lon, **k: "Sankt Peter-Ording")
    assert spots.name_for(54.3, 8.6, land=True) == ("Sankt Peter-Ording", "town", None)
    assert spots.ist_land("kitebuggy") and not spots.ist_land("kitesurf") and not spots.ist_land(None)


def test_zu_schnelle_laeufe_bleiben_sichtbar():
    """Physik-Schranke (25.10.2026): verworfene Laeufe kommen zurueck, damit sie in „automatisch aussortiert" stehen."""
    from app.analysis.gps import gate_mit_verworfenen
    ok = {"t_start_ms": 0, "t_end_ms": 10_000, "max_speed_mps": 10.0, "avg_speed_mps": 8.0}
    schnell = {"t_start_ms": 20_000, "t_end_ms": 40_000, "max_speed_mps": 25.0, "avg_speed_mps": 15.0}
    kept, weg = gate_mit_verworfenen([ok, schnell], run_max_kmh=65.0, max_foil=55.0 / 3.6)
    assert kept == [ok] and weg == [schnell]
