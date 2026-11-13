"""Einheit der Beschleunigung fuer die Analyse (app/analysis/skala.py, 13.11.2026)."""
import numpy as np

from app.analysis import skala


def _ruhe(je_g, n=4000):
    rng = np.random.default_rng(1)
    a = np.zeros((n, 3)); a[:, 2] = je_g
    return (a + rng.normal(0, je_g * 0.05, a.shape)).astype(np.int16)


def _ohne_db(monkeypatch, tabelle=None):
    monkeypatch.setattr(skala, "quelle", lambda u: skala.quelle_aus(u, "garmin", "006-B0000-00"))
    monkeypatch.setattr(skala, "tabelle", lambda: tabelle or {})


def test_aus_ist_wie_bisher(monkeypatch):
    monkeypatch.delenv("ACCEL_NORM", raising=False)
    assert skala.fuer_analyse(_ruhe(1000), 2048, 25, "123-4") == 2048


def test_schaetzung_je_session(monkeypatch):
    monkeypatch.setenv("ACCEL_NORM", "1")
    _ohne_db(monkeypatch)
    assert skala.fuer_analyse(_ruhe(1000), 2048, 25, "123-4") == 1000       # Garmin-App: milli-g mit Etikett 2048
    assert skala.fuer_analyse(_ruhe(2048), 2048, 25, "123-4") == 2048       # Apple/Wear/Handy/FIT
    assert skala.fuer_analyse(_ruhe(2048), 4194, 25, "garmin-x") == 2048    # Garmin Connect (Zwischenloesung 13.11.)
    assert skala.fuer_analyse(_ruhe(512), 2048, 25, "hw-x") == 512          # Huawei Ultimate 2
    assert skala.fuer_analyse(_ruhe(1500), 2048, 25, "123-4") == 2048       # nichts Klares -> gemeldete
    assert skala.fuer_analyse(_ruhe(1000)[:100], 2048, 25, "123-4") == 2048  # zu wenig Werte


def test_quelle_und_sichere_session(monkeypatch):
    monkeypatch.setenv("ACCEL_NORM", "1")
    _ohne_db(monkeypatch, {"app|garmin|*": {"einheit": 1000.0}})
    kurz = _ruhe(2048)[:400]                                               # zu kurz fuer eine Schaetzung
    assert skala.fuer_analyse(kurz, 2048, 25, "123-4") == 1000             # -> Quelle (Weg+Plattform) gilt
    assert skala.fuer_analyse(_ruhe(2048, 5000), 2048, 25, "123-4") == 2048  # sicher anders -> Session gilt (#516)


def test_quelle_aus():
    assert skala.quelle_aus("1794143439-590810561", "garmin", "006-B4536-00") == "app|garmin|006-B4536-00"
    assert skala.quelle_aus("garmin-abc", None, "Garmin Forerunner 245") == "garmin|-|Garmin Forerunner 245"
    assert skala.quelle_aus("A06EA035-1", "apple", "Watch7,5 · watchOS 26.6") == "app|apple|Watch7,5"


def test_kraeftiger_fahrer_bleibt_bei_der_quelle(monkeypatch):
    # #10256: milli-g, aber Median 1,8 g und Schwerkraft-Vektor ~2 g -> Median und Vektor sagen 2048, p10 sagt 1000.
    monkeypatch.setenv("ACCEL_NORM", "1")
    _ohne_db(monkeypatch, {"app|garmin|*": {"einheit": 1000.0}})
    rng = np.random.default_rng(2)
    a = np.zeros((6000, 3)); a[:, 2] = 1000
    a[1200:, 2] = 2000 + rng.normal(0, 150, 4800)                         # 80 % der Zeit kraeftig belastet
    assert skala.schaetzen(a.astype(np.int16), 25) is None
    assert skala.fuer_analyse(a.astype(np.int16), 2048, 25, "123-4") == 1000
