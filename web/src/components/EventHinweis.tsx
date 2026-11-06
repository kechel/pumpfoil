// Hinweise auf laufende Events (Jan, 06.11.2026): eine Zeile auf Home › Uebersicht fuer globale Events (laufend oder in
// den naechsten 24 h beginnend) und auf Home › Team fuer laufende Events der eigenen Teams. Je Event wegklickbar
// (localStorage `foil_event_weg`, nur eine Komfort-Erinnerung). Dazu `useEventAbzeichen` fuer den Reiter „Teams & Events".
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, TeamEventKurz } from "../lib/api";
import KachelUhr from "./KachelUhr";
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
            <Link to={`/teams/${e.team.slug}/events/${e.id}`} className="block hover:underline">
              <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-bold ${live ? "bg-brand-500 text-slate-950 event-puls" : "bg-slate-800 text-slate-300"}`}>
                {t(art === "team" ? "eventHinweis.teamLive" : live ? "eventHinweis.live" : "eventHinweis.bald")}
              </span>
              <span className="font-semibold text-slate-100">{e.titel}</span>
              {art === "team" && <span className="text-slate-400"> · {e.team.name}</span>}
              <span className="text-slate-400"> · </span>
              <KachelUhr ziel={live ? e.ende : e.start} text={t(live ? "team.event.endetIn" : "team.event.startIn")} lang={lang} /> →
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
