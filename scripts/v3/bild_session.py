#!/usr/bin/env python3
"""Kartenbild einer Session fuer Jans Sichtpruefung (NUR Training/Pruefung, ~/ml-venv).
Hintergrund OSM-Kacheln (wenige, mit Kennung), darueber JRC-Wasserhaeufigkeit, Spur grau,
Laeufe blau, Laeufe „an Land" rot. Liest server/data/ml/bilder/s<id>.npz, schreibt s<id>.png."""
import io, math, pathlib, sys, urllib.request
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image
import rasterio
from rasterio.windows import from_bounds
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from jrc_wasser import JRC, kachel_name  # noqa: E402

ML = pathlib.Path(__file__).resolve().parents[2] / "server" / "data" / "ml"
FIG = 16
NUR_LAND = False
UA = {"User-Agent": "pumpfoil.org-training/1.0 (+https://pumpfoil.org)"}


def deg2num(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def num2deg(x, y, z):
    n = 2 ** z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon


def hintergrund(s, w, n, e, z):
    x0, y1 = deg2num(s, w, z); x1, y0 = deg2num(n, e, z)
    tx0, tx1, ty0, ty1 = int(x0), int(x1), int(y0), int(y1)
    if (tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 30:
        return None
    img = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            cache = ML / "bilder" / "kacheln" / f"{z}_{tx}_{ty}.png"
            cache.parent.mkdir(parents=True, exist_ok=True)
            if not cache.exists():
                req = urllib.request.Request(f"https://tile.openstreetmap.org/{z}/{tx}/{ty}.png", headers=UA)
                cache.write_bytes(urllib.request.urlopen(req, timeout=20).read())
            img.paste(Image.open(cache).convert("RGB"), ((tx - tx0) * 256, (ty - ty0) * 256))
    la_n, lo_w = num2deg(tx0, ty0, z); la_s, lo_e = num2deg(tx1 + 1, ty1 + 1, z)
    return img, (lo_w, lo_e, la_s, la_n)


def main(sid, zoom=None, titel=""):
    d = np.load(ML / "bilder" / f"s{sid}.npz")
    g, runs, land = d["gps"], d["runs"], d["land"]
    ok = ~((np.abs(g[:, 1]) < 1e-6) & (np.abs(g[:, 2]) < 1e-6))
    g = g[ok]
    lat, lon, t = g[:, 1], g[:, 2], g[:, 0]
    # Ausschnitt: um die Laeufe (nicht die ganze Autofahrt)
    m = np.zeros(t.size, bool)
    for a, b in (list(land) if NUR_LAND else list(runs) + list(land)):
        m |= (t >= a - 120000) & (t <= b + 120000)
    if not m.any():
        m[:] = True
    s, n = lat[m].min(), lat[m].max(); w, e = lon[m].min(), lon[m].max()
    pad = max(n - s, (e - w) * math.cos(math.radians(s)), 0.002) * 0.15
    s, n, w, e = s - pad, n + pad, w - pad / math.cos(math.radians(s)), e + pad / math.cos(math.radians(s))
    z = zoom or max(12, min(17, int(math.log2(360 / max(e - w, 1e-4))) + 1))
    fig, ax = plt.subplots(figsize=(FIG, FIG), dpi=100)
    bg = hintergrund(s, w, n, e, z)
    if bg:
        ax.imshow(bg[0], extent=bg[1], zorder=0)
    lo_s, la_s = kachel_name(lat.mean(), lon.mean())
    with rasterio.open(JRC / f"occurrence_{lo_s}_{la_s}.tif") as r:
        win = from_bounds(w, s, e, n, r.transform)
        a = r.read(1, window=win, boundless=True, fill_value=255).astype(float)
    a[a > 100] = np.nan
    ax.imshow(np.ma.masked_where(~(a > 0), a), extent=(w, e, s, n), cmap="Blues", vmin=0, vmax=100,
              alpha=0.45, zorder=1, interpolation="nearest")
    ax.plot(lon, lat, color="0.35", lw=1.0, zorder=2)
    for a0, b0 in runs:
        mm = (t >= a0) & (t <= b0)
        ax.plot(lon[mm], lat[mm], color="#0055ff", lw=3, zorder=3)
    for a0, b0 in land:
        mm = (t >= a0) & (t <= b0)
        ax.plot(lon[mm], lat[mm], color="#ff2200", lw=4, zorder=4)
    ax.set_xlim(w, e); ax.set_ylim(s, n)
    ax.set_aspect(1 / math.cos(math.radians((s + n) / 2)))
    ax.set_title(f"#{sid}  {titel}\nblau = Lauf · rot = Lauf (je nach Bild: an Land laut JRC bzw. vom v3-Veto verworfen) · "
                 f"Blaufaerbung = Wasserhaeufigkeit 1984-2021", fontsize=14)
    ax.text(0.99, 0.01, "© OpenStreetMap contributors · JRC Global Surface Water", transform=ax.transAxes,
            ha="right", va="bottom", fontsize=10, bbox=dict(fc="white", alpha=0.7))
    out = ML / "bilder" / f"s{sid}.png"
    fig.savefig(out, bbox_inches="tight", dpi=100)
    print(out)


if __name__ == "__main__":
    if sys.argv[1] == "--klein":
        FIG, NUR_LAND = 7, True
        for x in sys.argv[2:]:
            try:
                main(int(x))
            except Exception as e:
                print("fehler", x, e)
    else:
        main(int(sys.argv[1]), titel=" ".join(sys.argv[2:]))
