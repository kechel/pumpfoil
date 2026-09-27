"""Import von TCX-/GPX-Dateien (Garmin-Export, Polar, Suunto, COROS …).

Liefert dieselbe Struktur wie fitimport.parse_fit_bytes:
  { gps_samples: [[t_ms, lat, lon, speed_mps, hr, hacc], …],
    accel_bytes, accel_hz, started_at, sport, foil_status }
Standard-TCX/GPX enthalten KEINE Roh-Beschleunigung -> accel leer -> Analyse = gps_only
(GPS-Distanz, Speed, Gleitphasen; keine Pump-Frequenz).

AUSNAHME seit 27.09.2026: GPX mit Beschleunigung als Erweiterung — ein Element mit dem lokalen
Namen `acceleration` und den Attributen `time`, `x`, `y`, `z` (in g), gleich in welchem
Namensraum. So schreibt es die selbstgebaute Recorder-App eines Nutzers (`urn:foil:gpx:1`,
~50 Hz, jeder Wert mit eigenem Zeitstempel); unser Import hatte die 89.283 Werte seiner ersten
Datei stumm verworfen. Die Werte gehen in BLOECKEN mit echter Startzeit raus (`accel_chunks`),
damit die Zeitachse exakt ist statt aus einer Rate geschaetzt (docs/DATA-PIPELINE.md)."""
from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import numpy as np

# Wie im FIT-Import: int16 mit 2048 Schritten je g (fitimport.ACCEL_SCALE).
ACCEL_SCALE = 2048
# Werte je gespeichertem Block. Klein genug, dass jede Blockstartzeit die Achse nachfuehrt.
ACCEL_BLOCK = 1500


def _local(tag: str) -> str:
    """Tag ohne XML-Namespace ('{ns}Trackpoint' -> 'Trackpoint')."""
    return tag.rsplit("}", 1)[-1]


def _findtext(el, name):
    for c in el.iter():
        if _local(c.tag) == name and c.text and c.text.strip():
            return c.text.strip()
    return None


def _parse_time(s: str) -> datetime | None:
    s = s.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        try:
            dt = datetime.strptime(s.split("+")[0].split(".")[0], "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _haversine(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def parse_track_bytes(data: bytes, filename: str | None = None) -> dict:
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ValueError(f"Ungültige XML-Datei: {exc}")

    kind = _local(root.tag).lower()  # 'trainingcenterdatabase' (TCX) | 'gpx'
    acc: list = []
    if "gpx" in kind:
        pts, sport = _parse_gpx(root)
        acc = _parse_accel(root)
    else:
        pts, sport = _parse_tcx(root)

    if not pts:
        return {"gps_samples": [], "accel_bytes": b"", "accel_hz": 0,
                "started_at": None, "sport": sport, "foil_status": []}

    # Start = der FRUEHESTE Zeitstempel: in der ersten bekannten Datei beginnt die Beschleunigung
    # 6 s vor dem ersten GPS-Fix. Sonst bekaeme der erste Block eine negative Startzeit.
    t0 = min(pts[0][0], acc[0][0]) if acc else pts[0][0]
    samples = []
    prev = None
    for (t, lat, lon, hr, speed) in pts:
        if speed is None:
            if prev is not None:
                dt = (t - prev[0]).total_seconds()
                speed = _haversine(prev[1], prev[2], lat, lon) / dt if dt > 0 else 0.0
            else:
                speed = 0.0
        t_ms = int((t - t0).total_seconds() * 1000)
        samples.append([t_ms, lat, lon, round(float(speed), 3), int(hr or 0), 0.0])
        prev = (t, lat, lon)

    aus = {"gps_samples": samples, "accel_bytes": b"", "accel_hz": 0,
           "started_at": t0, "sport": sport, "foil_status": []}
    if len(acc) >= 2:
        aus.update(_accel_bloecke(acc, t0))
    return aus


def _parse_accel(root) -> list:
    """[(datetime, x_g, y_g, z_g), …] aus `…:acceleration`-Elementen, zeitlich sortiert."""
    out = []
    for el in root.iter():
        if _local(el.tag) != "acceleration":
            continue
        ts, x, y, z = el.get("time"), el.get("x"), el.get("y"), el.get("z")
        if ts is None or x is None or y is None or z is None:
            continue
        t = _parse_time(ts)
        try:
            v = (float(x), float(y), float(z))
        except ValueError:
            continue
        if t is not None and all(math.isfinite(c) for c in v):
            out.append((t, *v))
    out.sort(key=lambda r: r[0])
    return out


def _accel_bloecke(acc: list, t0: datetime) -> dict:
    """Beschleunigung als int16-Bytes (2048/g), in Bloecken mit echter Startzeit (ms ab t0)."""
    arr = np.array([[r[1], r[2], r[3]] for r in acc], dtype=np.float64) * ACCEL_SCALE
    roh = np.clip(np.round(arr), -32768, 32767).astype("<i2")
    ms = np.array([(r[0] - t0).total_seconds() * 1000.0 for r in acc])
    bloecke = [(int(round(ms[i])), roh[i:i + ACCEL_BLOCK].reshape(-1).tobytes())
               for i in range(0, len(roh), ACCEL_BLOCK)]
    dauer_s = (ms[-1] - ms[0]) / 1000.0
    hz = int(round((len(acc) - 1) / dauer_s)) if dauer_s > 0 else 25
    if hz < 5 or hz > 400:   # unplausible Zeitstempel -> wie im FIT-Import auf den Standard
        hz = 25
    return {"accel_bytes": roh.reshape(-1).tobytes(), "accel_hz": hz, "accel_chunks": bloecke}


def _parse_tcx(root) -> tuple[list, str]:
    sport = "pumpfoil"
    pts = []
    for act in root.iter():
        if _local(act.tag) != "Activity":
            continue
        sp = act.get("Sport")
        if sp and sp.lower() != "other":
            sport = sp.lower()
        break
    for tp in root.iter():
        if _local(tp.tag) != "Trackpoint":
            continue
        tstr = _findtext(tp, "Time")
        lat = _findtext(tp, "LatitudeDegrees")
        lon = _findtext(tp, "LongitudeDegrees")
        if not tstr or lat is None or lon is None:
            continue
        t = _parse_time(tstr)
        if t is None:
            continue
        hr = _findtext(tp, "Value")          # innerhalb HeartRateBpm
        speed = _findtext(tp, "Speed")       # Extensions/TPX:Speed (m/s)
        pts.append((t, float(lat), float(lon),
                    int(float(hr)) if hr else None,
                    float(speed) if speed else None))
    return pts, sport


def _parse_gpx(root) -> tuple[list, str]:
    pts = []
    for tp in root.iter():
        if _local(tp.tag) != "trkpt":
            continue
        lat = tp.get("lat"); lon = tp.get("lon")
        if lat is None or lon is None:
            continue
        tstr = _findtext(tp, "time")
        t = _parse_time(tstr) if tstr else None
        if t is None:
            continue
        hr = _findtext(tp, "hr")             # gpxtpx:hr
        speed = _findtext(tp, "speed")       # selten vorhanden (m/s)
        pts.append((t, float(lat), float(lon),
                    int(float(hr)) if hr else None,
                    float(speed) if speed else None))
    return pts, "pumpfoil"
