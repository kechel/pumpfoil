"""Teilbare Session-Card (PNG) fuer Social Media — server-generiert.

Speed-schattierter Track (cyan dim->hell) + Wasser-Silhouette des Spots + die
coolsten Stats + Logo. Aus den Session-/Analyse-Daten, beliebig reproduzierbar.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

_REPO = Path(__file__).resolve().parents[2]
_LOGO = _REPO / "web" / "public" / "wordmark-h-dark.png"
_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf"

NAVY = (2, 6, 23)
WATER = (12, 20, 38)
CYAN = (34, 211, 238)
GREY = (148, 163, 184)
WHITE = (255, 255, 255)


def _font(sz: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(_FONT % ("-Bold" if bold else ""), sz)


def _km(m: float) -> str:
    return f"{m/1000:.1f} km" if m and m >= 1000 else f"{round(m or 0)} m"


def _mmss(sec: float) -> str:
    sec = int(sec or 0)
    return f"{sec//60}:{sec%60:02d}"


def _cyan_ramp(t: float) -> tuple:
    t = max(0.0, min(1.0, t))
    a, b = (14, 116, 144), (165, 243, 252)   # brand-700 -> cyan-200
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render_share_png(session, ar, water_rings, size: int = 1080) -> bytes:
    """PNG-Bytes der Session-Card. `ar` = AnalysisResult, `water_rings` = [[ [lat,lon],..],..] oder None."""
    W = H = size
    S = size / 1080.0   # Skalierungsfaktor (Layout in 1080-Einheiten)
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    gj = json.loads(ar.track_geojson) if ar and ar.track_geojson else {}
    coords = (gj.get("geometry") or {}).get("coordinates") or []
    props = gj.get("properties") or {}
    speeds = (props.get("speeds") or {}).get("3") or props.get("speeds_mps") or []

    def px(v):
        return int(v * S)

    # --- Track-Box + Projektion ---
    if len(coords) >= 2:
        lons = np.array([c[0] for c in coords], float)
        lats = np.array([c[1] for c in coords], float)
        latref = float(np.median(lats))
        mx = 111320.0 * math.cos(math.radians(latref)); my = 111320.0
        xs = lons * mx; ys = lats * my
        bx0, by0, bx1, by1 = px(90), px(160), px(990), px(720)
        minx, maxx, miny, maxy = xs.min(), xs.max(), ys.min(), ys.max()
        sc = min((bx1 - bx0) / max(maxx - minx, 1), (by1 - by0) / max(maxy - miny, 1)) * 0.92
        cxp, cyp = (bx0 + bx1) / 2, (by0 + by1) / 2
        cmx, cmy = (minx + maxx) / 2, (miny + maxy) / 2

        def toXY(x, y):
            return (cxp + (x - cmx) * sc, cyp - (y - cmy) * sc)

        # Wasser-Silhouette (Kontext) hinter dem Track
        if water_rings:
            for ring in water_rings:
                pts = []
                for p in ring:
                    la, lo = p[0], p[1]
                    pts.append(toXY(lo * mx, la * my))
                if len(pts) >= 3:
                    d.polygon(pts, fill=WATER)
        # Track speed-schattiert
        vmax = max(speeds) if speeds else 1
        lw = max(px(10), 3)
        for i in range(len(xs) - 1):
            p0 = toXY(xs[i], ys[i]); p1 = toXY(xs[i + 1], ys[i + 1])
            if math.dist(p0, p1) > px(200):
                continue
            sp = speeds[i + 1] if i + 1 < len(speeds) else 0
            d.line([p0, p1], fill=_cyan_ramp(sp / max(vmax, 1)), width=lw)

    # --- Header: Spot + Datum ---
    d.text((px(90), px(64)), (session.place_name or "Session"), font=_font(px(58)), fill=WHITE)
    dt = session.started_at.astimezone().strftime("%d.%m.%Y")
    d.text((px(90), px(128)), dt, font=_font(px(30), False), fill=GREY)

    # --- Stats ---
    stats = [
        ("Foiling", _km(ar.foiling_distance_m or 0)),
        ("Läufe", str(ar.num_runs or 0)),
        ("Pumps", str(ar.pump_count or 0)),
        ("Top-Speed", f"{(ar.max_speed_mps or 0) * 3.6:.1f} km/h"),
        ("Foil-Zeit", _mmss(ar.foiling_time_s or 0)),
        ("Längster", _km(ar.best_distance_m or 0)),
    ]
    gy, gx, cw = px(772), px(90), px(300)
    for i, (lbl, val) in enumerate(stats):
        r, c = divmod(i, 3)
        x, y = gx + c * cw, gy + r * px(115)
        d.text((x, y), val, font=_font(px(50)), fill=CYAN)
        d.text((x, y + px(58)), lbl.upper(), font=_font(px(24), False), fill=GREY)

    # --- Logo unten rechts ---
    if _LOGO.exists():
        logo = Image.open(_LOGO).convert("RGBA")
        lh = px(54)
        logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
        img.paste(logo, (W - px(90) - logo.width, H - px(90)), logo)

    import io
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()
