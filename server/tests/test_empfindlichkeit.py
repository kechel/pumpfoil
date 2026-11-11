"""Empfindlichkeit ohne Einfluss auf die Lauflaenge (Jan 11.11.2026): Standard-Grenzen + nur zusaetzliche Laeufe."""
from app.analysis.empfindlichkeit import zusammenfuehren


def _seg(t0_s, dauer, dist, vmax=4.0):
    return {"type": "foiling", "t_start_session_ms": t0_s * 1000, "duration_s": dauer, "distance_m": dist, "max_speed_mps": vmax}


def test_gleiche_laeufe_bleiben_standard_extra_kommt_dazu():
    std = {"segments": [_seg(100, 30, 100), _seg(300, 60, 220)], "foiling_time_s": 90, "foiling_distance_m": 320,
           "max_speed_mps": 4.5, "metrics": {}}
    emp = {"segments": [_seg(98, 33, 110), _seg(200, 4, 9, 2.6), _seg(298, 63, 230)]}
    r = zusammenfuehren(std, emp)
    assert [s["duration_s"] for s in r["segments"]] == [30, 4, 60]          # Standard-Laeufe unveraendert lang
    assert r["segments"][1]["nur_empfindlich"] is True
    assert r["foiling_time_s"] == 94 and r["foiling_distance_m"] == 329 and r["metrics"]["num_segments"] == 3


def test_ohne_extra_bleibt_alles_wie_standard():
    std = {"segments": [_seg(100, 30, 100)], "foiling_time_s": 30, "foiling_distance_m": 100, "max_speed_mps": 4, "metrics": {}}
    r = zusammenfuehren(std, {"segments": [_seg(99, 32, 105)]})
    assert r["segments"][0]["duration_s"] == 30 and r["metrics"]["empfindlich_extra"] == 0


def test_aussortiertes_der_empfindlichen_erkennung_gilt_auch():
    """#19553: empfindlich = ein langes Fremdkraft-Stueck, Standard = kurze Stuecke darin -> auch aussortiert."""
    std = {"segments": [_seg(14, 24, 192, 6.6), _seg(42, 48, 294, 6.8), _seg(400, 30, 100)], "foiling_time_s": 102,
           "foiling_distance_m": 586, "max_speed_mps": 6.8, "metrics": {}}
    emp = {"segments": [_seg(400, 31, 105)], "metrics": {"fremdkraft_laeufe": [
        {"t_start_ms": 12000, "t_end_ms": 253000, "grund": "241 s am Stueck bei 20.3 km/h"}]}}
    r = zusammenfuehren(std, emp)
    assert [s["t_start_session_ms"] for s in r["segments"]] == [400000]
    assert r["foiling_distance_m"] == 100 and r["metrics"]["empfindlich_fremd"] == 2
    raus = [f for f in r["metrics"]["fremdkraft_laeufe"] if f["quelle"] == "empfindlich"]
    assert len(raus) == 2 and raus[0]["t_start_ms"] == 14000
