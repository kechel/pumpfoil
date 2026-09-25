"""Die Zusatz-Domains: jede muss abgedeckt sein, und keine darf pumpfoil.org anfassen.

Der Sinn dieser Tests ist nicht die HTML-Ausgabe, sondern die LISTE. Bei Strato liegen 13
Domains; zwoelf davon zeigt der Apache auf lb1 in EINEN vhost. Wenn dort eine dazukommt und
hier vergessen wird, faellt das sonst erst auf, wenn jemand die Adresse aufruft und die
komplette PWA unter fremdem Namen ausgeliefert bekommt (eigene Origin, eigener Anmelde-Token,
nicht registrierte OAuth-Redirects).
"""
from __future__ import annotations

import pytest

from app import landing

# Wortwoertlich aus der Strato-Uebersicht vom 13.09.2026 (13 Eintraege, alle A auf dieselbe
# Adresse), plus wake-thieving.org, am selben Tag dazugekauft. Die Liste ist die Quelle,
# gegen die geprueft wird — nicht umgekehrt.
STRATO = [
    "downwind-foil.org", "foilers.org", "lowkitefoil.org", "paddle-up.org", "paddleup.org",
    "parawing.org", "parawingfoil.org", "pump-foil.org", "pumpfoil.org", "sup-foil.org",
    "supfoil.org", "wake-thief.org", "wake-thieving.org", "wakethief.org",
    # Am 25.09.2026 dazu, als Foil Scoot eine eigene Sportart wurde. Beide
    # Schreibweisen gekauft, beworben wird die ohne Bindestrich.
    "foilscoot.org", "foil-scoot.org",
]


def test_jede_strato_domain_ist_zugeordnet():
    offen = [h for h in STRATO if h != "pumpfoil.org" and landing.fuer_host(h) is None]
    assert offen == [], f"Domain ohne Zuordnung in landing.py: {offen}"


def test_keine_erfundenen_hosts():
    """Umgekehrt: nichts abdecken, was es bei Strato gar nicht gibt."""
    assert set(landing.ALLE_HOSTS) <= set(STRATO)


@pytest.mark.parametrize("host", ["pumpfoil.org", "www.pumpfoil.org", "localhost",
                                  "jan-personal-agent", ""])
def test_pumpfoil_bleibt_unberuehrt(host):
    """Die Hauptdomain darf NIE in dieser Middleware landen — dort wohnt die App."""
    assert landing.fuer_host(host) is None


@pytest.mark.parametrize("alias,ziel", sorted(landing.ALIASSE.items()))
def test_alias_zeigt_auf_die_kanonische_domain(alias, ziel):
    assert landing.fuer_host(alias) == ("umleiten", f"https://{ziel}")
    assert landing.fuer_host("www." + alias) == ("umleiten", f"https://{ziel}")
    assert ziel in landing.KANONISCH


@pytest.mark.parametrize("host", sorted(landing.KANONISCH))
def test_www_wird_umgeleitet_nicht_ausgeliefert(host):
    """Sonst stuende dieselbe Seite zweimal im Suchindex."""
    assert landing.fuer_host("www." + host) == ("umleiten", f"https://{host}")


@pytest.mark.parametrize("host", sorted(landing.SCHUTZ))
def test_schutzdomains_gehen_auf_pumpfoil(host):
    assert landing.fuer_host(host) == ("umleiten", landing.ZIEL)


@pytest.mark.parametrize("seite", landing.SEITEN, ids=lambda s: s.host)
def test_seite_ist_vollstaendig_und_ohne_javascript(seite):
    h = landing.html(seite)
    # Kein Skript, kein Service Worker, kein Manifest — das ist der ganze Punkt der Uebung.
    for verboten in ("<script", "serviceWorker", "manifest.webmanifest", "registerSW"):
        assert verboten not in h, f"{verboten} hat auf einer Landingpage nichts zu suchen"
    # Selbst-kanonisch, damit die Domain ueberhaupt in den Index kommt.
    assert f'<link rel="canonical" href="https://{seite.host}/">' in h
    assert '<meta name="robots" content="index, follow">' in h
    # Und der Weg nach Hause ist drin.
    assert f'href="{landing.ZIEL}/"' in h


@pytest.mark.parametrize("seite", landing.SEITEN, ids=lambda s: s.host)
def test_bild_ist_freigegeben(seite):
    """Bilder muessen in der Positivliste stehen, sonst liefert die Middleware sie nicht aus."""
    assert seite.bild in landing.ASSETS


def test_titel_und_beschreibung_in_suchmaschinenlaenge():
    for s in landing.SEITEN:
        assert len(s.titel) <= 65, f"{s.host}: Titel {len(s.titel)} Zeichen"
        assert 80 <= len(s.beschreibung) <= 165, f"{s.host}: Beschreibung {len(s.beschreibung)}"


def test_robots_und_sitemap_zeigen_auf_die_eigene_domain():
    for s in landing.SEITEN:
        assert f"https://{s.host}/sitemap.xml" in landing.robots(s.host)
        assert f"<loc>https://{s.host}/</loc>" in landing.sitemap(s.host)
