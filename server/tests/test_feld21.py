"""Feld 21 („Letzter Lauf: Max Puls") ueberlebt das Speichern einer klassischen Seite.

Bis 28.09.2026 kannte `settings.VALID_FIELD_IDS` nur 0–20; die 21 fiel beim Speichern stumm weg,
in allen drei Zustaenden (auf dem Foil, zwischen den Laeufen, Pause) — der Layout-Editor
(`layouts.py`) akzeptierte sie laengst.
"""


def test_feld_21_bleibt_auf_klassischen_seiten(client):
    r = client.post("/api/auth/register", json={"email": "feld21@t.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    # Klassische Einzelseiten (aeltere Apps, Lite-Uhren)
    r = client.put("/api/settings", headers=auth, json={
        "views": [[1, 21, 0]], "off_foil_view": [12, 21, 16], "pause_view": [21, 20, 2]})
    assert r.status_code == 200, r.text
    s = client.get("/api/settings", headers=auth).json()
    assert s["views"] == [[1, 21, 0]]
    assert s["off_foil_view"] == [12, 21, 16] and s["pause_view"] == [21, 20, 2]
    # Seiten-Saetze
    r = client.put("/api/settings", headers=auth, json={
        "pages": [[1, 21, 2]], "off_foil_pages": [[21, 17, 16]], "pause_pages": [[12, 20, 21]]})
    assert r.status_code == 200, r.text
    s = client.get("/api/settings", headers=auth).json()
    assert s["pages"] == [[1, 21, 2]]
    assert s["off_foil_pages"] == [[21, 17, 16]] and s["pause_pages"] == [[12, 20, 21]]
    # 24 gibt es nicht — faellt weiter weg (22/23 seit 29.09.2026, s. unten)
    client.put("/api/settings", headers=auth, json={"views": [[1, 24, 2]]})
    assert client.get("/api/settings", headers=auth).json()["views"] == [[1, 2, 0]]


def test_felder_22_23_alle_laeufe(client):
    """Strecke/Zeit ueber alle Laeufe (Wunsch Roman, 28.09.2026) — klassisch und im Layout-Katalog."""
    from app.api import layouts
    r = client.post("/api/auth/register", json={"email": "feld2223@t.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.put("/api/settings", headers=auth, json={"views": [[22, 23, 1]], "off_foil_view": [22, 23, 12]})
    assert r.status_code == 200, r.text
    s = client.get("/api/settings", headers=auth).json()
    assert s["views"] == [[22, 23, 1]] and s["off_foil_view"] == [22, 23, 12]
    assert {22, 23} <= layouts.VALID_FIELD_IDS and 24 not in layouts.VALID_FIELD_IDS
