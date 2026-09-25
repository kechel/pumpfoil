"""Wake-up-Sensor auf Wear OS: Konto-Einstellung vor globalem Standard (api/devices.py)."""
from app.api import devices


def test_standard_ist_aus_waehrend_der_einfuehrung():
    assert devices.ACCEL_WAKEUP_DEFAULT == "off"
    assert devices._effective_accel_wakeup({}) == "off"


def test_konto_einstellung_schlaegt_den_standard():
    assert devices._effective_accel_wakeup({"accel_wakeup": "on"}) == "on"
    assert devices._effective_accel_wakeup({"accel_wakeup": "off"}) == "off"


def test_unbekannter_wert_faellt_auf_den_standard():
    assert devices._effective_accel_wakeup({"accel_wakeup": "vielleicht"}) == devices.ACCEL_WAKEUP_DEFAULT
