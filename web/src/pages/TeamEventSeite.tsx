// Ein Event mit allen Bestenlisten: /teams/:slug/events/:id (Jan, 01.11.2026: „eine event-ansicht fuer alle
// team-mitglieder mit den ergebnissen bei klick auf die event-kachel"). Laufend = aktueller Stand, danach das
// Ergebnis (eingefroren 24 h nach dem Ende). Gaeste sehen das Event nur bei oeffentlichem Team, in Gastform
// (Rang, Name, Initialen, Wert) — dieselben Daten, die die oeffentliche Teamseite ohnehin liefert.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, getToken, TeamAuftritt, TeamEvent, TeamTafelMitZeilen } from "../lib/api";
import { ChevronIcon } from "../components/Icons";
import TeamWappen from "../components/TeamWappen";
import TeamTafelBild from "../components/TeamTafelBild";
import { teamFarbStil } from "../lib/teamFarben";
import { tafelKurz } from "../lib/teamKennzahlen";
import { eventZeit, eventZeitraum, eventZeitraumGenau } from "../lib/teamEvents";
import { Tafel } from "./Team";
import { useI18n } from "../i18n";

/** Wie die Ergebnisse heissen: vorher Details, waehrenddessen aktueller Stand, danach Ergebnis. */
export function eventStandKey(status: TeamEvent["status"]): string {
  return status === "kommend" ? "team.event.details" : status === "beendet" ? "team.event.ergebnis" : "team.event.stand";
}

/** Vor dem Start (Jan, 01.11.2026): Countdown, gross das genaue Zeitfenster und bis wann Uploads zaehlen. */
function Countdown({ ev, lang, t }: { ev: TeamEvent; lang: string; t: (k: string, p?: Record<string, string>) => string }) {
  const [jetzt, setJetzt] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setJetzt(Date.now()), 1000); return () => clearInterval(h); }, []);
  const rest = Math.max(0, Math.floor((new Date(ev.start).getTime() - jetzt) / 1000));
  const teile: [number, string][] = [
    [Math.floor(rest / 86400), "team.event.tage"], [Math.floor(rest / 3600) % 24, "team.event.stunden"],
    [Math.floor(rest / 60) % 60, "team.event.minuten"], [rest % 60, "team.event.sekunden"],
  ];
  const [von, bis] = eventZeitraumGenau(ev.start, ev.ende, ev.zeitzone, lang);
  return (
    <div className="team-rand rounded-2xl border-2 p-5 text-center">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("team.event.startIn")}</p>
      <div className="mb-5 flex justify-center gap-3">
        {teile.map(([n, k]) => (
          <div key={k} className="min-w-[4.5rem] rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
            <div className="team-akzent text-3xl font-bold tabular-nums sm:text-4xl">{String(n).padStart(k === "team.event.tage" ? 1 : 2, "0")}</div>
            <div className="text-xs text-slate-400">{t(k)}</div>
          </div>
        ))}
      </div>
      <p className="text-xl font-bold text-slate-100 sm:text-2xl">{von}</p>
      <p className="text-sm text-slate-400">–</p>
      <p className="mb-4 text-xl font-bold text-slate-100 sm:text-2xl">{bis}</p>
      <p className="text-sm text-slate-300">{t("team.event.uploadsBis", { bis: eventZeit(ev.einfrieren_am, ev.zeitzone, lang) })}</p>
      <p className="mt-1 text-xs text-slate-400">{t("team.event.nochNichts")}</p>
    </div>
  );
}

export default function TeamEventSeite() {
  const { slug = "", id = "" } = useParams();
  const { t, lang } = useI18n();
  const gast = !getToken();
  const [team, setTeam] = useState<(TeamAuftritt & { id: number }) | null>(null);
  const [ev, setEv] = useState<TeamEvent | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [bild, setBild] = useState<TeamTafelMitZeilen | null>(null);

  useEffect(() => {
    const finden = (l: TeamEvent[] | undefined) => {
      const e = (l ?? []).find((x) => String(x.id) === id);
      if (e) setEv(e); else setFehlt(true);
    };
    if (gast) {
      api.teamOeffentlich(slug, "30d").then((d) => { setTeam(d); finden(d.events); }).catch(() => setFehlt(true));
    } else {
      api.team(slug).then(setTeam).catch(() => setFehlt(true));
      api.teamEvents(slug).then(finden).catch(() => setFehlt(true));
    }
  }, [slug, id, gast]);

  if (fehlt) return <p className="text-sm text-slate-400">{t("team.nichtGefunden")}</p>;
  if (!team || !ev) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;

  return (
    <div className="team-farbe w-full max-w-4xl" style={teamFarbStil(team.farbe)}>
      <Link to={`/teams/${team.slug}`} className="mb-3 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" />
        <TeamWappen name={team.name} logo={team.logo_url} farbe={team.farbe} size={20} />
        {team.name}
      </Link>
      <div className="team-rand mb-4 border-b-2 pb-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className={`team-akzent text-2xl font-bold leading-tight ${ev.status === "laeuft" ? "animate-pulse" : ""}`}>{ev.titel}</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs ${ev.status === "laeuft" ? "team-knopf animate-pulse font-bold" : "bg-slate-800 font-semibold text-slate-300"}`}>
            {t(`team.event.status.${ev.status}`)}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          {eventZeitraum(ev.start, ev.ende, ev.zeitzone, lang)}
          {ev.spots.length > 0 && <> · {ev.spots.map((s) => s.name ?? `#${s.id}`).join(", ")}</>}
        </p>
        {ev.tafeln.length > 0 && (
          <p className="text-sm text-slate-300">{t("team.event.gemessen")}: {ev.tafeln.map((tf) => tafelKurz(tf, t)).join(" · ")}</p>
        )}
        {ev.status === "auswertung" && (
          <p className="text-xs text-slate-400">{t("team.event.auswertungHinweis", { bis: eventZeit(ev.einfrieren_am, ev.zeitzone, lang) })}</p>
        )}
        {ev.beschreibung && <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{ev.beschreibung}</p>}
      </div>

      <h3 className="mb-2 text-lg font-bold text-slate-100">{t(eventStandKey(ev.status))}</h3>
      {ev.status === "kommend" ? (
        <Countdown ev={ev} lang={lang} t={t} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ev.tafeln.map((tf, i) => (
            <Tafel key={i} tf={tf} gast={gast} t={t} ohneFilter onBild={gast ? undefined : () => setBild(tf)} />
          ))}
        </div>
      )}

      {bild && <TeamTafelBild team={team} tafel={bild} onClose={() => setBild(null)} zeitraum={ev.titel} />}
    </div>
  );
}
