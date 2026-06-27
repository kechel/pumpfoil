"""FIT-Datei-Import: vorhandene Aktivitäten (.fit) in unser Roh-Format wandeln.

Übernimmt record-Messages (GPS/Speed/Puls @ ~1 Hz) UND — falls vorhanden —
accelerometer_data-Messages (rohe Beschleunigung, via SensorLogging; sowohl unsere
eigene App als auch andere Apps schreiben das ins FIT). Beides auf eine gemeinsame
Zeitachse (t0 = frühester Zeitstempel) gelegt, damit die Pump-Maske (Accel ∩ Foiling)
zeitlich passt.

Geräteunabhängige IQ-Felder wie foil_status werden NICHT vorausgesetzt (app-spezifisch).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np

# Semicircles -> Grad (FIT-Positionsformat).
_SEMI_TO_DEG = 180.0 / (2 ** 31)
# calibrated_accel ist in milli-g -> g; unser int16-Format skaliert mit 2048 pro g.
ACCEL_SCALE = 2048
_MG_TO_INT16 = ACCEL_SCALE / 1000.0


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _record_time(r: dict) -> datetime | None:
    t = r.get("timestamp")
    return _aware(t) if t is not None else None


def _accel_msg_time(m: dict) -> datetime | None:
    t = m.get("timestamp")
    if t is None:
        return None
    t = _aware(t)
    tms = m.get("timestamp_ms")
    return t + timedelta(milliseconds=tms) if tms is not None else t


def gps_from_records(records: list[dict], t0: datetime) -> list:
    """record-Dicts -> gps_samples [t_ms, lat, lon, speed, hr, hacc], relativ zu t0.
    Nur Records mit gültiger Position."""
    samples = []
    for r in records:
        lat_s = r.get("position_lat")
        lon_s = r.get("position_long")
        ts = _record_time(r)
        if lat_s is None or lon_s is None or ts is None:
            continue
        speed = r.get("enhanced_speed")
        if speed is None:
            speed = r.get("speed")
        if speed is None:
            speed = r.get("gps_speed")
        hr = r.get("heart_rate")
        hacc = r.get("gps_accuracy")
        samples.append([
            int((ts - t0).total_seconds() * 1000),
            float(lat_s * _SEMI_TO_DEG),
            float(lon_s * _SEMI_TO_DEG),
            float(speed) if speed is not None else None,
            int(hr) if hr is not None else None,
            float(hacc) if hacc is not None else None,
        ])
    return samples


def accel_from_messages(accel_msgs: list[dict]) -> tuple[bytes, int]:
    """accelerometer_data-Dicts -> (int16-LE-Bytes interleaved x,y,z, geschätzte Hz).
    calibrated_accel_* sind Arrays je Message (milli-g)."""
    xs, ys, zs = [], [], []
    for m in accel_msgs:
        ax = m.get("calibrated_accel_x")
        ay = m.get("calibrated_accel_y")
        az = m.get("calibrated_accel_z")
        if ax is None or ay is None or az is None:
            continue
        if not isinstance(ax, (list, tuple)):
            ax, ay, az = [ax], [ay], [az]
        n = min(len(ax), len(ay), len(az))
        xs.extend(ax[:n]); ys.extend(ay[:n]); zs.extend(az[:n])
    if not xs:
        return b"", 0

    arr = np.empty((len(xs), 3), dtype=np.float64)
    arr[:, 0] = xs; arr[:, 1] = ys; arr[:, 2] = zs
    # mg -> int16 (skaliert), NaNs -> 0, clip auf int16-Bereich.
    arr = np.nan_to_num(arr) * _MG_TO_INT16
    inter = np.clip(arr, -32768, 32767).astype("<i2").reshape(-1)

    span_s = 0.0
    first, last = _accel_msg_time(accel_msgs[0]), _accel_msg_time(accel_msgs[-1])
    if first and last:
        span_s = (last - first).total_seconds()
    hz = int(round(len(xs) / span_s)) if span_s > 0 else 25
    # Plausibilität: bei unzuverlässigen FIT-Zeitstempeln (z. B. SensorLogger, span~0)
    # käme ein absurder Wert raus (z. B. 16675 Hz). Reale Accel-Raten ~10–50 Hz ->
    # sonst auf 25 Hz (App-Default) zurückfallen, damit die Analyse korrekt alignt.
    if hz < 5 or hz > 60:
        hz = 25
    return inter.tobytes(), hz


def parse_fit_bytes(data: bytes) -> dict:
    """Parst FIT-Bytes. Rückgabe-Dict: gps_samples, accel_bytes, accel_hz, started_at, sport."""
    import fitparse

    try:
        fit = fitparse.FitFile(data)
        records, accel_msgs = [], []
        sport = "pumpfoil"
        for msg in fit.get_messages():
            if msg.name == "record":
                records.append({d.name: d.value for d in msg})
            elif msg.name == "accelerometer_data":
                accel_msgs.append({d.name: d.value for d in msg})
            elif msg.name == "sport":
                vals = {d.name: d.value for d in msg}
                sp = vals.get("sport")
                sub = vals.get("sub_sport")
                # 'generic' ist nichtssagend -> dann das aussagekräftigere sub_sport nehmen
                # (z.B. Pump-Foiling kommt oft als generic/open_water -> "open_water";
                #  Surfen/Laufen/Radfahren stehen direkt in sport).
                if sp and sp != "generic":
                    sport = str(sp)
                elif sub:
                    sport = str(sub)
                elif sp:
                    sport = str(sp)
    except Exception as exc:
        raise ValueError(f"Unreadable FIT file: {exc}") from exc

    # Zeitbasis NUR aus den GPS-Record-Zeitstempeln. Accel-Zeitstempel (SensorLogger)
    # sind teils unzuverlässig/konstant (z. B. alle == Aktivitäts-Start), würden t0
    # verfälschen -> riesiger t_ms-Versatz + Accel/GPS-Fehlalignment. Nur wenn es gar
    # keine Records gibt, als Notnagel die Accel-Zeit nehmen.
    times = [t for t in (_record_time(r) for r in records) if t]
    if not times:
        a0 = _accel_msg_time(accel_msgs[0]) if accel_msgs else None
        if a0 is None:
            return {"gps_samples": [], "accel_bytes": b"", "accel_hz": 0, "started_at": None, "sport": sport}
        times = [a0]
    t0 = min(times)

    gps_samples = gps_from_records(records, t0)
    accel_bytes, accel_hz = accel_from_messages(accel_msgs)
    # foil_status (Developer-Feld anderer Apps) parallel zu gps_samples — NUR als
    # optionale Ground-Truth fürs Training, falls vorhanden. Gleiche Filterung wie gps.
    foil_status = [
        r.get("foil_status")
        for r in records
        if r.get("position_lat") is not None
        and r.get("position_long") is not None
        and r.get("timestamp") is not None
    ]
    return {
        "gps_samples": gps_samples,
        "accel_bytes": accel_bytes,
        "accel_hz": accel_hz,
        "started_at": t0,
        "sport": sport,
        "foil_status": foil_status,
    }
