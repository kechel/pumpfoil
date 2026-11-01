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

/** Sportarten eines Teams kurz und knapp („Pumpfoil · Wingfoil"), in der Reihenfolge seiner Bestenlisten. */
export function sportartenText(sp: string[] | undefined, t: (k: string) => string): string {
  return (sp ?? []).map((s) => t(`cls.sport.${s}`)).join(" · ");
}

/** Was eine Bestenliste misst, in einem Stueck: Kennzahl, dahinter die Sportart, wenn es nicht Pumpfoil ist. */
export function tafelKurz(tf: { kennzahl: string; sportart: string }, t: (k: string) => string): string {
  const name = t(kennzahl(tf.kennzahl).labelKey);
  return tf.sportart !== "pumpfoil" ? `${name} (${t(`cls.sport.${tf.sportart}`)})` : name;
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

/** Gesamtsummen eines Events ueber alle Teilnehmer — Schluessel = server/app/teams.py EVENT_SUMMEN, in dieser Reihenfolge. */
const kmGesamt = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 100000 ? 1 : 0)} km`);
const zeitGesamt = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
/** `labelKey1`: Einzahl fuer den Wert 1 („1 Teilnehmer“ statt „1 Participants“). */
export const EVENT_SUMMEN: { key: string; labelKey: string; labelKey1?: string; fmt: (v: number) => string }[] = [
  { key: "pumps", labelKey: "team.stat.pumps", fmt: (v) => v.toLocaleString() },
  { key: "distance_m", labelKey: "team.stat.strecke", fmt: kmGesamt },
  { key: "time_s", labelKey: "team.stat.zeit", fmt: zeitGesamt },
  { key: "sessions", labelKey: "team.stat.sessions", fmt: (v) => v.toLocaleString() },
  { key: "runs", labelKey: "team.stat.laeufe", fmt: (v) => v.toLocaleString() },
  { key: "spots", labelKey: "team.k.sum_spots", fmt: (v) => v.toLocaleString() },
  { key: "aktive", labelKey: "team.event.teilnehmer", labelKey1: "team.event.teilnehmer1", fmt: (v) => v.toLocaleString() },
];

type EventKurz = { tafeln: { kennzahl: string; sportart: string }[]; summen_auswahl?: string[]; summen?: Partial<Record<string, number>> };

/** „Gemessen: Längster Lauf · Event gesamt: Pumps, On-Foil-Strecke“ — Bestenlisten und gewaehlte Gesamtsummen. */
export function eventGemessen(e: EventKurz, t: (k: string) => string): string {
  const teile = e.tafeln.map((tf) => tafelKurz(tf, t));
  const summen = EVENT_SUMMEN.filter((k) => (e.summen_auswahl ?? []).includes(k.key));
  if (summen.length) teile.push(`${t("team.event.teamGesamt")}: ${summen.map((k) => t(k.labelKey)).join(", ")}`);
  return teile.join(" · ");
}

/** Stand der Gesamtsummen in einer Zeile: „12.400 Pumps · 87,3 km On-Foil-Strecke“. */
export function eventSummenText(e: EventKurz, t: (k: string) => string): string {
  return EVENT_SUMMEN.filter((k) => (e.summen_auswahl ?? []).includes(k.key))
    .map((k) => `${k.fmt(e.summen?.[k.key] ?? 0)} ${t(k.labelKey)}`).join(" · ");
}
