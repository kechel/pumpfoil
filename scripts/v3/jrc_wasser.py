#!/usr/bin/env python3
"""Erkennung v3: Wasser je GPS-Punkt aus JRC Global Surface Water (NUR FUERS TRAINING).

Quelle: EC Joint Research Centre, Global Surface Water v1.4 (1984-2021), Ebene `occurrence`:
je 30-m-Zelle, in wie viel Prozent der Beobachtungen dort Wasser war (0-100). Das faengt ein, was
Jan zu OSM angemerkt hat: Pegel und Uferlinie wechseln — ein Ufer, das mal nass, mal trocken ist,
hat eine mittlere Haeufigkeit und landet unten in „unsicher", nicht in „Land".
Pekel et al. (2016), Nature 540, 418-422. https://global-surface-water.appspot.com

Laeuft im EIGENEN venv (~/ml-venv, rasterio), nicht im Server-venv:
  ~/ml-venv/bin/python scripts/v3/jrc_wasser.py
Liest server/data/ml/punkte.npz, laedt fehlende 10°-Kacheln nach server/data/ml/jrc/,
schreibt server/data/ml/wasser.npz: je Punkt occ (Zelle), occ_max/occ_min (5x5 Zellen, ±60 m).
"""
import math, pathlib, sys, urllib.request
import numpy as np
import rasterio
from rasterio.windows import Window
from scipy.ndimage import maximum_filter, minimum_filter

WURZEL = pathlib.Path(__file__).resolve().parents[2]
ML = WURZEL / "server" / "data" / "ml"
JRC = ML / "jrc"
URL = "https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/occurrence_{lon}_{lat}v1_4_2021.tif"


def kachel_name(lat, lon):
    """JRC-Kacheln: 10°, benannt nach linker Kante (Laenge) und OBERER Kante (Breite)."""
    lo = int(math.floor(lon / 10) * 10)
    la = int(math.floor(lat / 10) * 10 + 10)
    return (f"{abs(lo)}{'E' if lo >= 0 else 'W'}", f"{abs(la)}{'N' if la >= 0 else 'S'}")


def main():
    d = np.load(ML / "punkte.npz")
    lat, lon = d["lat"], d["lon"]
    ok = np.isfinite(lat) & np.isfinite(lon) & ~((np.abs(lat) < 1e-6) & (np.abs(lon) < 1e-6))
    occ = np.full(lat.size, -1, dtype=np.int16)      # -1 = nicht bestimmbar
    occ_max = np.full(lat.size, -1, dtype=np.int16)
    occ_min = np.full(lat.size, -1, dtype=np.int16)
    namen = {}
    for i in np.where(ok)[0]:
        namen.setdefault(kachel_name(lat[i], lon[i]), []).append(i)
    JRC.mkdir(parents=True, exist_ok=True)
    for (lo_s, la_s), idx in sorted(namen.items(), key=lambda kv: -len(kv[1])):
        p = JRC / f"occurrence_{lo_s}_{la_s}.tif"
        if not p.exists():
            try:
                urllib.request.urlretrieve(URL.format(lon=lo_s, lat=la_s), p)
            except Exception as e:
                print("fehlt", lo_s, la_s, e); continue
        idx = np.array(idx)
        with rasterio.open(p) as r:
            rows, cols = rasterio.transform.rowcol(r.transform, lon[idx], lat[idx])
            rows, cols = np.asarray(rows), np.asarray(cols)
            # Blockweise lesen (1000 x 1000 Zellen, ~30 km), 5x5-Nachbarschaft per Filter.
            B, P = 1000, 3
            schl = (rows // B) * 100000 + (cols // B)
            for sk in np.unique(schl):
                sel = np.where(schl == sk)[0]
                br, bc = int(rows[sel[0]] // B) * B, int(cols[sel[0]] // B) * B
                r0, c0 = max(br - P, 0), max(bc - P, 0)
                r1, c1 = min(br + B + P, r.height), min(bc + B + P, r.width)
                blk = r.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype(np.int16)
                gueltig = blk <= 100
                mx = maximum_filter(np.where(gueltig, blk, -1), size=5, mode="nearest")
                mn = minimum_filter(np.where(gueltig, blk, 101), size=5, mode="nearest")
                a, b_ = rows[sel] - r0, cols[sel] - c0
                drin = (a >= 0) & (a < blk.shape[0]) & (b_ >= 0) & (b_ < blk.shape[1])
                k = idx[sel[drin]]
                a, b_ = a[drin], b_[drin]
                z = blk[a, b_]
                occ[k] = np.where(z <= 100, z, -1)
                occ_max[k] = mx[a, b_]
                occ_min[k] = np.where(mn[a, b_] <= 100, mn[a, b_], -1)
        print(f"{lo_s}_{la_s}: {len(idx)} Punkte", flush=True)
    np.savez_compressed(ML / "wasser.npz", occ=occ, occ_max=occ_max, occ_min=occ_min)
    print("bestimmt", int((occ >= 0).sum()), "von", lat.size,
          "· Wasser (occ>=50)", int((occ >= 50).sum()), "· Land (occ_max==0)", int((occ_max == 0).sum()))


if __name__ == "__main__":
    main()
