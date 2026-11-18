from app.analysis.gps import buendel_verteilen


def _spur(zeiten):
    return [[t, 46.5 + i * 1e-5, 6.08, 7.5, 0, 5.0] for i, t in enumerate(zeiten)]


def test_buendel_wird_in_die_luecke_verteilt():
    # 10 normale Punkte, dann 20 s Stille, dann 19 Punkte in 18 ms (Zustellzeit)
    zeiten = [i * 1000 for i in range(10)] + [29000 + i for i in range(19)] + [30000 + i * 1000 for i in range(1, 5)]
    neu, n = buendel_verteilen(_spur(zeiten))
    assert n == 1
    t = [p[0] for p in neu]
    assert all(b > a for a, b in zip(t, t[1:]))
    assert t[28] == 29018                       # letzter Punkt behaelt seine Zeit
    assert abs((t[28] - t[10]) - 18000) <= 1    # 19 Punkte, 1 s Abstand
    assert [p[1:] for p in neu] == [p[1:] for p in _spur(zeiten)]   # nur Zeiten geaendert


def test_kurze_luecke_teilt_gleichmaessig():
    zeiten = [0, 1000, 2000, 2001, 2002, 2003, 3000]
    neu, n = buendel_verteilen(_spur(zeiten))
    assert n == 1
    t = [p[0] for p in neu]
    assert t[1] < t[2] < t[3] < t[4] < t[5] == 2003


def test_ohne_buendel_unveraendert():
    sp = _spur([0, 1000, 1010, 1020, 2000, 3000])   # nur 3 Punkte dicht -> kein Buendel
    neu, n = buendel_verteilen(sp)
    assert n == 0 and neu is sp
