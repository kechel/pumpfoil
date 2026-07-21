// Carve-Anzeige-Helfer. Die Erkennung läuft server-seitig (GPS-Kurs-Turn ≥90°,
// GET /api/sessions/:id/carves) — hier nur die Farbe: Kurvenlage-g als Verlauf
// grün (0,3 g) → gelb (1 g) → rot (2 g). g=0 = kein Carve (grau).

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Zentripetal-g -> Farbe (Kurvenlage). g=0 = kein Carve (grau). Sonst Verlauf
// grün (0,3 g) → gelb (1 g) → rot (2 g) — kräftig, gut sichtbar auf der Karte.
export function carveColor(g: number): string {
  if (g <= 0.05) return "#334155";
  const gc = Math.min(g, 2);
  return gc <= 1 ? lerpHex("#22c55e", "#eab308", (gc - 0.3) / 0.7)
                 : lerpHex("#eab308", "#dc2626", gc - 1);
}
