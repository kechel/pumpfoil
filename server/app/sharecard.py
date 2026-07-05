"""Teilbare Session-Card (PNG) fuer Social Media — server-generiert, konfigurierbar.

Track-Farbmodus (cyan | speed | hr), auswaehlbare Stats (leere werden ausgelassen),
Wasser-Silhouette + Logo. bg='navy' = fertige Card; bg='transparent' = nur Elemente
(fuers Foto-Compositing im Client). Aus Session-/Analyse-Daten, reproduzierbar.
"""
from __future__ import annotations

import io
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


def _font(sz, bold=True):
    return ImageFont.truetype(_FONT % ("-Bold" if bold else ""), sz)


def _km(m):
    return f"{m/1000:.1f} km" if m and m >= 1000 else f"{round(m or 0)} m"


def _mmss(sec):
    sec = int(sec or 0)
    return f"{sec//60}:{sec%60:02d}"


def _ramp(stops, t):
    t = max(0.0, min(1.0, t))
    n = len(stops) - 1
    f = t * n
    i = min(int(f), n - 1)
    a, b, k = stops[i], stops[i + 1], f - i
    return tuple(int(a[j] + (b[j] - a[j]) * k) for j in range(3))


CYAN_STOPS = [(14, 116, 144), (165, 243, 252)]                       # dim -> hell cyan
SPEED_STOPS = [(37, 99, 235), (34, 197, 94), (234, 179, 8), (239, 68, 68)]  # blau->gruen->gelb->rot
HR_STOPS = [(34, 197, 94), (234, 179, 8), (249, 115, 22), (239, 68, 68)]    # gruen->gelb->orange->rot


# Stat-Katalog: key -> (Label, Wert-Funktion, Verfuegbar-Funktion). Reihenfolge = Default.
def stat_catalog(ar):
    ppm = None
    if (ar.foiling_time_s or 0) > 0 and (ar.pump_count or 0) > 0:
        ppm = round(ar.pump_count / (ar.foiling_time_s / 60.0))
    items = [
        ("foiling", "Foiling", _km(ar.foiling_distance_m), (ar.foiling_distance_m or 0) > 0),
        ("runs", "Läufe", str(ar.num_runs or 0), (ar.num_runs or 0) > 0),
        ("pumps", "Pumps", str(ar.pump_count or 0), (ar.pump_count or 0) > 0),
        ("speed", "Top-Speed", f"{(ar.max_speed_mps or 0)*3.6:.1f} km/h", (ar.max_speed_mps or 0) > 0),
        ("time", "Foil-Zeit", _mmss(ar.foiling_time_s), (ar.foiling_time_s or 0) > 0),
        ("longest", "Längster", _km(ar.best_distance_m), (ar.best_distance_m or 0) > 0),
        ("distance", "Strecke", _km(ar.total_distance_m), (ar.total_distance_m or 0) > 0),
        ("pumprate", "Ø Pumps/min", str(ppm or 0), ppm is not None),
    ]
    return items


def available_stats(ar):
    """Keys der Stats mit sinnvollem Wert (fuer die UI)."""
    return [k for k, _lbl, _v, ok in stat_catalog(ar) if ok]


def render_share_png(session, ar, water_rings, *, color="cyan", stats=None,
                     bg="navy", size=1080) -> bytes:
    W = H = size
    S = size / 1080.0
    def px(v): return int(v * S)

    base_alpha = 0 if bg == "transparent" else 255
    img = Image.new("RGBA", (W, H), (*NAVY, base_alpha))
    d = ImageDraw.Draw(img)

    gj = json.loads(ar.track_geojson) if ar and ar.track_geojson else {}
    coords = (gj.get("geometry") or {}).get("coordinates") or []
    props = gj.get("properties") or {}
    speeds = (props.get("speeds") or {}).get("3") or props.get("speeds_mps") or []
    hr = props.get("hr") or []

    # Farbfunktion je Modus
    if color == "speed":
        vmax = max([s for s in speeds if s] or [1])
        colfn = lambda i: _ramp(SPEED_STOPS, (speeds[i] if i < len(speeds) else 0) / max(vmax, 1e-6))
    elif color == "hr":
        vals = [h for h in hr if h]
        lo, hi = (min(vals), max(vals)) if vals else (0, 1)
        colfn = lambda i: _ramp(HR_STOPS, ((hr[i] if i < len(hr) and hr[i] else lo) - lo) / max(hi - lo, 1e-6))
    else:
        vmax = max([s for s in speeds if s] or [1])
        colfn = lambda i: _ramp(CYAN_STOPS, (speeds[i] if i < len(speeds) else 0) / max(vmax, 1e-6))

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
        def toXY(x, y): return (cxp + (x - cmx) * sc, cyp - (y - cmy) * sc)

        if water_rings and bg != "transparent":
            for ring in water_rings:
                pts = [toXY(p[1] * mx, p[0] * my) for p in ring]
                if len(pts) >= 3:
                    d.polygon(pts, fill=WATER)
        lw = max(px(10), 3)
        for i in range(len(xs) - 1):
            p0 = toXY(xs[i], ys[i]); p1 = toXY(xs[i + 1], ys[i + 1])
            if math.dist(p0, p1) > px(200):
                continue
            d.line([p0, p1], fill=(*colfn(i + 1), 255), width=lw)

    # Header
    d.text((px(90), px(64)), (session.place_name or "Session"), font=_font(px(58)), fill=(*WHITE, 255))
    d.text((px(90), px(128)), session.started_at.astimezone().strftime("%d.%m.%Y"),
           font=_font(px(30), False), fill=(*GREY, 255))

    # Stats (nur gewuenschte + verfuegbare, Reihenfolge des Katalogs)
    cat = {k: (lbl, v, ok) for k, lbl, v, ok in stat_catalog(ar)}
    order = [k for k, *_ in stat_catalog(ar)]
    want = stats if stats is not None else [k for k in order if cat[k][2]]
    chosen = [k for k in order if k in want and cat[k][2]][:6]
    gy, gx, cw = px(772), px(90), px(300)
    for i, k in enumerate(chosen):
        lbl, val, _ok = cat[k]
        r, c = divmod(i, 3)
        x, y = gx + c * cw, gy + r * px(115)
        d.text((x, y), val, font=_font(px(50)), fill=(*CYAN, 255))
        d.text((x, y + px(58)), lbl.upper(), font=_font(px(24), False), fill=(*GREY, 255))

    # Logo
    if _LOGO.exists():
        logo = Image.open(_LOGO).convert("RGBA")
        lh = px(54); logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
        img.alpha_composite(logo, (W - px(90) - logo.width, H - px(90)))

    buf = io.BytesIO()
    (img if bg == "transparent" else img.convert("RGB")).save(buf, "PNG")
    return buf.getvalue()
