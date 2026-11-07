// Team-Events (Stufe 3, docs/TEAMS.md): Vorlagen fuers Anlegen und Datumsanzeige in der Zeitzone des Events.
// Vorlagen nutzen nur Kennzahlen, die es schon gibt (Jan: neue wie „schnellster km" kommen spaeter).
import type { TeamEventTafel } from "./api";

const tafel = (kennzahl: string): TeamEventTafel => ({ kennzahl, sportart: "pumpfoil", accel_only: false, nur_brett: false, foil_band: "all" });

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

/** Laeuft der Zeitpunkt in der Event-Zeitzone genau um 0:00? */
function mitternacht(d: Date, zeitzone: string | null): boolean {
  try {
    const p = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zeitzone || undefined }).formatToParts(d);
    return p.find((x) => x.type === "hour")?.value === "00" && p.find((x) => x.type === "minute")?.value === "00";
  } catch {
    return false;
  }
}

/** Zeitfenster eines Events mit Wochentag. Das Ende zaehlt nicht mehr dazu ([start, ende)); liegen beide Grenzen auf
 *  Mitternacht (Wochenende, Monat …), stehen nur die Tage da und das Ende ist der LETZTE Tag — „Sa 07.11. – So 08.11.“
 *  statt „07.11. 0:00 – 09.11. 0:00“, das nach drei Tagen aussah (Jan, 01.11.2026). */
export function eventZeitraum(start: string, ende: string, zeitzone: string | null, lang: string, kurz = false): string {
  const a = new Date(start), b = new Date(ende);
  const tz = zeitzone || undefined;
  // `kurz` (Teilen-Bild, 07.11.2026): ohne Jahr, wenn das Event im laufenden Jahr liegt — sonst passte es nicht in die Zeile.
  const jahr = kurz && a.getFullYear() === new Date().getFullYear() && b.getFullYear() === a.getFullYear() ? undefined : "numeric" as const;
  try {
    if (mitternacht(a, zeitzone) && mitternacht(b, zeitzone)) {
      const f = new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", year: jahr, timeZone: tz });
      const letzter = new Date(b.getTime() - 12 * 3600 * 1000);   // sicher im Vortag, auch bei Zeitumstellung
      return `${f.format(a)} – ${f.format(letzter)}`;
    }
    const f = new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", year: jahr, hour: "2-digit", minute: "2-digit", timeZone: tz });
    return `${f.format(a)} – ${f.format(b)}`;
  } catch {
    return `${a.toLocaleString()} – ${b.toLocaleString()}`;
  }
}

/** Kalenderblock der Kachel globaler Events (06.11.2026): Monat, Tage („7–8"), Wochentage („Sa–So") in der Zeitzone
 *  des Events. Ein Ende um Mitternacht gehoert zum Vortag; ueber einen Monatswechsel stehen beide Monate da. */
export function eventTage(start: string, ende: string, zeitzone: string | null, lang: string):
    { monat: string; tage: string; wochentage: string } {
  const tz = zeitzone || undefined;
  const a = new Date(start);
  const b0 = new Date(ende);
  const b = mitternacht(b0, zeitzone) ? new Date(b0.getTime() - 12 * 3600 * 1000) : b0;
  try {
    const teil = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang, { ...o, timeZone: tz }).format(d);
    const ma = teil(a, { month: "short" }), mb = teil(b, { month: "short" });
    const ta = teil(a, { day: "numeric" }), tb = teil(b, { day: "numeric" });
    const wa = teil(a, { weekday: "short" }), wb = teil(b, { weekday: "short" });
    const gleicherTag = ma === mb && ta === tb;
    return {
      monat: (ma === mb ? ma : `${ma} – ${mb}`).replace(/\.$/, ""),
      tage: gleicherTag ? ta.replace(/\.$/, "") : `${ta.replace(/\.$/, "")}–${tb.replace(/\.$/, "")}`,
      wochentage: gleicherTag ? wa : `${wa}–${wb}`,
    };
  } catch {
    return { monat: "", tage: `${a.getDate()}–${b.getDate()}`, wochentage: "" };
  }
}

/** Das Zeitfenster IMMER mit Uhrzeit, fuer die grosse Anzeige vor dem Start. Ein Ende um Mitternacht steht als
 *  „24:00" am Vortag — „bis So 24:00" statt „bis Mo 0:00", das wie ein Tag mehr aussah. */
export function eventZeitraumGenau(start: string, ende: string, zeitzone: string | null, lang: string): [string, string] {
  const tz = zeitzone || undefined;
  try {
    const f = new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz });
    const b = new Date(ende);
    if (mitternacht(b, zeitzone)) {
      const tag = new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: tz })
        .format(new Date(b.getTime() - 12 * 3600 * 1000));
      return [f.format(new Date(start)), `${tag}, 24:00`];
    }
    return [f.format(new Date(start)), f.format(b)];
  } catch {
    return [new Date(start).toLocaleString(), new Date(ende).toLocaleString()];
  }
}

export function eventZeit(iso: string, zeitzone: string | null, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short", timeZone: zeitzone || undefined }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}
