"""Zusammenfuehren bei jeder Sportart (17.11.2026): verlangt wird nur DIESELBE Sportart.

Anlass: zwei Wingfoil-Sessions eines Tages liessen sich nicht zusammenfuehren („aussortierte Session (kein
Pumpfoilen)") — die Sperre stammte aus der Zeit vor den Sportarten.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app import merge


def _s(sport, start_h):
    t0 = datetime(2026, 11, 17, start_h, 0, tzinfo=timezone.utc)
    return SimpleNamespace(user_id=1, deleted=False, merged_into=None, result=SimpleNamespace(num_runs=5),
                           sport_class=sport, is_pumpfoil=(sport == "pumpfoil"), device_id=7, accel_hz=25,
                           accel_scale=2048, gps_hz=1, foil_id=3, place_name="See", place_lat=46.57, place_lon=5.75,
                           started_at=t0, ended_at=t0 + timedelta(minutes=30), session_uuid=secrets.token_hex(8))


def test_wingfoil_laesst_sich_zusammenfuehren():
    ok, why = merge.can_merge([_s("wingfoil", 9), _s("wingfoil", 12)])
    assert ok, why


def test_verschiedene_sportarten_nicht():
    ok, why = merge.can_merge([_s("wingfoil", 9), _s("pumpfoil", 12)])
    assert not ok and "different sports" in why
