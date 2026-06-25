from app.foil_physics import alarm_speeds


def test_alarm_speeds_plausible():
    lo, hi = alarm_speeds(90, 1000, 14, 95)
    assert 8 <= lo <= 25 and lo < hi <= 40   # sinnvoller Foil-Korridor


def test_smaller_foil_is_faster():
    big = alarm_speeds(95, 1500, 16, 90)
    small = alarm_speeds(75, 700, 12, 90)
    assert small[0] > big[0]                  # kleineres Foil -> höhere Min-Speed


def test_heavier_rider_is_faster():
    light = alarm_speeds(90, 1000, 14, 70)
    heavy = alarm_speeds(90, 1000, 14, 110)
    assert heavy[0] > light[0]                # mehr Gewicht -> höhere Min-Speed


def test_invalid_dims_zero():
    assert alarm_speeds(0, 0, 0, 95) == (0, 0)
