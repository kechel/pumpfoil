// Kennzahlen der Team-Bestenlisten (31.10.2026): Beschriftung und Format an EINER Stelle. Die
// Bestwert-Kennzahlen heissen und rechnen wie die Community-Rekorde (`REC_ITEMS` in pages/Home.tsx),
// die Summen sind neu. Schluessel = server/app/teams.py KENNZAHLEN.
import { fmtLaufDauer } from "./dauer";

const km = (v: number) => (v < 1000 ? `${Math.round(v)} m` : `${(v / 1000).toFixed(v < 100000 ? 1 : 0)} km`);
const ganz = (v: number) => Math.round(v).toLocaleString();
const stunden = (v: number) => (v < 3600 ? `${Math.round(v / 60)} min` : `${(v / 3600).toFixed(1)} h`);

export const TEAM_KENNZAHLEN: { key: string; labelKey: string; fmt: (v: number) => string; summe?: boolean }[] = [
  { key: "session_pumps", labelKey: "rec.sessionPumps", fmt: ganz },
  { key: "distance", labelKey: "rec.farthestRun", fmt: (v) => (v < 1000 ? `${Math.round(v)} m` : `${(v / 1000).toFixed(2)} km`) },
  { key: "duration", labelKey: "rec.longestRun", fmt: (v) => fmtLaufDauer(v) },
  { key: "speed", labelKey: "rec.topSpeed", fmt: (v) => `${(v * 3.6).toFixed(1)} km/h` },
  { key: "glide", labelKey: "rec.longestGlide", fmt: (v) => `${v.toFixed(1)} s` },
  { key: "runs", labelKey: "rec.mostRuns", fmt: ganz },
  { key: "session_distance", labelKey: "rec.sessionDistance", fmt: (v) => `${(v / 1000).toFixed(1)} km` },
  { key: "session_time", labelKey: "rec.sessionTime", fmt: (v) => `${Math.round(v / 60)} min` },
  { key: "sum_pumps", labelKey: "team.k.sum_pumps", fmt: ganz, summe: true },
  { key: "sum_runs", labelKey: "team.k.sum_runs", fmt: ganz, summe: true },
  { key: "sum_sessions", labelKey: "team.k.sum_sessions", fmt: ganz, summe: true },
  { key: "sum_distance", labelKey: "team.k.sum_distance", fmt: km, summe: true },
  { key: "sum_time", labelKey: "team.k.sum_time", fmt: stunden, summe: true },
  { key: "sum_spots", labelKey: "team.k.sum_spots", fmt: ganz, summe: true },
];

export function kennzahl(key: string) {
  return TEAM_KENNZAHLEN.find((k) => k.key === key) ?? { key, labelKey: key, fmt: (v: number) => String(v) };
}

/** Einladungs- bzw. Teamadresse fuer Links und QR-Codes. */
export function teamUrl(pfad: string): string {
  return `${window.location.origin}${pfad}`;
}

/** Fehlercode aus einer API-Fehlermeldung (`"409: {\"detail\":\"slug_belegt\"}"` -> "slug_belegt"). */
export function fehlerCode(e: unknown): string {
  const m = String((e as Error)?.message ?? e).match(/"detail"\s*:\s*"([^"]+)"/);
  return m ? m[1] : "unbekannt";
}
