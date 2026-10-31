// Teamfarben (31.10.2026, docs/TEAMS.md): eine feste Palette statt freier Wahl, damit keine Teamseite
// unleserlich wird (Jan: „passende farbbereiche … vorgeben"). Je Farbe ein heller Ton fuer den dunklen
// Modus (Tailwind 400) und ein dunkler fuer den hellen (700) — beide halten auf dem jeweiligen Grund
// mindestens 4,5:1 als Textfarbe. Die Schluessel muessen zu `server/app/teams.py` FARBEN passen.
//
// Verwendung: `teamFarbStil(farbe)` an den Rahmen der Teamansicht haengen; darin setzen die Klassen
// `team-akzent` (Text), `team-knopf` (Flaeche + passende Schrift), `team-rand`, `team-flaeche`
// die Farbe (index.css). So kippt sie mit dem Hell-/Dunkel-Schalter wie der Rest.
import type { CSSProperties } from "react";

export const TEAM_FARBEN: Record<string, { dunkel: string; hell: string }> = {
  cyan: { dunkel: "#22d3ee", hell: "#0e7490" },
  blau: { dunkel: "#60a5fa", hell: "#1d4ed8" },
  indigo: { dunkel: "#818cf8", hell: "#4338ca" },
  violett: { dunkel: "#a78bfa", hell: "#6d28d9" },
  pink: { dunkel: "#f472b6", hell: "#be185d" },
  rot: { dunkel: "#f87171", hell: "#b91c1c" },
  orange: { dunkel: "#fb923c", hell: "#c2410c" },
  amber: { dunkel: "#fbbf24", hell: "#b45309" },
  gelb: { dunkel: "#facc15", hell: "#a16207" },
  limette: { dunkel: "#a3e635", hell: "#4d7c0f" },
  gruen: { dunkel: "#4ade80", hell: "#15803d" },
  petrol: { dunkel: "#2dd4bf", hell: "#0f766e" },
};

export function teamFarbStil(farbe: string | null | undefined): CSSProperties {
  const f = TEAM_FARBEN[farbe || "cyan"] ?? TEAM_FARBEN.cyan;
  return { "--ta-d": f.dunkel, "--ta-h": f.hell } as CSSProperties;
}
