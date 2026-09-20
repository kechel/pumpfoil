"""Beim Anlegen eines Stabs wird ein vorhandener Eintrag ZUGEORDNET statt gedoppelt.

Anlass (Jan, 20.09.2026): von zwoelf privat angelegten Stabs waren zwei Produkte, die laengst im
Katalog stehen — `Gong Stab Fluid H L` und `Gong Stab Trail L`. Wer sein Teil nicht findet, legt
es privat an, und dann steht dasselbe Produkt zweimal da. Der Endpunkt erkannte bis hierher nur
ZEICHENGLEICHE Eingaben.

Geprueft wird gegen den ECHTEN geseedeten Katalog (conftest ruft `init_db`), nicht gegen
Testzeilen — so faellt auch auf, wenn sich eine Bezeichnung im Katalog aendert.
"""
import pytest


def _login(client, mail):
    client.post("/api/auth/register", json={"email": mail, "password": "geheim123", "name": "T"})
    tok = client.post("/api/auth/login",
                      json={"email": mail, "password": "geheim123"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def _katalog_id(client, auth, brand, model, size):
    """Die id der Katalogzeile holen — ueber die normale Suche, wie ein Nutzer sie faende."""
    treffer = [s for s in client.get("/api/stabs", params={"q": f"{brand} {model} {size}"},
                                     headers=auth).json()
               if s["brand"] == brand and s["model"] == model and s["size"] == size]
    assert len(treffer) == 1, f"Katalogzeile {brand}/{model}/{size} nicht eindeutig: {treffer}"
    return treffer[0]["id"]


@pytest.mark.parametrize("nr,brand,model,size", [
    (1, "TAKOON", "Foil Stab Glide", "220"),   # zeichengleich
    (2, "Takoon", "foil stab glide", "220"),   # nur Gross-/Kleinschreibung
    (3, "Takoon", "Glide 220", "220"),         # Worte fehlen, Groesse steckt im Modell
    (4, "takoon", "220 glide", ""),            # andere Reihenfolge, ohne Groessenfeld
])
def test_vorhandenen_stab_zuordnen_statt_doppeln(client, nr, brand, model, size):
    auth = _login(client, f"zuordnung{nr}@example.com")
    soll = _katalog_id(client, auth, "TAKOON", "Foil Stab Glide", "220")
    r = client.post("/api/stabs", json={"brand": brand, "model": model, "size": size}, headers=auth)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["id"] == soll, f"{brand}/{model}/{size} haette zugeordnet werden muessen, kam {d}"
    assert d["matched"] is True
    assert d["is_own"] is False


def test_echte_meldungen_aus_dem_bestand(client):
    """Die beiden Faelle, die den Anlass gaben, plus die Naish-Meldung."""
    auth = _login(client, "bestand@example.com")
    for eingabe, katalog in (
        (("Gong", "Stab fluid H L", "L"), ("Gong", "Stab Fluid H", "L")),
        (("NAISH", "2D", "250"), ("Naish", "2D Stabilizer", "250")),
    ):
        soll = _katalog_id(client, auth, *katalog)
        r = client.post("/api/stabs", json=dict(zip(("brand", "model", "size"), eingabe)),
                        headers=auth)
        assert r.status_code == 201, r.text
        assert r.json()["id"] == soll, f"{eingabe} -> {r.json()}"
        assert r.json()["matched"] is True


def test_mehrdeutig_legt_lieber_privat_an(client):
    """`Gong / Trail / L` passt auf `Stab Trail L` UND auf drei `Tail Wing … Trail L`.

    Mehrdeutig heisst: nicht raten. Lieber ein Duplikat als eine stille Fehlzuordnung.
    """
    auth = _login(client, "mehrdeutig@example.com")
    r = client.post("/api/stabs", json={"brand": "Gong", "model": "Trail", "size": "L"}, headers=auth)
    assert r.status_code == 201, r.text
    assert r.json()["matched"] is False
    assert r.json()["is_own"] is True


def test_vertipper_in_der_marke_bleibt_privat(client):
    """`Naich` ist nicht `Naish` — die Marke muss wortgleich sein, wir raten nicht."""
    auth = _login(client, "vertipper@example.com")
    r = client.post("/api/stabs", json={"brand": "Naich", "model": "2D", "size": "250"}, headers=auth)
    assert r.status_code == 201, r.text
    assert r.json()["matched"] is False
    assert r.json()["is_own"] is True


def test_andere_marke_wird_nie_zugeordnet(client):
    auth = _login(client, "fremdmarke@example.com")
    r = client.post("/api/stabs", json={"brand": "Gong", "model": "Skinny", "size": "360"},
                    headers=auth)
    assert r.status_code == 201, r.text
    assert r.json()["matched"] is False


def test_fremder_privater_eintrag_kollidiert_nicht(client):
    """Zeichengleicher PRIVATER Eintrag eines anderen Nutzers -> 409, nicht zugeordnet."""
    fremd = _login(client, "fremd@example.com")
    a = client.post("/api/stabs", json={"brand": "Eigenbau", "model": "Spezial", "size": "1"},
                    headers=fremd)
    assert a.status_code == 201 and a.json()["is_own"] is True
    ich = _login(client, "ich@example.com")
    r = client.post("/api/stabs", json={"brand": "Eigenbau", "model": "Spezial", "size": "1"},
                    headers=ich)
    assert r.status_code == 409, r.text
