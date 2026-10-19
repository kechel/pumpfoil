"""Hinweis „sieht nach Wind aus" (19.10.2026): nur bei schnell + lang, nie nach eigener Wahl, wegklickbar."""
import json
from types import SimpleNamespace


def _s(**kw):
    regel = kw.pop("regel", {"tempo_med": 23.0, "dauer_med": 120})
    user = SimpleNamespace(settings_json=json.dumps(kw.pop("einst", {})))
    d = dict(id=1, sport_class="pumpfoil", sport_source="default", data_quality="ok", needs_classification=False,
             result=SimpleNamespace(metrics_json=json.dumps({"sportregel": regel})), user=user)
    d.update(kw)
    return SimpleNamespace(**d)


def test_hinweis_regeln():
    from app.api.sessions import _wind_vorschlag
    v = _wind_vorschlag(_s(einst={"default_sport_class": "pumpfoil", "my_sports": ["kitefoil"]}))
    assert v and v["sportarten"][0] == "kitefoil"                      # eigene Wind-Sportart zuerst
    assert _wind_vorschlag(_s(regel={"tempo_med": 16.0, "dauer_med": 200})) is None   # zu langsam
    assert _wind_vorschlag(_s(regel={"tempo_med": 25.0, "dauer_med": 30})) is None    # zu kurze Laeufe
    assert _wind_vorschlag(_s(sport_source="owner")) is None            # Mensch hat gewaehlt
    assert _wind_vorschlag(_s(sport_class="wingfoil")) is None           # ist schon Wind
    assert _wind_vorschlag(_s(needs_classification=True)) is None        # „Sportart klaeren" fragt schon
    assert _wind_vorschlag(_s(einst={"wind_hinweis_weg": [1]})) is None  # weggeklickt
    assert _wind_vorschlag(_s(id=9, einst={"wind_hinweis_weg": [1, 2, 3, 4, 5]})) is None   # Bremse


def test_wegklicken_endpunkt(client):
    r = client.post("/api/auth/register", json={"email": "windhinweis@x.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.post("/api/sessions/999999/wind-hinweis-weg", headers=auth).status_code == 404
