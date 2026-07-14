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
CYAN = (34, 211, 238)     # helles Brand-Cyan (#22d3ee) — fuer dunkle Hintergruende
DCYAN = (14, 116, 144)    # dunkles Cyan (#0e7490) — fuer helle Hintergruende
GREY = (148, 163, 184)
WHITE = (255, 255, 255)

# Text-Schattierung (Umschalter): "light" = helle Texte (dunkler Hintergrund),
# "dark" = dunkle Texte (heller Hintergrund). Prim = Ueberschrift/Werte, Sec = Labels/Datum.
SHADES = {
    "light": {"prim": CYAN, "sec": (203, 213, 225), "logo": "wordmark-h-dark.png"},
    "dark": {"prim": DCYAN, "sec": (71, 85, 105), "logo": "wordmark-h-light.png"},
}


def _font(sz, bold=True):
    return ImageFont.truetype(_FONT % ("-Bold" if bold else ""), sz)


def _km(m):
    return f"{m/1000:.1f} km" if m and m >= 1000 else f"{round(m or 0)} m"


def _mmss(sec):
    sec = int(sec or 0)
    return f"{sec//60}:{sec%60:02d}"


def _perpump(m, pumps):
    """On-Foil-Meter pro Pump (Gleit-Effizienz). Kleine Werte mit 1 Dezimale."""
    pumps = int(pumps or 0)
    if not m or pumps <= 0:
        return "0 m"
    v = m / pumps
    return f"{v:.1f} m" if v < 10 else f"{round(v)} m"


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


# Stat-Katalog: key -> (Label, Wert, Verfuegbar). Reihenfolge = Default.
# seg != None -> Stats EINES Laufs (Einzel-Lauf-Teilen): Werte aus dem Segment, und die
# bei einem einzelnen Lauf sinnlosen/redundanten Stats (Läufe, Längster, Strecke=Foiling) aus.
def stat_catalog(ar, seg=None):
    if seg is not None:
        dist = seg.get("distance_m") or 0
        dur = seg.get("duration_s") or 0
        pumps = int(seg.get("pumps") or 0)
        spd = seg.get("max_speed_mps") or 0
        ppm = round(seg.get("pumps_per_min") or 0) if (pumps > 0 and dur > 0) else None
        return [
            ("foiling", "Foiling", _km(dist), dist > 0),
            ("runs", "Läufe", "1", False),
            ("pumps", "Pumps", str(pumps), pumps > 0),
            ("speed", "Top-Speed", f"{spd*3.6:.1f} km/h", spd > 0),
            ("time", "Foil-Zeit", _mmss(dur), dur > 0),
            ("longest", "Längster", _km(dist), False),
            ("distance", "Strecke/Pump", _perpump(dist, pumps), dist > 0 and pumps > 0),
            ("pumprate", "Ø Pumps/min", str(ppm or 0), ppm is not None),
        ]
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
        ("distance", "Strecke/Pump", _perpump(ar.foiling_distance_m, ar.pump_count),
         (ar.foiling_distance_m or 0) > 0 and (ar.pump_count or 0) > 0),
        ("pumprate", "Ø Pumps/min", str(ppm or 0), ppm is not None),
    ]
    return items


def available_stats(ar):
    """Keys der Stats mit sinnvollem Wert (fuer die UI)."""
    return [k for k, _lbl, _v, ok in stat_catalog(ar) if ok]


DIM = (100, 116, 139)     # gedimmte Laeufe, wenn ein einzelner Lauf hervorgehoben wird


