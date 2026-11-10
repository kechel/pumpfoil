// Event-Kachel ohne Bestenlisten (Jan, 01.11.2026): Community-Seite und Event-Uebersicht /events. Wie die Kacheln der
// Teamseite: Wappen, Titel, Status, Sportart/Spots, Team und Zeitraum mit Countdown, erste Zeile der Beschreibung.
import { Link } from "react-router-dom";
import { TeamEventKurz } from "../lib/api";
import TeamWappen from "./TeamWappen";
import KachelUhr from "./KachelUhr";
import { LocationIcon } from "./Icons";
import { teamFarbStil } from "../lib/teamFarben";
import { eventTage } from "../lib/teamEvents";
import { useI18n } from "../i18n";
import TeamBanner from "./TeamBanner";

/** Bild unten in der Kachel (Jan, 10.11.2026: „die event-banner auch noch auf der community-seite in den kacheln … unten
 *  drunter"): Eventbild, sonst Teambild — der Server waehlt (api/teams._event_kurz), gleiches Seitenverhaeltnis wie auf der
 *  Eventseite, damit der Fokuspunkt dort wie hier passt. */
function KachelBild({ e }: { e: TeamEventKurz }) {
  // mt-auto: in einer Kachelreihe stehen die Bilder unten buendig, auch wenn der Text links kuerzer ist (Jan, 10.11.2026).
  return e.banner_url ? <div className="mt-auto pt-3"><TeamBanner url={e.banner_url} fokus={e.banner_fokus} className="!rounded-xl" /></div> : null;
}

/** EINE Event-Kachel fuer alle Stellen (Jan, 10.11.2026: „nimm doch die gleiche wie ueberall"): Community, alle Events,
 *  Teamseite. Groessere Karte mit Kalenderblock links (Monat, Tage, Wochentage; Jan 06.11.2026: „der zeitraum sollte
 *  groesser dargestellt werden"), rechts Abzeichen, Titel, Countdown und zwei Zeilen Beschreibung, unten das Bild.
 *  Globale Events tragen „Global", Team-Events Wappen und Teamname und die Teamfarbe (ausser `ohneTeam`, auf der eigenen
 *  Teamseite steht das Team schon im Kopf). */
export default function EventKurzKachel({ e, ohneTeam = false }: { e: TeamEventKurz; ohneTeam?: boolean }) {
  const { t, lang } = useI18n();
  const d = eventTage(e.start, e.ende, e.zeitzone, lang);
  const laeuft = e.status === "laeuft";
  const rand = e.global
    ? (laeuft ? "border-2 border-brand-400" : "border-2 border-brand-500/40")
    : (laeuft ? "team-rand border-2" : "border-2 border-slate-800");
  return (
    <Link to={`/teams/${e.team.slug}/events/${e.id}`} style={e.global ? undefined : teamFarbStil(e.team.farbe)}
      className={`${e.global ? "" : "team-farbe "}flex h-full flex-col rounded-2xl bg-slate-900/60 p-4 hover:border-brand-400 ${rand}`}>
      <div className="flex gap-4">
      <div className={`flex min-w-20 shrink-0 flex-col items-center justify-center rounded-xl px-1 py-2 text-center ${e.global ? "bg-brand-500/15" : "team-flaeche"}`}>
        <span className={`text-xs font-bold uppercase tracking-wide ${e.global ? "text-brand-700 dark:text-brand-300" : "team-akzent"}`}>{d.monat}</span>
        {/* einzeilig, auch bei „14–15" (Jan, 10.11.2026) */}
        <span className="whitespace-nowrap text-xl font-extrabold leading-tight text-slate-100 sm:text-2xl">{d.tage}</span>
        <span className="text-xs font-semibold text-slate-400">{d.wochentage}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs ${laeuft ? (e.global ? "bg-brand-500 font-bold text-slate-950" : "team-knopf font-bold") + " event-puls" : "bg-slate-800 font-semibold text-slate-300"}`}>
            {t(`team.event.status.${e.status}`)}
          </span>
          {e.global ? (
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">{t("team.event.global")}</span>
          ) : !ohneTeam && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 py-0.5 pl-0.5 pr-2 text-xs font-semibold text-slate-300">
              <TeamWappen name={e.team.name} logo={e.team.logo_url} farbe={e.team.farbe} size={16} /> {e.team.name}
            </span>
          )}
          {e.sportarten.map((sp) => (
            <span key={sp} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">{t(`cls.sport.${sp}`)}</span>
          ))}
          {e.spots.map((sp) => (
            <span key={sp.id} className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">
              <LocationIcon className="h-3.5 w-3.5" /> {sp.name ?? `#${sp.id}`}
            </span>
          ))}
        </div>
        <p className={`text-lg font-bold leading-snug ${e.global ? "text-brand-700 dark:text-brand-300" : "team-akzent"}`}>{e.titel}</p>
        {(e.status === "kommend" || laeuft) && (
          <p className="mt-0.5 text-sm"><KachelUhr ziel={e.status === "kommend" ? e.start : e.ende} text={t(e.status === "kommend" ? "team.event.startIn" : "team.event.endetIn")} lang={lang} /></p>
        )}
        {e.beschreibung?.trim() && <p className="mt-1 line-clamp-2 text-sm text-slate-300">{e.beschreibung.trim().split("\n")[0]}</p>}
      </div>
      </div>
      <KachelBild e={e} />
    </Link>
  );
}
