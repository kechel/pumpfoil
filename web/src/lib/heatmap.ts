import L from "leaflet";

// Heatmap-Zellen zeichnen — gemeinsam fuer die Spot-Karte (pages/Spots.tsx) und das Heatmap-Panel
// einer Spot-Seite (components/SpotHeatmap.tsx). Daten: GET /api/community/heatmap (server
// app/heatmap.py), Zellen als [x, y, Sessions] im Kachelraster der Stufe `z`.

export type HeatAntwort = { z: number | null; cells: [number, number, number][]; max: number };

// Heatmap-Farbe fuer t in [0, 1]: blau -> cyan -> gelb -> rot, wie man es von Heatmaps kennt.
export function heatFarbe(t: number): string {
  const stops: [number, number, number][] = [[59, 130, 246], [34, 211, 238], [250, 204, 21], [239, 68, 68]];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Laenge/Breite der Zellkanten einer Stufe z. */
export function zellKanten(z: number) {
  const n = 2 ** z;
  return {
    lon: (x: number) => (x / n) * 360 - 180,
    lat: (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  };
}

/** Zellen in die Gruppe zeichnen (vorher geleert). Farbe logarithmisch gegen `max`. */
export function heatZeichnen(grp: L.LayerGroup, renderer: L.Renderer, r: HeatAntwort) {
  grp.clearLayers();
  if (r.z == null) return;
  const { lon, lat } = zellKanten(r.z);
  const ln = Math.log(1 + r.max);
  for (const [x, y, c] of r.cells) {
    const t = Math.min(1, Math.log(1 + c) / ln);
    grp.addLayer(L.rectangle([[lat(y + 1), lon(x)], [lat(y), lon(x + 1)]], {
      renderer, stroke: false, interactive: false,
      fillColor: heatFarbe(t), fillOpacity: 0.35 + 0.45 * t,
    }));
  }
}