def render_share_png(session, ar, water_rings, *, color="cyan", stats=None,
                     bg="navy", size=1080, track=True, title=None, shade="light",
                     highlight=None) -> bytes:
    sh = SHADES.get(shade, SHADES["light"])
    prim, sec = sh["prim"], sh["sec"]
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

    # Laeufe + optionaler Einzel-Lauf-Highlight (fuer Track UND Stats).
    segs_all = json.loads(ar.segments_json) if ar and ar.segments_json else []
    hl = highlight if (highlight is not None and 0 <= highlight < len(segs_all)) else None

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

    if track and len(coords) >= 2:
        lons = np.array([c[0] for c in coords], float)
        lats = np.array([c[1] for c in coords], float)
        n = len(coords)
        # Nur Foiling-Laeufe zeichnen (kein Land/Nicht-Foilen), wie die Web-Karte.
        # Segment-Indizes -> Maske; ohne Segmente (GPS-only/0 Laeufe) ganze Spur.
        segs = segs_all
        foil = np.zeros(n, dtype=bool)
        run_of = np.full(n, -1, dtype=int)   # je Index: zugehoeriger Lauf (fuer Highlight)
        for ri, sg in enumerate(segs):
            a, b = int(sg.get("i_start", 0)), int(sg.get("i_end", 0))
            lo_, hi_ = max(a, 0), min(b + 1, n)
            foil[lo_:hi_] = True
            run_of[lo_:hi_] = ri
        if not foil.any():
            foil[:] = True   # Fallback: keine Laeufe -> ganze Spur
        latref = float(np.median(lats[foil]))
        mx = 111320.0 * math.cos(math.radians(latref)); my = 111320.0
        xs = lons * mx; ys = lats * my
        bx0, by0, bx1, by1 = px(90), px(160), px(990), px(720)
        fx, fy = xs[foil], ys[foil]
        minx, maxx, miny, maxy = fx.min(), fx.max(), fy.min(), fy.max()
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
        dimw = max(px(6), 2)
        hlw = lw + max(px(4), 2)

        def _pts(i):
            return toXY(xs[i], ys[i]), toXY(xs[i + 1], ys[i + 1])

        for i in range(n - 1):
            if not (foil[i] and foil[i + 1]):     # nur innerhalb der Laeufe
                continue
            if hl is not None and run_of[i] == hl and run_of[i + 1] == hl:
                continue                          # gewaehlter Lauf: zuletzt (oben drauf)
            p0, p1 = _pts(i)
            if math.dist(p0, p1) > px(200):
                continue
            fill = (*DIM, 255) if hl is not None else (*colfn(i + 1), 255)
            d.line([p0, p1], fill=fill, width=dimw if hl is not None else lw)
        if hl is not None:                        # hervorgehobener Lauf: voll + dicker, oben
            for i in range(n - 1):
                if not (run_of[i] == hl and run_of[i + 1] == hl):
                    continue
                p0, p1 = _pts(i)
                if math.dist(p0, p1) > px(200):
                    continue
                d.line([p0, p1], fill=(*colfn(i + 1), 255), width=hlw)

    # Header (Ueberschrift in Brand-Blau; optionaler eigener Titel, sonst Spot-Name)
    head = (title or session.place_name or "Session")
    date_str = session.started_at.astimezone().strftime("%d.%m.%Y")
    sub = f"{session.place_name} · {date_str}" if (title and session.place_name) else date_str
    if hl is not None:                       # Einzel-Lauf: im Untertitel ausweisen
        sub = f"Lauf {hl + 1} · {sub}"
    d.text((px(90), px(64)), head, font=_font(px(58)), fill=(*prim, 255))
    # Untertitel (Ort · Datum): im gewaehlten Blau (prim) + fett — die kleine Schrift war
    # in der Sekundaerfarbe (hellgrau) auf hellem Hintergrund/Foto schlecht lesbar.
    d.text((px(90), px(128)), sub, font=_font(px(30)), fill=(*prim, 255))

    # Stats: bei Einzel-Lauf-Highlight aus dem gewaehlten Lauf, sonst Session-Summe.
    seg_for_stats = segs_all[hl] if hl is not None else None
    _catalog = stat_catalog(ar, seg_for_stats)
    cat = {k: (lbl, v, ok) for k, lbl, v, ok in _catalog}
    order = [k for k, *_ in _catalog]
    want = stats if stats is not None else [k for k in order if cat[k][2]]
    chosen = [k for k in order if k in want and cat[k][2]][:6]
    gy, gx, cw = px(772), px(90), px(300)
    for i, k in enumerate(chosen):
        lbl, val, _ok = cat[k]
        r, c = divmod(i, 3)
        x, y = gx + c * cw, gy + r * px(115)
        d.text((x, y), val, font=_font(px(50)), fill=(*prim, 255))
        d.text((x, y + px(58)), lbl.upper(), font=_font(px(24), False), fill=(*sec, 255))

    # Logo (Variante passend zur Text-Schattierung: helle Texte -> weisses Logo, dunkle -> navy)
    logo_path = _REPO / "web" / "public" / sh["logo"]
    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
        lh = px(54); logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
        img.alpha_composite(logo, (W - px(90) - logo.width, H - px(90)))

    buf = io.BytesIO()
    (img if bg == "transparent" else img.convert("RGB")).save(buf, "PNG")
    return buf.getvalue()
