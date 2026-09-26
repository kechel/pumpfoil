"""Die Release-Tabelle auf /changelog darf nie an einem Eintrag scheitern.

Am 26.09.2026 fehlten "Wear OS" und "Android phone" in `PRUEFER`: `_note` warf einen KeyError,
`/api/app/releases` antwortete 500 und die ganze Tabelle verschwand von der Seite.
"""
from app.api import appmeta


def test_jeder_eintrag_hat_einen_pruefer():
    for e in appmeta.IN_REVIEW + appmeta.NAECHSTES:
        assert e["name"] in appmeta.PRUEFER, e["name"]


def test_eingereicht_steht_im_review():
    for e in appmeta.IN_REVIEW:
        assert e.get("eingereicht") or e.get("freigegeben"), e["name"]


def test_releases_antwortet(client):
    r = client.get("/api/app/releases")
    assert r.status_code == 200, r.text
    assert r.json()["review"]
