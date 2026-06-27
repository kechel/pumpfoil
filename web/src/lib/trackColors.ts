// Gemeinsame Track-Farbskalen für Karten (Session-Detail + Vergleich), damit beide
// Ansichten identisch einfärben. Einmal hier ändern -> überall konsistent.

// Lineare Skala blau(0) -> rot(1).
export function rampColor(t: number): string {
  const c = Math.min(Math.max(t, 0), 1);
  return `hsl(${(1 - c) * 240}, 85%, 55%)`;
}

// Speed-Farbskala (km/h) mit einstellbaren Grenzen; außerhalb -> schwarz.
export function speedColor(kmh: number, lo: number, hi: number): string {
  if (kmh < lo || kmh > hi) return "#000000";
  return rampColor((kmh - lo) / Math.max(hi - lo, 1));
}

// Divergierende Skala relativ zur optimalen Foil-Geschwindigkeit: blau = drunter,
// grün = exakt drauf, rot = drüber. Spanne ±20 % um Optimal (geclamped).
export const OPTIMAL_SPAN = 0.2;
export function optimalColor(kmh: number, opt: number): string {
  if (!opt || opt <= 0) return "#64748b";
  const r = kmh / opt;
  let hue: number;
  if (r <= 1) {
    const tt = Math.min(Math.max((r - (1 - OPTIMAL_SPAN)) / OPTIMAL_SPAN, 0), 1); // 0=blau,1=grün
    hue = 220 - tt * (220 - 140);
  } else {
    const tt = Math.min(Math.max((r - 1) / OPTIMAL_SPAN, 0), 1); // 0=grün,1=rot
    hue = 140 - tt * 140;
  }
  return `hsl(${hue}, 80%, 48%)`;
}
