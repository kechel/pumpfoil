// Carve-Anzeige-Helfer. Die Erkennung läuft server-seitig (Accel-Zentripetal-g-Modell,
// GET /api/sessions/:id/carves) — hier nur die Farbe: Kurvenlage-g als Verlauf
// blau (0,5 g) → weiß (1 g) → rot (2 g). Unter 0,5 g = keine Kurvenlage (gedämpft).

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Zentripetal-g -> Farbe (Kurvenlage). <0,5 g = gedämpft (kein Carve).
export function carveColor(g: number): string {
  if (g < 0.5) return "#334155";
  const gc = Math.min(g, 2);
  return gc <= 1 ? lerpHex("#2563eb", "#e5e7eb", (gc - 0.5) / 0.5)
                 : lerpHex("#e5e7eb", "#dc2626", gc - 1);
}
