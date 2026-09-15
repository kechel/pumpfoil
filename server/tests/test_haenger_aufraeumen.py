"""Der Aufraeum-Lauf fuer Sessions, die auf `complete` haengengeblieben sind.

`complete` heisst: die Uhr hat `/complete` geschickt und darf ihre Kopie loeschen. Fertig ist
die Session damit nicht — die finale Analyse laeuft hinterher. Stirbt sie, bleibt die Aufnahme
in diesem Zwischenzustand haengen: „wird verarbeitet" in der Liste, keine Benachrichtigung, kein
Auto-Zuschnitt, aus der Community ausgeblendet. Passiert am 15.09.2026 an #8517 und #8504.

Geprueft wird `ingest.haenger_faellig` — die Entscheidung selbst, nicht eine Kopie davon im
Aufraeum-Skript. (Genau der Fehler, der am 14.09. einen Test gruen liess, waehrend Nutzer-Uploads
haengen blieben: er prueffte eine reine Funktion statt des Weges.)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest


def _session(status: str, alter_min: int, geloescht: bool = False):
    """Eine Session-Attrappe — `haenger_faellig` liest nur diese vier Felder."""
    class S:
        pass
    s = S()
    s.status = status
    s.deleted = geloescht
    s.updated_at = datetime.now(timezone.utc) - timedelta(minutes=alter_min)
    s.created_at = s.updated_at
    return s


def test_haenger_wird_aufgesammelt():
    from app.api.ingest import haenger_faellig
    assert haenger_faellig(_session("complete", 60)) is True


def test_frisch_abgeschlossene_bleibt_in_ruhe():
    """Eine gerade laufende finale Analyse braucht Minuten — ihr nicht in den Ruecken fallen."""
    from app.api.ingest import haenger_faellig
    assert haenger_faellig(_session("complete", 2)) is False


@pytest.mark.parametrize("status", ["recording", "live", "analyzed"])
def test_nur_complete(status):
    """`live`/`recording`: die Uhr haelt evtl. noch Daten — ein verfruehter Abschluss saegte sie ab.
    `analyzed` ist fertig und hat hier nichts verloren."""
    from app.api.ingest import haenger_faellig
    assert haenger_faellig(_session(status, 600)) is False


def test_geloeschte_nie():
    from app.api.ingest import haenger_faellig
    assert haenger_faellig(_session("complete", 600, geloescht=True)) is False


def test_ohne_zeitstempel_sofort_faellig():
    """Kein Stempel = wir wissen nichts ueber die Ruhe; dann lieber abschliessen als haengen lassen."""
    from app.api.ingest import haenger_faellig
    s = _session("complete", 0)
    s.updated_at = None
    s.created_at = None
    assert haenger_faellig(s) is True


def test_naive_zeitstempel_werden_als_utc_gelesen():
    """Postgres liefert tz-aware, ein Altbestand koennte naiv sein — kein TypeError."""
    from app.api.ingest import haenger_faellig
    s = _session("complete", 600)
    s.updated_at = s.updated_at.replace(tzinfo=None)
    assert haenger_faellig(s) is True
