"""Tests für den Take-Vergleich (Tap-to-Label): Offset-Ausrichtung + Konsens."""
from app.pumptruth import compare_takes


def _base(n=20, step=1500):
    return [i * step for i in range(n)]


def test_offset_sign_and_alignment():
    """Ein um +800ms späterer Take wird als +800 erkannt und ausgerichtet (alle matchen)."""
    base = _base()
    r = compare_takes([
        {"take": 1, "times_ms": base},
        {"take": 2, "times_ms": [x + 800 for x in base]},
    ])
    assert r["ref_take"] == 1                      # längster/erster = Referenz
    t2 = next(t for t in r["takes"] if t["take"] == 2)
    assert t2["offset_ms"] == 800
    assert t2["matched"] == len(base)
    assert t2["jitter_ms"] == 0.0                  # ohne Rauschen exakt


def test_negative_offset():
    base = _base()
    r = compare_takes([
        {"take": 1, "times_ms": base},
        {"take": 2, "times_ms": [x - 300 for x in base]},
    ])
    t2 = next(t for t in r["takes"] if t["take"] == 2)
    assert t2["offset_ms"] == -300
    assert t2["matched"] == len(base)


def test_consensus_majority():
    """Konsens nimmt mehrheitlich bestätigte Pumps; ein Ausreißer-Tap fällt raus."""
    base = _base(10)
    r = compare_takes([
        {"take": 1, "times_ms": base},
        {"take": 2, "times_ms": base},
        {"take": 3, "times_ms": base + [99999]},   # ein extra Tap nur in einem Take
    ])
    assert r["consensus_n"] == len(base)           # der Ausreißer ist nicht in der Mehrheit


def test_empty_takes():
    assert compare_takes([])["n_takes"] == 0
    assert compare_takes([{"take": 1, "times_ms": []}])["n_takes"] == 0
