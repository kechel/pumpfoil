// Event-Kachel ohne Bestenlisten (Jan, 01.11.2026): Community-Seite und Event-Uebersicht /events. Wie die Kacheln der
// Teamseite: Wappen, Titel, Status, Sportart/Spots, Team und Zeitraum mit Countdown, erste Zeile der Beschreibung.
import { Link } from "react-router-dom";
import { TeamEventKurz } from "../lib/api";
import TeamWappen from "./TeamWappen";
import KachelUhr from "./KachelUhr";
import { LocationIcon } from "./Icons";
import { teamFarbStil } from "../lib/teamFarben";
import { eventZeitraum } from "../lib/teamEvents";
import { useI18n } from "../i18n";

export default function EventKurzKachel({ e }: { e: TeamEventKurz }) {
  const { t, lang } = useI18n();
  return (
    <Link to={`/teams/${e.team.slug}/events/${e.id}`} style={teamFarbStil(e.team.farbe)}
      className={`team-farbe block rounded-2xl border bg-slate-900/60 p-3 hover:border-slate-700 ${e.status === "laeuft" ? "team-rand border-2" : "border-slate-800"}`}>
      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
        <TeamWappen name={e.team.name} logo={e.team.logo_url} farbe={e.team.farbe} size={20} />
        <span className="team-akzent font-semibold">{e.titel}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${e.status === "laeuft" ? "team-knopf event-puls font-bold" : "bg-slate-800 font-semibold text-slate-300"}`}>
          {t(`team.event.status.${e.status}`)}
        </span>
        {e.sportarten.map((sp) => (
          <span key={sp} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">{t(`cls.sport.${sp}`)}</span>
        ))}
        {e.spots.map((sp) => (
          <span key={sp.id} className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">
            <LocationIcon className="h-3.5 w-3.5" /> {sp.name ?? `#${sp.id}`}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        {e.team.name} · {eventZeitraum(e.start, e.ende, e.zeitzone, lang)}
        {(e.status === "kommend" || e.status === "laeuft") && (
          <> · <KachelUhr ziel={e.status === "kommend" ? e.start : e.ende} text={t(e.status === "kommend" ? "team.event.startIn" : "team.event.endetIn")} lang={lang} /></>
        )}
      </p>
      {e.beschreibung?.trim() && <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-slate-200">{e.beschreibung.trim().split("\n")[0]}</p>}
    </Link>
  );
}
