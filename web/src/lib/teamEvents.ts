// Team-Events (Stufe 3, docs/TEAMS.md): Vorlagen fuers Anlegen und Datumsanzeige in der Zeitzone des Events.
// Vorlagen nutzen nur Kennzahlen, die es schon gibt (Jan: neue wie „schnellster km" kommen spaeter).
import type { TeamEventTafel } from "./api";

const tafel = (kennzahl: string): TeamEventTafel => ({ kennzahl, sportart: "pumpfoil", accel_only: true, nur_brett: false, foil_band: "all" });

/** Naechster Samstag 00:00 bis Montag 00:00 (lokal) bzw. dieser Monat. */
function wochenende(): [Date, Date] {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  const e = new Date(d);
  e.setDate(e.getDate() + 2);
  return [d, e];
}
function monat(): [Date, Date] {
  const d = new Date();
  return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 1)];
}

export const EVENT_VORLAGEN: { key: string; titelKey: string; tafeln: TeamEventTafel[]; zeit?: () => [Date, Date] }[] = [
  { key: "wochenende_pumps", titelKey: "team.vorlage.wochenende_pumps", tafeln: [tafel("sum_pumps")], zeit: wochenende },
  { key: "wochenende_laeufe", titelKey: "team.vorlage.wochenende_laeufe", tafeln: [tafel("sum_runs")], zeit: wochenende },
  { key: "laengster_lauf", titelKey: "team.vorlage.laengster_lauf", tafeln: [tafel("duration")], zeit: wochenende },
  { key: "weitester_lauf", titelKey: "team.vorlage.weitester_lauf", tafeln: [tafel("distance")], zeit: wochenende },
  { key: "top_speed", titelKey: "team.vorlage.top_speed", tafeln: [tafel("speed")], zeit: wochenende },
  { key: "session_pumps", titelKey: "team.vorlage.session_pumps", tafeln: [tafel("session_pumps")], zeit: wochenende },
  { key: "monat_strecke", titelKey: "team.vorlage.monat_strecke", tafeln: [tafel("sum_distance")], zeit: monat },
];

export function neueEventTafel(): TeamEventTafel {
  return tafel("session_pumps");
}

/** Date -> Wert fuer <input type="datetime-local"> (lokale Zeit). */
export function alsEingabe(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function eventZeit(iso: string, zeitzone: string | null, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short", timeZone: zeitzone || undefined }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}
