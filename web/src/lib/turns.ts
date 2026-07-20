// Carve-Anzeige-Helfer. Die Erkennung läuft server-seitig (Accel-Fenster ∩ GPS-≥90°-Turn,
// GET /api/sessions/:id/carves) — hier nur die Farbe: Kurvenlage-g als Verlauf
// dunkelblau (0,3 g) → blau (0,5 g) → weiß (1 g) → rot (2 g). g=0 = kein Carve (grau).

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Zentripetal-g -> Farbe (Kurvenlage). g=0 = kein Carve (grau). Sonst:
// dunkelblau (0,3) → blau (0,5) → weiß (1) → rot (2).
export function carveColor(g: number): string {
  if (g <= 0.05) return "#334155";
  const gc = Math.min(g, 2);
  if (gc < 0.5) return lerpHex("#1e3a8a", "#2563eb", (gc - 0.3) / 0.2);
  return gc <= 1 ? lerpHex("#2563eb", "#e5e7eb", (gc - 0.5) / 0.5)
                 : lerpHex("#e5e7eb", "#dc2626", gc - 1);
}
