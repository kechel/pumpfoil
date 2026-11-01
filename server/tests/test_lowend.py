"""Low End je Lauf (analysis/lowend.py) und die Spalte in den Foil-Stats."""
from app.analysis.lowend import lauf_low_ends


def _lauf(werte):
    return [{"i_start": 0, "i_end": len(werte) - 1}], werte


def test_tal_mit_erholung_zaehlt():
    v = [4.0] * 10 + [2.5] * 12 + [4.0] * 20          # Einbruch in der Mitte, danach wieder schnell
    segs, sp = _lauf(v)
    le = lauf_low_ends(segs, sp)
    assert len(le) == 1 and 2.5 <= le[0] < 2.7


def test_ende_des_laufs_zaehlt_nicht():
    v = [4.0] * 30 + [3.5, 3.0, 2.5, 2.0, 1.5]           # wird nur langsamer und endet
    segs, sp = _lauf(v)
    le = lauf_low_ends(segs, sp)
    assert le == [] or le[0] > 3.5


def test_zu_kurz_liefert_nichts():
    segs, sp = _lauf([4.0] * 20)
    assert lauf_low_ends(segs, sp) == []


def test_start_wird_ausgelassen():
    v = [2.0] * 5 + [4.0] * 15 + [3.0] * 10 + [4.5] * 20
    segs, sp = _lauf(v)
    assert lauf_low_ends(segs, sp)[0] >= 3.0 - 1e-9
