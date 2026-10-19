"""COROS-MCP: Tokens rechtzeitig erneuern und Ablauf melden (19.10.2026)."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException


class _Antwort:
    def __init__(self, code, daten=None, text=""):
        self.status_code, self._d, self.text = code, daten or {}, text

    def json(self):
        return self._d


class _Link:
    user_id = 1

    def __init__(self, tage, refresh="rt"):
        self.access_token = "alt"
        self.refresh_token = refresh
        self.expires_at = datetime.now(timezone.utc) + timedelta(days=tage)


class _DB:
    def commit(self):
        pass


@pytest.fixture
def cm(monkeypatch):
    from app.api import coros_mcp
    monkeypatch.setenv("OAUTH_COROS_MCP_CLIENT_ID", "cid")
    aufrufe = []
    coros_mcp._test_aufrufe = aufrufe
    return coros_mcp, aufrufe


def _post(monkeypatch, cm, antwort):
    mod, aufrufe = cm
    monkeypatch.setattr(mod.httpx, "post", lambda *a, **k: (aufrufe.append(k), antwort)[1])


def test_frisches_token_ohne_erneuern(monkeypatch, cm):
    _post(monkeypatch, cm, _Antwort(500))
    link = _Link(29)
    assert cm[0]._frischer_token(link, _DB()) == "alt"
    assert cm[1] == []


def test_frueh_erneuern(monkeypatch, cm):
    _post(monkeypatch, cm, _Antwort(200, {"access_token": "neu", "refresh_token": "rt2", "expires_in": 30 * 86400}))
    link = _Link(20)
    assert cm[0]._frischer_token(link, _DB()) == "neu"
    assert link.refresh_token == "rt2" and link.expires_at > datetime.now(timezone.utc) + timedelta(days=29)


def test_frueher_versuch_scheitert_altes_token_gilt(monkeypatch, cm):
    _post(monkeypatch, cm, _Antwort(400, text='{"error":"invalid_grant"}'))
    link = _Link(10)
    assert cm[0]._frischer_token(link, _DB()) == "alt"
    assert cm[0].ist_abgelaufen(link)            # COROS hat abgelehnt -> markiert
    assert cm[0]._frischer_token(link, _DB()) == "alt"   # bis zum Ablauf weiter nutzbar


def test_nach_ablauf_abgelehnt(monkeypatch, cm):
    _post(monkeypatch, cm, _Antwort(400, text='{"error":"invalid_grant"}'))
    link = _Link(-1)
    with pytest.raises(HTTPException):
        cm[0]._frischer_token(link, _DB())
    assert cm[0].ist_abgelaufen(link)


def test_coros_kurz_weg_markiert_nicht(monkeypatch, cm):
    _post(monkeypatch, cm, _Antwort(503, text="busy"))
    link = _Link(-1)
    with pytest.raises(HTTPException):
        cm[0]._frischer_token(link, _DB())
    assert not cm[0].ist_abgelaufen(link)
