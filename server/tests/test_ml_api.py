"""E2E-Test der ML-Endpoints durch die API (DB + Storage), nicht nur reine Funktionen.

Lädt 2 Sessions mit Pump-(erste Hälfte)/Glide-(zweite Hälfte)-Accel hoch, labelt sie
entsprechend und trainiert via /api/ml/train mit session-level CV.
"""
from __future__ import annotations

import base64
import math

import numpy as np


def _accel_b64(secs=60, fs=25, scale=2048):
    """Erste Hälfte 1-Hz-Pumpen, zweite Hälfte flach (Gleiten)."""
    n = secs * fs
    half = n // 2
    t = np.arange(n) / fs
    z = np.ones(n)
    z[:half] += 0.4 * np.sin(2 * math.pi * 1.0 * t[:half])
    rng = np.random.default_rng(1)
    z += rng.normal(0, 0.01, n)
    inter = np.empty(n * 3, dtype="<i2")
    inter[0::3] = (rng.normal(0, 0.01, n) * scale).astype("<i2")
    inter[1::3] = (rng.normal(0, 0.01, n) * scale).astype("<i2")
    inter[2::3] = (z * scale).astype("<i2")
    return base64.b64encode(inter.tobytes()).decode(), secs


def _setup_session(client, dev, auth, uuid):
    secs = 60
    client.post("/api/ingest/session", headers=dev,
                json={"session_uuid": uuid, "started_at": "2026-06-20T09:00:00Z"})
    b64, _ = _accel_b64(secs)
    client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                json={"index": 0, "kind": "accel", "encoding": "int16-b64", "data": b64})
    r = client.post(f"/api/ingest/session/{uuid}/complete", headers=dev,
                    json={"total_chunks": 1})
    sid = r.json()["session_id"]
    # Labels: erste Hälfte pump, zweite glide
    client.post(f"/api/sessions/{sid}/labels", headers=auth,
                json={"t_start_ms": 0, "t_end_ms": secs * 500, "label": "pump"})
    client.post(f"/api/sessions/{sid}/labels", headers=auth,
                json={"t_start_ms": secs * 500, "t_end_ms": secs * 1000, "label": "glide"})
    return sid


def test_ml_train_endpoint(client):
    r = client.post("/api/auth/register", json={"email": "ml@b.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}

    _setup_session(client, dev, auth, "ml-uuid-1")
    _setup_session(client, dev, auth, "ml-uuid-2")

    # Status: 2 Sessions, beide Klassen vorhanden
    st = client.get("/api/ml/status", headers=auth).json()
    assert st["n_sessions"] == 2
    assert set(st["classes"]) == {"pump", "glide"}
    assert st["n_samples"] >= 10

    # Training: session-level CV-Report
    rep = client.post("/api/ml/train", headers=auth).json()
    assert rep["status"] == "ok", rep
    assert rep["n_groups"] == 2
    assert rep["saved"] is True
    assert 0.0 <= rep["cv_accuracy_mean"] <= 1.0
    assert set(rep["feature_importances"].keys())
