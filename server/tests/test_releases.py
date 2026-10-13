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
    d = r.json()
    # „review" darf LEER sein (30.09.2026: alle Einreichungen freigegeben) — geprueft wird, dass die
    # Antwort steht und jeder Abschnitt so viele Zeilen hat wie seine Quelle in appmeta.
    assert isinstance(d["review"], list) and len(d["review"]) == len(appmeta.IN_REVIEW)
    assert d["live"]


def test_huawei_linien_getrennt():
    """Drei Huawei-Linien, je eigener Schluessel und eigene Versionsnummer (Jan, 13.10.2026)."""
    for k in ("huawei-watch5", "huawei-gt", "huawei-watch34"):
        assert k in appmeta._APP_META, k
        assert k in appmeta.PLATTFORM_NAMEN, k
        assert any(k in schl for schl, _ in appmeta.GRUPPEN), k


def test_watch5_hinweis_findet_seinen_schluessel():
    """Die eingereichte Watch-5-App fragt mit p=huawei — der Update-Hinweis muss trotzdem unter
    "huawei-watch5" nachsehen, sonst bekaeme sie nie einen."""
    from types import SimpleNamespace
    from app.api.devices import _plat_fuer_hinweis
    geraet = SimpleNamespace(platform="huawei", part_number=None)
    assert _plat_fuer_hinweis("huawei", geraet) == "huawei-watch5"
    assert _plat_fuer_hinweis(None, geraet) == "huawei-watch5"
    assert _plat_fuer_hinweis("zepp", geraet) == "zepp"
