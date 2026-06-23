"""Kompakte Track-Vorschau (ohne Karte): normalisierte Polylinien der Foiling-Läufe.

Ergebnis ist ein kleines JSON {"w","h","lines":[[[x,y],...],...]}, das im Frontend
als winziges SVG gerendert wird. Längengrad wird mit cos(lat) entzerrt, y gespiegelt
(Norden oben), Punkte werden auf ein Budget heruntergesampelt -> wenige hundert Bytes.
"""
from __future__ import annotations

import json
import math


def build_track_preview(coords, segments, box: float = 100.0, pad: float = 4.0, max_pts: int = 400) -> str | None:
    if not coords or not segments:
        return None
    n = len(coords)

    def valid(i: int) -> bool:
        return 0 <= i < n and coords[i] is not None and len(coords[i]) >= 2

    lats = [coords[i][1] for seg in segments
            for i in range(int(seg.get("i_start", 0)), int(seg.get("i_end", -1)) + 1) if valid(i)]
    if not lats:
        return None
    cosl = math.cos(math.radians(sum(lats) / len(lats))) or 1e-6

    raw: list[list[tuple[float, float]]] = []
    for seg in segments:
        a, b = seg.get("i_start"), seg.get("i_end")
        if a is None or b is None:
            continue
        pts = [(coords[i][0] * cosl, coords[i][1]) for i in range(int(a), int(b) + 1) if valid(i)]
        if len(pts) >= 2:
            raw.append(pts)
    if not raw:
        return None

    xs = [p[0] for line in raw for p in line]
    ys = [p[1] for line in raw for p in line]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    dx, dy = (maxx - minx) or 1e-9, (maxy - miny) or 1e-9
    scale = (box - 2 * pad) / max(dx, dy)
    w = round(dx * scale + 2 * pad, 1)
    h = round(dy * scale + 2 * pad, 1)

    total = sum(len(line) for line in raw)
    step = max(1, total // max_pts)
    lines: list[list[list[float]]] = []
    for line in raw:
        ds = line[::step]
        if ds[-1] != line[-1]:
            ds.append(line[-1])
        pl = [[round(pad + (x - minx) * scale, 1), round(pad + (maxy - y) * scale, 1)] for (x, y) in ds]
        if len(pl) >= 2:
            lines.append(pl)
    if not lines:
        return None
    return json.dumps({"w": w, "h": h, "lines": lines}, separators=(",", ":"))
