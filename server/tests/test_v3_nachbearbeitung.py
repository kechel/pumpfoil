"""Erkennung v3, Nachbearbeitung: neue Stuecke muessen die Grenzen der Profil-Empfindlichkeit
erfuellen (Dauer + Schnitt des Stuecks NACH dem Modell); bestehende v2-Laeufe bleiben (03.10.2026)."""
from app.analysis.v3 import nachbearbeitung as N


def _seg(a, b, kmh, v3=True):
    s = {"t_start_session_ms": a * 1000, "t_end_session_ms": b * 1000, "duration_s": float(b - a),
         "avg_speed_mps": kmh / 3.6}
    if v3:
        s["v3"] = N.VERSION
    return s


def test_tief_kandidaten_ohne_altes_modell():
    assert N.TIEF_KW.get("use_model") is False


def test_normal_verlangt_5_s_und_10_kmh():
    v2 = [_seg(0, 20, 12, v3=False)]
    segs = [v2[0], _seg(100, 104, 12), _seg(200, 206, 9), _seg(300, 306, 11)]
    behalten = N.nach_empfindlichkeit(segs, v2, "normal")
    assert [s["t_start_session_ms"] for s in behalten] == [0, 300_000]


def test_attempts_laesst_kurze_stuecke_zu():
    segs = [_seg(100, 102.5, 8.5), _seg(200, 201, 9)]
    behalten = N.nach_empfindlichkeit(segs, [], "attempts")
    assert [s["t_start_session_ms"] for s in behalten] == [100_000]


def test_stueck_eines_v2_laufs_bleibt_auch_wenn_kurz():
    v2 = [_seg(0, 30, 12, v3=False)]
    teil = _seg(10, 13, 9)                 # vom Modell zerlegter Rest eines bestehenden Laufs
    assert N.nach_empfindlichkeit([teil], v2, "normal") == [teil]


def test_zurueckgeholtes_bleibt():
    g = _seg(100, 102, 5)
    assert N.nach_empfindlichkeit([g], [], "normal", [g]) == [g]


def test_stueck_im_aussortierten_fenster_faellt_weg():
    # Kandidat 100-130 s ueberspannt das aussortierte Loch 110-118 s (Jans #12982)
    assert N.ohne_ausschluss([(100_000, 130_000)], [(110_000, 118_000)]) == [(100_000, 110_000), (118_000, 130_000)]
    # Stueck komplett im Loch -> weg
    assert N.ohne_ausschluss([(111_000, 117_000)], [(110_000, 118_000)]) == []
    # Rest kuerzer als MIN_S -> weg
    assert N.ohne_ausschluss([(108_000, 120_000)], [(110_000, 118_000)]) == []


def test_ohne_randschnitt_verlaengert_nur_die_raender():
    """Zepp (16.10.2026): behaelt v3 mindestens die Haelfte eines v2-Laufs, reichen erstes und
    letztes Stueck bis an dessen Raender; eine Luecke in der Mitte bleibt; unter der Haelfte und
    neue Stuecke bleiben wie v3 sie sieht."""
    from app.analysis.v3.nachbearbeitung import ganze_v2_laeufe
    s = lambda a, b, **kw: {"t_start_session_ms": a, "t_end_session_ms": b, **kw}  # noqa: E731
    v2 = [s(0, 20000), s(100000, 120000), s(300000, 400000)]
    v3 = [s(3000, 15000, v3=1), s(100000, 105000, v3=1), s(200000, 210000, v3=1),
          s(310000, 340000, v3=1), s(360000, 390000, v3=1)]
    out = ganze_v2_laeufe(v3, v2)
    assert [(x["t_start_session_ms"], x["t_end_session_ms"]) for x in out] == \
        [(0, 20000), (100000, 105000), (200000, 210000), (300000, 340000), (360000, 400000)]
