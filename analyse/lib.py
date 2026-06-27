"""Lade-Helfer für das Dual-Watch-Experiment (2026-06-27).

Liest Accel/GPS direkt aus server/data/<uuid>/ — keine DB nötig.
Accel: int16 LE, interleaved x,y,z, in milli-g -> /1000 = g (s. README, accel_scale-Bug).
UUID-Präfix = Unix-Startzeit der Uhr -> absolute Zeitachse für Cross-Watch-Sync.
"""
import json
from pathlib import Path
import numpy as np

BASE = Path("/home/jan/garmin-connect-iq/server/data")

# (fenix_id=Wrist 25Hz GPS, fr55_id=Mast 10Hz kein GPS, label)
PAIRS = [
    (307, 312, "P1 19:58"),
    (308, 313, "P2 20:10 (kein Foiling)"),
    (309, 314, "P3 20:26"),
    (310, 315, "P4 20:38"),
    (311, 316, "P5 20:53"),
]

UUID = {
    307: "1782583085-583116168", 308: "1782583831-1116503540", 309: "1782584768-111108251",
    310: "1782585486-217910414", 311: "1782586394-1495007168", 312: "1782583083-1934633686",
    313: "1782583830-2013275487", 314: "1782584753-1062236870", 315: "1782585484-420018609",
    316: "1782586391-29752700",
}
HZ = {**{s: 25 for s in (307, 308, 309, 310, 311)}, **{s: 10 for s in (312, 313, 314, 315, 316)}}
ROLE = {**{s: "Wrist(fenix)" for s in (307, 308, 309, 310, 311)},
        **{s: "Mast(FR55)" for s in (312, 313, 314, 315, 316)}}


def start_unix(sid: int) -> int:
    return int(UUID[sid].split("-")[0])


def load_accel(sid: int) -> np.ndarray:
    """(N,3) float, in g."""
    d = BASE / UUID[sid] / "accel"
    if not d.exists():
        # Fallback: manche Speichern flach als *.bin im Session-Dir
        d = BASE / UUID[sid]
    files = sorted(d.glob("*.bin"), key=lambda p: int(p.stem) if p.stem.isdigit() else 0)
    if not files:
        return np.empty((0, 3))
    raw = b"".join(f.read_bytes() for f in files)
    n = (len(raw) // 6) * 6
    return np.frombuffer(raw[:n], dtype="<i2").reshape(-1, 3).astype(float) / 1000.0


def load_gps(sid: int):
    """list of [t_ms, lat, lon, speed_mps, hr, hacc] (variabel je nach Aufnahme)."""
    d = BASE / UUID[sid] / "gps"
    if not d.exists():
        return []
    out = []
    for f in sorted(d.glob("*.json"), key=lambda p: int(p.stem) if p.stem.isdigit() else 0):
        try:
            out += json.loads(f.read_text())
        except Exception:
            pass
    return out


def accel_t(sid: int) -> np.ndarray:
    """Zeitachse (s seit Start dieser Uhr) für die Accel-Samples."""
    a = load_accel(sid)
    return np.arange(len(a)) / HZ[sid]


def accel_abs_t(sid: int) -> np.ndarray:
    """Absolute Unix-Zeit (s) je Accel-Sample — für Cross-Watch-Vergleich."""
    return start_unix(sid) + accel_t(sid)


if __name__ == "__main__":
    for fx, fr, label in PAIRS:
        for sid in (fx, fr):
            a = load_accel(sid)
            g = load_gps(sid)
            dur = len(a) / HZ[sid]
            mag = np.linalg.norm(a, axis=1) if len(a) else np.array([0.0])
            print(f"{label:24s} {sid} {ROLE[sid]:13s} "
                  f"accel={len(a):6d} ({dur:6.1f}s) |g|~{mag.mean():.2f} "
                  f"gps={len(g):4d} t0={start_unix(sid)}")
        print()
