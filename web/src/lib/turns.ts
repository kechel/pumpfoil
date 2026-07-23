// Carve-Anzeige-Helfer. Die Erkennung läuft server-seitig (GPS-Kurs-Turn ≥90°, eng,
// GET /api/sessions/:id/carves) — hier nur die Farbe: Kurvenlage-g (aus der GPS-Geometrie,
// v²/r) als Verlauf grün (0,1 g) → gelb (0,35 g) → rot (0,6 g). Realistischer Pumpfoil-
// Bereich (~0–0,6 g ≈ 0–31° Lage); g=0 = kein Carve (grau).

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Kurvenlage-g -> Farbe. g=0 = kein Carve (grau).
//
// WICHTIG (anders als die Speed-Palette, die auf min..max streckt): die UNTERE Hälfte ist an
// ABSOLUTE g-Werte gebunden und konstant — grün (0,1 g) → gelb (0,35 g) → rot (0,6 g). So sehen
// Läufe bis 0,6 g immer gleich aus (vergleichbar). Erst OBERHALB 0,6 g wird die Skala bis zum
// tatsächlichen Maximum des Laufs (`gMax`) gestreckt und läuft mit neuen Farben weiter:
// rot → magenta (0,6..Mitte) → weiß (Mitte..gMax). gMax<=0,6 -> reines Alt-Verhalten (Kappe bei rot).
export function carveColor(g: number, gMax = 0.6): string {
  if (g <= 0.02) return "#334155";
  const top = Math.max(0.6, gMax);
  const gc = Math.max(0.1, Math.min(g, top));
  if (gc <= 0.35) return lerpHex("#22c55e", "#eab308", (gc - 0.1) / 0.25);
  if (gc <= 0.6) return lerpHex("#eab308", "#dc2626", (gc - 0.35) / 0.25);
  const f = (gc - 0.6) / (top - 0.6);   // 0..1 über dem realistischen Bereich (top>0,6 hier garantiert)
  return f <= 0.5 ? lerpHex("#dc2626", "#d946ef", f / 0.5)
                  : lerpHex("#d946ef", "#ffffff", (f - 0.5) / 0.5);
}
