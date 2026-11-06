// Hinweise auf laufende Events (Jan, 06.11.2026): eine Zeile auf Home › Uebersicht fuer globale Events (laufend oder in
// den naechsten 24 h beginnend) und auf Home › Team fuer laufende Events der eigenen Teams. Je Event wegklickbar
// (localStorage `foil_event_weg`, nur eine Komfort-Erinnerung). Dazu `useEventAbzeichen` fuer den Reiter „Teams & Events".
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, TeamEventKurz } from "../lib/api";
import KachelUhr from "./KachelUhr";
import EventKurzKachel from "./EventKurzKachel";
import { EventIcon, FlagIcon } from "./Icons";
import { CloseIcon } from "./Icons";
import { useI18n } from "../i18n";

const WEG_KEY = "foil_event_weg";
const BALD_MS = 24 * 3600 * 1000;

function weggeklickt(): string[] {
  try { return JSON.parse(localStorage.getItem(WEG_KEY) || "[]"); } catch { return []; }
}

export function EventHinweise({ art }: { art: "global" | "team" }) {
  const { t, lang } = useI18n();
  const [events, setEvents] = useState<TeamEventKurz[]>([]);
  const [weg, setWeg] = useState<string[]>(weggeklickt);
  useEffect(() => {
    (art === "global" ? api.teamsEventsAktuell() : api.teamsEventsMeine()).then(setEvents).catch(() => setEvents([]));
  }, [art]);
  const jetzt = Date.now();
  const zeigen = events.filter((e) => {
    if (weg.includes(`${e.team.slug}-${e.id}`)) return false;
    if (e.status === "laeuft") return true;
    return art === "global" && e.status === "kommend" && new Date(e.start).getTime() - jetzt < BALD_MS;
  });
  if (!zeigen.length) return null;
  const wegklicken = (k: string) => {
    const neu = [...weg, k].slice(-50);
    try { localStorage.setItem(WEG_KEY, JSON.stringify(neu)); } catch { /* privates Fenster */ }
    setWeg(neu);
  };
  return (
    <div className="mb-4 space-y-2">
      {zeigen.map((e) => {
        const k = `${e.team.slug}-${e.id}`;
        const live = e.status === "laeuft";
        return (
          <div key={k} className="relative rounded-2xl border border-brand-500/40 bg-brand-500/10 py-2.5 pl-4 pr-10 text-sm">
            {/* Titel in unserem dunklen Cyan (hell: brand-700, dunkel: brand-300), Abzeichen rechts und nicht fett
                (Jan, 06.11.2026). */}
            {/* Globale Events fuehren in die Community › Teams & Events (Jan, 06.11.2026: „dann lernt man direkt wo das
                immer steht"); Team-Events direkt aufs Event. */}
            <Link to={art === "global" ? "/community?tab=teams" : `/teams/${e.team.slug}/events/${e.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 hover:underline">
              <span className="min-w-0 flex-1">
                <EventIcon className="mr-1.5 inline h-4 w-4 align-[-2px] text-brand-600 dark:text-brand-300" />
                <span className="font-semibold text-brand-700 dark:text-brand-300">{e.titel}</span>
                {art === "team" && <span className="text-slate-400"> · {e.team.name}</span>}
                <span className="text-slate-400"> · </span>
                <KachelUhr ziel={live ? e.ende : e.start} text={t(live ? "team.event.endetIn" : "team.event.startIn")} lang={lang} /> →
              </span>
              <span className={`max-w-[7rem] shrink-0 rounded-xl px-2 py-0.5 text-center text-xs leading-tight ${live ? "bg-brand-500 text-slate-950 event-puls" : "bg-slate-800 text-slate-300"}`}>
                {t(art === "team" ? "eventHinweis.teamLive" : live ? "eventHinweis.live" : "eventHinweis.bald")}
              </span>
            </Link>
            <button onClick={() => wegklicken(k)} aria-label={t("banner.dismiss")} title={t("banner.dismiss")}
              className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Abzeichen fuer den Reiter „Teams & Events": LIVE, solange ein globales Event laeuft, sonst die Zahl der globalen
 *  Events, die in den naechsten Tagen beginnen (die Liste der Community-Seite). */
export function useEventAbzeichen(): { live: boolean; bald: number } {
  const [d, setD] = useState({ live: false, bald: 0 });
  useEffect(() => {
    api.teamsEventsAktuell().then((l) => setD({ live: l.some((e) => e.status === "laeuft"),
      bald: l.filter((e) => e.status === "kommend").length })).catch(() => {});
  }, []);
  return d;
}

/** Home › Team (Jan, 06.11.2026): die Events der eigenen Teams als Kacheln — laufende, kommende, letzte 7 Tage. */
export function TeamEventsListe() {
  const { t } = useI18n();
  const [events, setEvents] = useState<TeamEventKurz[] | null>(null);
  useEffect(() => { api.teamsEventsMeine().then(setEvents).catch(() => setEvents([])); }, []);
  if (!events?.length) return null;
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-center gap-2">
        <FlagIcon className="h-5 w-5 text-brand-400" />
        <h3 className="text-lg font-bold">{t("team.eventsMeineTeams")}</h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {events.map((e) => <EventKurzKachel key={`${e.team.slug}-${e.id}`} e={e} />)}
      </div>
    </div>
  );
}

/** Abzeichen fuer den Home-Reiter „Team": LIVE, solange ein Event eines eigenen Teams laeuft, sonst die Zahl der kommenden. */
export function useTeamEventAbzeichen(): { live: boolean; bald: number } {
  const [d, setD] = useState({ live: false, bald: 0 });
  useEffect(() => {
    api.teamsEventsMeine().then((l) => setD({ live: l.some((e) => e.status === "laeuft"),
      bald: l.filter((e) => e.status === "kommend").length })).catch(() => {});
  }, []);
  return d;
}

/** Das Abzeichen selbst (Reiter „Teams & Events" und Home › Team gleich). */
export function EventAbzeichen({ live, bald }: { live: boolean; bald: number }) {
  const { t } = useI18n();
  if (live) return <span className="event-puls ml-1.5 rounded-full bg-brand-500 px-1.5 py-0.5 text-xs font-bold uppercase text-slate-950">{t("team.event.status.laeuft")}</span>;
  if (bald > 0) return <span className="ml-1.5 rounded-full bg-slate-800 px-1.5 py-0.5 text-xs font-semibold text-brand-600 dark:text-brand-300">{bald}</span>;
  return null;
}
