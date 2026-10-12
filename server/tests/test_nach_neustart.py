"""Welche Sessions holt der Server nach einem Neustart nach? (app/nach_neustart.py)

Anlass #10117 (26.09.2026): der Neustart brach die finale Analyse direkt nach `/complete` ab, die
Session blieb auf `complete`. Nachgeholt wird genau, was VOR dem Start zuletzt angefasst wurde —
eine Auswertung, die mit dem alten Prozess gestorben sein muss.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.nach_neustart import FENSTER_H, nach_neustart_faellig

START = datetime(2026, 9, 26, 7, 3, 40, tzinfo=timezone.utc)


def _s(status="complete", vor_s=20, deleted=False):
    return SimpleNamespace(status=status, deleted=deleted, created_at=None,
                           updated_at=START - timedelta(seconds=vor_s))


def test_abgebrochene_auswertung_wird_nachgeholt():
    assert nach_neustart_faellig(_s(vor_s=20), START) is True     # #10117: 20 s vor dem Neustart


def test_nach_dem_start_angekommen_nicht():
    # Ein Upload NACH dem Start hat seine Auswertung im neuen Prozess, die laeuft gerade.
    assert nach_neustart_faellig(_s(vor_s=-30), START) is False


def test_nur_complete_und_nicht_geloescht():
    assert nach_neustart_faellig(_s(status="analyzed"), START) is False
    assert nach_neustart_faellig(_s(status="live"), START) is False
    assert nach_neustart_faellig(_s(deleted=True), START) is False


def test_aelteres_bleibt_dem_timer():
    assert nach_neustart_faellig(_s(vor_s=FENSTER_H * 3600 + 60), START) is False


def test_ohne_zeitzone_als_utc():
    s = _s(vor_s=20)
    s.updated_at = s.updated_at.replace(tzinfo=None)
    assert nach_neustart_faellig(s, START) is True


# --- Empfindlichkeits-Reanalyse (app/reanalysis.py), seit 12.10.2026 ------------------------------
from app.reanalysis import fortsetzen_faellig  # noqa: E402


def _r(running=True, vor_s=60):
    return SimpleNamespace(running=running, updated_at=START - timedelta(seconds=vor_s))


def test_haengende_reanalyse_wird_fortgesetzt():
    # Jans Fall: running seit zwei Tagen, zuletzt fortgeschrieben lange vor dem Neustart.
    assert fortsetzen_faellig(_r(vor_s=2 * 24 * 3600), START) is True


def test_reanalyse_im_neuen_prozess_nicht():
    # Fortgeschrieben NACH dem Start: der Lauf lebt in diesem Prozess.
    assert fortsetzen_faellig(_r(vor_s=-5), START) is False


def test_fertige_reanalyse_nicht():
    assert fortsetzen_faellig(_r(running=False), START) is False
