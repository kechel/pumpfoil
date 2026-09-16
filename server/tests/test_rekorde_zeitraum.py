"""`GET /api/community/records` — Zeitraum-Parameter und Server-Cache.

Warum das hier festgeschrieben ist (16.09.2026): der Endpunkt lieferte ALLE fuenf Zeitraeume,
obwohl die Community-Seite immer nur einen anzeigt — 268 KB roh, 50 KB gzip, 254 ms Rechenzeit
je Request, und zwar fuer jeden Nutzer neu. Vier Fuenftel davon sah nie jemand. Jan hatte den
Aufruf mit 1,25 s gemessen.

Zwei Eigenschaften duerfen dabei nie wieder verlorengehen:
- OHNE `period` kommen weiter alle fuenf Zeitraeume. Spot- und Foil-Rekorde suchen sich das
  erste Fenster mit Inhalt selbst und brauchen deshalb den ganzen Satz; alte Clients auch.
- MIT `period` kommt GENAU dieser eine Schluessel — und derselbe Inhalt wie im vollen Satz.
  Ein Zeitraum, der einzeln anders gerechnet wird als im Paket, waere schlimmer als langsam.
"""
from __future__ import annotations

from app.api import community


def _konto(client, mail: str) -> dict:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _rekorde(client, auth, **q) -> dict:
    r = client.get("/api/community/records", params=q, headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


def test_ohne_period_kommen_alle_zeitraeume(client):
    auth = _konto(client, "rek-alle@example.com")
    community._rec_cache.clear()
    d = _rekorde(client, auth)
    assert set(d) == set(community.PERIODS)


def test_mit_period_kommt_nur_dieser_zeitraum(client):
    auth = _konto(client, "rek-einer@example.com")
    community._rec_cache.clear()
    d = _rekorde(client, auth, period="10d")
    assert list(d) == ["10d"]
    assert set(d["10d"]) == set(community.METRICS)


def test_einzelner_zeitraum_ist_inhaltlich_derselbe(client):
    """Der Kern: `period=X` darf nicht anders rechnen als der volle Satz."""
    auth = _konto(client, "rek-gleich@example.com")
    community._rec_cache.clear()
    voll = _rekorde(client, auth)
    for p in community.PERIODS:
        community._rec_cache.clear()
        assert _rekorde(client, auth, period=p)[p] == voll[p], p


def test_unbekannter_zeitraum_faellt_auf_alle_zurueck(client):
    """Kein 500 und keine leere Antwort bei Unsinn — dann eben der volle Satz."""
    auth = _konto(client, "rek-quatsch@example.com")
    community._rec_cache.clear()
    assert set(_rekorde(client, auth, period="vorgestern")) == set(community.PERIODS)


def test_cache_greift_und_trennt_die_filter(client):
    auth = _konto(client, "rek-cache@example.com")
    community._rec_cache.clear()
    _rekorde(client, auth, period="all")
    assert len(community._rec_cache) == 1
    # Anderer Zeitraum, andere Sportart, andere Genauigkeit -> jeweils EIGENER Eintrag.
    _rekorde(client, auth, period="10d")
    _rekorde(client, auth, period="all", sport="wingfoil")
    _rekorde(client, auth, period="all", accel_only="false")
    assert len(community._rec_cache) == 4


def test_verstecktes_konto_geht_am_cache_vorbei(client):
    """Versteckte Nutzer sehen ihre eigenen Sessions zusaetzlich (`or_(U.hidden…, U.id == viewer)`).
    Ihr Ergebnis darf deshalb NIE in den geteilten Cache — sonst saehen es alle anderen auch."""
    from app import models
    from app.db import SessionLocal

    auth = _konto(client, "rek-versteckt@example.com")
    db = SessionLocal()
    u = db.query(models.User).filter_by(email="rek-versteckt@example.com").one()
    u.hidden = True
    db.commit()
    db.close()

    community._rec_cache.clear()
    _rekorde(client, auth, period="all")
    assert community._rec_cache == {}
