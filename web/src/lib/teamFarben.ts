// Teamfarben (31.10.2026, docs/TEAMS.md): eine feste Palette statt freier Wahl, damit keine Teamseite
// unleserlich wird (Jan: „passende farbbereiche … vorgeben"). Je Farbe ein heller Ton fuer den dunklen
// Modus (Tailwind 400) und ein dunkler fuer den hellen (700) — beide halten auf dem jeweiligen Grund
// mindestens 4,5:1 als Textfarbe. Die Schluessel muessen zu `server/app/teams.py` FARBEN passen.
//
// Verwendung: `teamFarbStil(farbe)` an den Rahmen der Teamansicht haengen; darin setzen die Klassen
// `team-akzent` (Text), `team-knopf` (Flaeche + passende Schrift), `team-rand`, `team-flaeche`
// die Farbe (index.css). So kippt sie mit dem Hell-/Dunkel-Schalter wie der Rest.
import type { CSSProperties } from "react";

// Je Farbton drei Stufen (Jan, 01.11.2026: „mehr auswahl … helligkeitsstufen", dann „zu aehnlich, mehr abstand").
// `dunkel`/`hell` sind die TEXTfarben (Akzent, Rahmen) im dunklen bzw. hellen Modus — die muessen 4,5:1 halten und
// koennen sich deshalb kaum unterscheiden. Den sichtbaren Unterschied tragen die FLAECHEN (Knoepfe, Wappen, Farbwahl):
// `-hell` ist dort Tailwind 200 (dunkler Modus) / 300 (heller) mit dunkler Schrift, `-dunkel` 700 / 900 mit weisser.
// Fehlt ein Flaechen-/Schriftwert, gilt die Textfarbe bzw. die Standardschrift (Navy dunkel, Weiss hell).
export const TEAM_FARBEN: Record<string, { dunkel: string; hell: string; dunkelFlaeche?: string; hellFlaeche?: string; dunkelAuf?: string; hellAuf?: string }> = {
  "cyan-hell": { dunkel: "#67e8f9", hell: "#0e7490", dunkelFlaeche: "#a5f3fc", hellFlaeche: "#67e8f9", hellAuf: "#020617" },
  cyan: { dunkel: "#22d3ee", hell: "#0e7490" },
  "cyan-dunkel": { dunkel: "#06b6d4", hell: "#155e75", dunkelFlaeche: "#0e7490", hellFlaeche: "#164e63", dunkelAuf: "#ffffff" },
  "blau-hell": { dunkel: "#93c5fd", hell: "#1d4ed8", dunkelFlaeche: "#bfdbfe", hellFlaeche: "#93c5fd", hellAuf: "#020617" },
  blau: { dunkel: "#60a5fa", hell: "#1d4ed8" },
  "blau-dunkel": { dunkel: "#3b82f6", hell: "#1e40af", dunkelFlaeche: "#1d4ed8", hellFlaeche: "#1e3a8a", dunkelAuf: "#ffffff" },
  "indigo-hell": { dunkel: "#a5b4fc", hell: "#4338ca", dunkelFlaeche: "#c7d2fe", hellFlaeche: "#a5b4fc", hellAuf: "#020617" },
  indigo: { dunkel: "#818cf8", hell: "#4338ca" },
  "indigo-dunkel": { dunkel: "#6e74f4", hell: "#3730a3", dunkelFlaeche: "#4338ca", hellFlaeche: "#312e81", dunkelAuf: "#ffffff" },
  "violett-hell": { dunkel: "#c4b5fd", hell: "#6d28d9", dunkelFlaeche: "#ddd6fe", hellFlaeche: "#c4b5fd", hellAuf: "#020617" },
  violett: { dunkel: "#a78bfa", hell: "#6d28d9" },
  "violett-dunkel": { dunkel: "#9166f7", hell: "#5b21b6", dunkelFlaeche: "#6d28d9", hellFlaeche: "#4c1d95", dunkelAuf: "#ffffff" },
  "pink-hell": { dunkel: "#f9a8d4", hell: "#be185d", dunkelFlaeche: "#fbcfe8", hellFlaeche: "#f9a8d4", hellAuf: "#020617" },
  pink: { dunkel: "#f472b6", hell: "#be185d" },
  "pink-dunkel": { dunkel: "#ec4899", hell: "#9d174d", dunkelFlaeche: "#be185d", hellFlaeche: "#831843", dunkelAuf: "#ffffff" },
  "rot-hell": { dunkel: "#fca5a5", hell: "#b91c1c", dunkelFlaeche: "#fecaca", hellFlaeche: "#fca5a5", hellAuf: "#020617" },
  rot: { dunkel: "#f87171", hell: "#b91c1c" },
  "rot-dunkel": { dunkel: "#ef4444", hell: "#991b1b", dunkelFlaeche: "#b91c1c", hellFlaeche: "#7f1d1d", dunkelAuf: "#ffffff" },
  "orange-hell": { dunkel: "#fdba74", hell: "#c2410c", dunkelFlaeche: "#fed7aa", hellFlaeche: "#fdba74", hellAuf: "#020617" },
  orange: { dunkel: "#fb923c", hell: "#c2410c" },
  "orange-dunkel": { dunkel: "#f97316", hell: "#9a3412", dunkelFlaeche: "#c2410c", hellFlaeche: "#7c2d12", dunkelAuf: "#ffffff" },
  "amber-hell": { dunkel: "#fcd34d", hell: "#b45309", dunkelFlaeche: "#fde68a", hellFlaeche: "#fcd34d", hellAuf: "#020617" },
  amber: { dunkel: "#fbbf24", hell: "#b45309" },
  "amber-dunkel": { dunkel: "#f59e0b", hell: "#92400e", dunkelFlaeche: "#b45309", hellFlaeche: "#78350f", dunkelAuf: "#ffffff" },
  "gelb-hell": { dunkel: "#fde047", hell: "#a16207", dunkelFlaeche: "#fef08a", hellFlaeche: "#fde047", hellAuf: "#020617" },
  gelb: { dunkel: "#facc15", hell: "#a16207" },
  "gelb-dunkel": { dunkel: "#eab308", hell: "#854d0e", dunkelFlaeche: "#a16207", hellFlaeche: "#713f12", dunkelAuf: "#ffffff" },
  "limette-hell": { dunkel: "#bef264", hell: "#4d7c0f", dunkelFlaeche: "#d9f99d", hellFlaeche: "#bef264", hellAuf: "#020617" },
  limette: { dunkel: "#a3e635", hell: "#4d7c0f" },
  "limette-dunkel": { dunkel: "#84cc16", hell: "#3f6212", dunkelFlaeche: "#4d7c0f", hellFlaeche: "#365314", dunkelAuf: "#ffffff" },
  "gruen-hell": { dunkel: "#86efac", hell: "#15803d", dunkelFlaeche: "#bbf7d0", hellFlaeche: "#86efac", hellAuf: "#020617" },
  gruen: { dunkel: "#4ade80", hell: "#15803d" },
  "gruen-dunkel": { dunkel: "#22c55e", hell: "#166534", dunkelFlaeche: "#15803d", hellFlaeche: "#14532d", dunkelAuf: "#ffffff" },
  "petrol-hell": { dunkel: "#5eead4", hell: "#0f766e", dunkelFlaeche: "#99f6e4", hellFlaeche: "#5eead4", hellAuf: "#020617" },
  petrol: { dunkel: "#2dd4bf", hell: "#0f766e" },
  "petrol-dunkel": { dunkel: "#14b8a6", hell: "#115e59", dunkelFlaeche: "#0f766e", hellFlaeche: "#134e4a", dunkelAuf: "#ffffff" },
};

export function teamFarbStil(farbe: string | null | undefined): CSSProperties {
  const f = TEAM_FARBEN[farbe || "cyan"] ?? TEAM_FARBEN.cyan;
  // IMMER alle sechs setzen: Custom Properties erben — ein Farbfeld in der Farbwahl (selbst `.team-farbe`) bekaeme
  // sonst die Flaeche der umgebenden Teamfarbe.
  return {
    "--ta-d": f.dunkel, "--ta-h": f.hell,
    "--ta-df": f.dunkelFlaeche ?? f.dunkel, "--ta-hf": f.hellFlaeche ?? f.hell,
    "--ta-da": f.dunkelAuf ?? "#020617", "--ta-ha": f.hellAuf ?? "#ffffff",
  } as CSSProperties;
}
