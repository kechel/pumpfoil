from app.analysis import ds_ueber_laeufe


def test_keine_laeufe_kein_wert():
    assert ds_ueber_laeufe([]) is None


def test_punktgewichtet():
    segs = [{"i_start": 0, "i_end": 10, "avg_speed_mps": 4.0},
            {"i_start": 20, "i_end": 50, "avg_speed_mps": 5.0}]
    assert ds_ueber_laeufe(segs) == round((10 * 4 + 30 * 5) / 40, 2)


def test_ohne_index_zaehlt_dauer():
    segs = [{"duration_s": 10, "avg_speed_mps": 3.0}, {"duration_s": 30, "avg_speed_mps": 5.0}]
    assert ds_ueber_laeufe(segs) == 4.5
