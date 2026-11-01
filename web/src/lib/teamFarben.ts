// Teamfarben (31.10.2026, docs/TEAMS.md): eine feste Palette statt freier Wahl, damit keine Teamseite
// unleserlich wird (Jan: „passende farbbereiche … vorgeben"). Je Farbe ein heller Ton fuer den dunklen
// Modus (Tailwind 400) und ein dunkler fuer den hellen (700) — beide halten auf dem jeweiligen Grund
// mindestens 4,5:1 als Textfarbe. Die Schluessel muessen zu `server/app/teams.py` FARBEN passen.
//
// Verwendung: `teamFarbStil(farbe)` an den Rahmen der Teamansicht haengen; darin setzen die Klassen
// `team-akzent` (Text), `team-knopf` (Flaeche + passende Schrift), `team-rand`, `team-flaeche`
// die Farbe (index.css). So kippt sie mit dem Hell-/Dunkel-Schalter wie der Rest.
import type { CSSProperties } from "react";

// Je Farbton drei Stufen (Jan, 01.11.2026: „mehr auswahl … helligkeitsstufen drueber und drunter"): `-hell`
// (Tailwind 300 im dunklen Modus, 600 im hellen), die bisherige Mittelstufe (400/700) und `-dunkel` (500/800).
// Wo eine Stufe die 4,5:1 nicht haelt, ist sie zum Nachbarton hin verschoben, bis sie es tut (scratchpad-Rechnung,
// Pruefgrund Navy/slate-900 bzw. Weiss/slate-100). Folge: bei Amber, Gelb, Limette und Gruen ist `-hell` im HELLEN
// Modus gleich der Mittelstufe — heller geht dort auf weissem Grund nicht, ohne unleserlich zu werden.
export const TEAM_FARBEN: Record<string, { dunkel: string; hell: string }> = {
  "cyan-hell": { dunkel: "#67e8f9", hell: "#0d7895" },
  cyan: { dunkel: "#22d3ee", hell: "#0e7490" },
  "cyan-dunkel": { dunkel: "#06b6d4", hell: "#155e75" },
  "blau-hell": { dunkel: "#93c5fd", hell: "#2563eb" },
  blau: { dunkel: "#60a5fa", hell: "#1d4ed8" },
  "blau-dunkel": { dunkel: "#3b82f6", hell: "#1e40af" },
  "indigo-hell": { dunkel: "#a5b4fc", hell: "#4f46e5" },
  indigo: { dunkel: "#818cf8", hell: "#4338ca" },
  "indigo-dunkel": { dunkel: "#6e74f4", hell: "#3730a3" },
  "violett-hell": { dunkel: "#c4b5fd", hell: "#7c3aed" },
  violett: { dunkel: "#a78bfa", hell: "#6d28d9" },
  "violett-dunkel": { dunkel: "#9166f7", hell: "#5b21b6" },
  "pink-hell": { dunkel: "#f9a8d4", hell: "#d1226e" },
  pink: { dunkel: "#f472b6", hell: "#be185d" },
  "pink-dunkel": { dunkel: "#ec4899", hell: "#9d174d" },
  "rot-hell": { dunkel: "#fca5a5", hell: "#d62424" },
  rot: { dunkel: "#f87171", hell: "#b91c1c" },
  "rot-dunkel": { dunkel: "#ef4444", hell: "#991b1b" },
  "orange-hell": { dunkel: "#fdba74", hell: "#c4420c" },
  orange: { dunkel: "#fb923c", hell: "#c2410c" },
  "orange-dunkel": { dunkel: "#f97316", hell: "#9a3412" },
  "amber-hell": { dunkel: "#fcd34d", hell: "#b45309" },
  amber: { dunkel: "#fbbf24", hell: "#b45309" },
  "amber-dunkel": { dunkel: "#f59e0b", hell: "#92400e" },
  "gelb-hell": { dunkel: "#fde047", hell: "#a16207" },
  gelb: { dunkel: "#facc15", hell: "#a16207" },
  "gelb-dunkel": { dunkel: "#eab308", hell: "#854d0e" },
  "limette-hell": { dunkel: "#bef264", hell: "#4d7c0f" },
  limette: { dunkel: "#a3e635", hell: "#4d7c0f" },
  "limette-dunkel": { dunkel: "#84cc16", hell: "#3f6212" },
  "gruen-hell": { dunkel: "#86efac", hell: "#15803d" },
  gruen: { dunkel: "#4ade80", hell: "#15803d" },
  "gruen-dunkel": { dunkel: "#22c55e", hell: "#166534" },
  "petrol-hell": { dunkel: "#5eead4", hell: "#0f7c73" },
  petrol: { dunkel: "#2dd4bf", hell: "#0f766e" },
  "petrol-dunkel": { dunkel: "#14b8a6", hell: "#115e59" },
};

export function teamFarbStil(farbe: string | null | undefined): CSSProperties {
  const f = TEAM_FARBEN[farbe || "cyan"] ?? TEAM_FARBEN.cyan;
  return { "--ta-d": f.dunkel, "--ta-h": f.hell } as CSSProperties;
}
