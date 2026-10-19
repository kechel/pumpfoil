"""Tempo je Windstaerke + Wenden/Halsen-Verlauf (19.10.2026): ohne Daten nichts, nie ein Fehler."""


def _konto(client, name):
    r = client.post("/api/auth/register", json={"email": f"{name}@verlauf.de", "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_verlauf_leer(client):
    auth = _konto(client, "verlaufleer")
    assert client.get("/api/sessions/manoever-verlauf", headers=auth).json() == {"monate": []}


def test_tempo_je_wind_ohne_wind():
    from types import SimpleNamespace
    from app.api.sessions import _tempo_je_wind
    s = SimpleNamespace(sport_class="wingfoil", user_id=1, id=1)
    assert _tempo_je_wind(None, s, None) is None
    assert _tempo_je_wind(None, SimpleNamespace(sport_class="pumpfoil", user_id=1, id=1),
                          {"mittel": {"kmh_mittel": 15.0}}) is None
