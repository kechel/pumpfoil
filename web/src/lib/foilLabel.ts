// Ein Foil als Badge-Text — mit Streckung (AR), wo wir sie kennen.
//
// Warum die AR mit dran (Jan, 25.08., auf Nutzerwunsch): sie ist der aussagekräftigste
// Anhaltspunkt für den Charakter eines Flügels (high performance vs. medium vs. ultra high) und
// entscheidet, ob ein fremder Track mit dem eigenen Material vergleichbar ist. Ohne belastbare
// Werte (Fläche/Spannweite fehlen oder sind 0) bleibt sie weg — eine erfundene Zahl wäre
// schlechter als keine.
export interface FoilLike {
  brand: string;
  model: string;
  size: string;
  aspect_ratio?: number | null;
  span_cm?: number | null;
  area_cm2?: number | null;
}

// AR = Spannweite² / Fläche. Bevorzugt den Serverwert, sonst selbst gerechnet.
export function foilAR(f: FoilLike | null | undefined): number | null {
  if (!f) return null;
  if (f.aspect_ratio && f.aspect_ratio > 0) return f.aspect_ratio;
  const s = f.span_cm ?? 0, a = f.area_cm2 ?? 0;
  if (s > 0 && a > 0) return (s * s) / a;
  return null;
}

export function foilLabel(f: FoilLike | null | undefined): string {
  if (!f) return "";
  const name = `${f.brand} ${f.model} ${f.size}`.trim();
  const ar = foilAR(f);
  return ar ? `${name} · AR ${ar.toFixed(1)}` : name;
}
