"""Tests für den Take-Vergleich (Tap-to-Label): Offset-Ausrichtung + Konsens + Plausibilität."""
from app.pumptruth import assess_takes, compare_takes


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


def test_assess_verified_and_flags_junk():
    """Zwei dichte, deckende Takes -> verified; ein spärlicher Zufalls-Take -> implausible."""
    foil_s = 21.0
    good = [i * 700 for i in range(30)]        # ~1.4 Hz, deckt den Lauf ab
    junk = [i * 3000 for i in range(5)]        # 5 Taps, 0.24 Hz -> zu spärlich
    a = assess_takes([
        {"take": 1, "times_ms": good},
        {"take": 2, "times_ms": [x + 120 for x in good]},
        {"take": 3, "times_ms": junk},
    ], foil_s)
    assert a["verdict"] == "verified"          # >=2 plausible Takes
    q = {p["take"]: p for p in a["quality"]}
    assert q[1]["plausible"] and q[2]["plausible"]
    assert not q[3]["plausible"]               # der Zufalls-Take fällt durch


def test_assess_implausible_when_all_sparse():
    a = assess_takes([{"take": 1, "times_ms": [i * 3000 for i in range(5)]}], 21.0)
    assert a["verdict"] == "implausible"
