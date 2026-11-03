#!/usr/bin/env python3
"""Kontinent-Umrisse fuer die Team-Herkunft erzeugen (web/src/lib/kontinente.ts, Jan 03.11.2026).

Quelle: Natural Earth 1:110m Laender (gemeinfrei). Die Datei wird NICHT ins Repo gelegt, sondern hier angegeben:
    curl -L -o /tmp/ne.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson
    cd server && .venv/bin/python ../scripts/kontinente-erzeugen.py /tmp/ne.geojson
Russland westlich von 60° O zaehlt zu Europa, oestlich zu Asien; Frankreich ohne Uebersee; Groenland bei Nordamerika.
"""
import json
import math
import sys
from pathlib import Path

from shapely.geometry import box, shape
from shapely.ops import unary_union

KONT = {"Europe": "eu", "Africa": "af", "Asia": "as", "North America": "na", "South America": "sa", "Oceania": "oc"}
W, H, PAD = 48, 36, 0.07     # 4:3 wie die Flaggen


def proj(lon, lat):
    return lon, -math.degrees(math.log(math.tan(math.pi / 4 + math.radians(max(min(lat, 84), -60)) / 2)))


def main() -> None:
    d = json.load(open(sys.argv[1]))
    geo = {k: [] for k in KONT}
    alle = []
    for f in d["features"]:
        c, a3, g = f["properties"]["CONTINENT"], f["properties"]["ADM0_A3"], shape(f["geometry"])
        if c == "Antarctica":
            continue
        alle.append(g)
        if a3 == "RUS":
            geo["Europe"].append(g.intersection(box(-180, -90, 60, 90)))
            geo["Asia"].append(g.intersection(box(60, -90, 180, 90)))
            continue
        if a3 == "FRA":
            g = g.intersection(box(-10, 40, 20, 52))
        if c in geo:
            geo[c].append(g)
    clip = box(-180, -60, 180, 84)
    formen = {code: unary_union(geo[k]).intersection(clip) for k, code in KONT.items()}
    formen["eu"] = formen["eu"].intersection(box(-25, 34, 66, 72))
    formen["oc"] = formen["oc"].intersection(box(110, -50, 180, 0))
    formen["na"] = formen["na"].intersection(box(-170, 7, -10, 84))
    formen = {"earth": unary_union(alle).intersection(clip), **formen}
    out = {}
    for code, g in formen.items():
        bb = (-180, -60, 180, 84) if code == "earth" else g.bounds
        x0, y0 = proj(bb[0], bb[3])
        x1, y1 = proj(bb[2], bb[1])
        s = min(W * (1 - 2 * PAD) / (x1 - x0), H * (1 - 2 * PAD) / (y1 - y0))
        ox, oy = (W - (x1 - x0) * s) / 2, (H - (y1 - y0) * s) / 2
        gs = g.simplify((x1 - x0) / W * 0.2, preserve_topology=True)
        teile = []
        for p in (gs.geoms if hasattr(gs, "geoms") else [gs]):
            if p.geom_type != "Polygon" or p.is_empty:
                continue
            pts = [((proj(*c)[0] - x0) * s + ox, (proj(*c)[1] - y0) * s + oy) for c in p.exterior.coords]
            xs, ys = [q[0] for q in pts], [q[1] for q in pts]
            if max(xs) - min(xs) < 0.5 and max(ys) - min(ys) < 0.5:
                continue        # Inselchen unter einem halben Pixel
            teile.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts[:-1]) + "Z")
        out[code] = "".join(teile)
    zeilen = ["// Kontinent-Umrisse fuer die Team-Herkunft (Jan, 03.11.2026), erzeugt aus Natural Earth 1:110m (gemeinfrei),",
              "// Mercator, je Kontinent formatfuellend in 48x36 (4:3 wie die Flaggen). Nicht von Hand aendern — neu erzeugen mit",
              "// scripts/kontinente-erzeugen.py.",
              "export const KONTINENT_PFADE: Record<string, string> = {"]
    zeilen += [f'  {c}: "{v}",' for c, v in out.items()]
    zeilen.append("};")
    ziel = Path(__file__).resolve().parent.parent / "web/src/lib/kontinente.ts"
    ziel.write_text("\n".join(zeilen) + "\n")
    print(ziel, {c: len(v) for c, v in out.items()})


if __name__ == "__main__":
    main()
