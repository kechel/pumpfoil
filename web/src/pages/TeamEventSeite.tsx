// Ein Event mit allen Bestenlisten: /teams/:slug/events/:id (Jan, 01.11.2026: „eine event-ansicht fuer alle
// team-mitglieder mit den ergebnissen bei klick auf die event-kachel"). Laufend = aktueller Stand, danach das
// Ergebnis (eingefroren 24 h nach dem Ende). Gaeste sehen das Event nur bei oeffentlichem Team, in Gastform
// (Rang, Name, Initialen, Wert) — dieselben Daten, die die oeffentliche Teamseite ohnehin liefert.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, FoilBand, getToken, TeamAuftritt, TeamEvent, TeamRolle, TeamTafelMitZeilen } from "../lib/api";
import { ChevronIcon, SettingsIcon } from "../components/Icons";
import TeamEventsVerwalten from "../components/TeamEventsVerwalten";
import TeamWappen from "../components/TeamWappen";
import TeamBanner from "../components/TeamBanner";
import TeamTafelBild from "../components/TeamTafelBild";
import { teamFarbStil } from "../lib/teamFarben";
import { EVENT_SUMMEN, eventGemessen } from "../lib/teamKennzahlen";
import { eventZeit, eventZeitraum, eventZeitraumGenau } from "../lib/teamEvents";
import { Tafel } from "./Team";
import { useI18n } from "../i18n";

/** Wie die Ergebnisse heissen: vorher Details, waehrenddessen aktueller Stand, danach Ergebnis. */
export function eventStandKey(status: TeamEvent["status"]): string {
  return status === "kommend" ? "team.event.details" : status === "beendet" ? "team.event.ergebnis" : "team.event.stand";
}

/** Vor dem Start (Jan, 01.11.2026): Countdown, gross das genaue Zeitfenster und bis wann Uploads zaehlen. */
/** Tage/Std./Min./Sek. bis `ziel`, sekundengenau. `klein` fuer die Zeile ueber den Bestenlisten eines laufenden Events. */
function Uhr({ ziel, klein = false, t }: { ziel: string; klein?: boolean; t: (k: string) => string }) {
  const [jetzt, setJetzt] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setJetzt(Date.now()), 1000); return () => clearInterval(h); }, []);
  const rest = Math.max(0, Math.floor((new Date(ziel).getTime() - jetzt) / 1000));
  const teile: [number, string][] = [
    [Math.floor(rest / 86400), "team.event.tage"], [Math.floor(rest / 3600) % 24, "team.event.stunden"],
    [Math.floor(rest / 60) % 60, "team.event.minuten"], [rest % 60, "team.event.sekunden"],
  ];
  return (
    <div className={`flex justify-center ${klein ? "gap-2" : "mb-5 gap-3"}`}>
      {teile.map(([n, k]) => (
        <div key={k} className={`rounded-xl border border-slate-800 bg-slate-900/60 ${klein ? "min-w-[3.5rem] px-2 py-1" : "min-w-[4.5rem] px-3 py-2"}`}>
          <div className={`team-akzent font-bold tabular-nums ${klein ? "text-xl" : "text-3xl sm:text-4xl"}`}>{String(n).padStart(k === "team.event.tage" ? 1 : 2, "0")}</div>
          <div className="text-xs text-slate-400">{t(k)}</div>
        </div>
      ))}
    </div>
  );
}

function Countdown({ ev, lang, t }: { ev: TeamEvent; lang: string; t: (k: string, p?: Record<string, string>) => string }) {
  const [von, bis] = eventZeitraumGenau(ev.start, ev.ende, ev.zeitzone, lang);
  return (
    <div className="team-rand rounded-2xl border-2 p-5 text-center">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("team.event.startIn")}</p>
      <Uhr ziel={ev.start} t={t} />
      <p className="text-xl font-bold text-slate-100 sm:text-2xl">{von}</p>
      <p className="text-sm text-slate-400">–</p>
      <p className="mb-4 text-xl font-bold text-slate-100 sm:text-2xl">{bis}</p>
      <p className="text-sm text-slate-300">{t("team.event.uploadsBis", { bis: eventZeit(ev.einfrieren_am, ev.zeitzone, lang) })}</p>
      <p className="mt-1 text-xs text-slate-400">{t("team.event.nochNichts")}</p>
    </div>
  );
}

/** Oeffentliche Event-Adresse zum Teilen (Jan, 01.11.2026) — nur bei oeffentlichem, freigegebenem Team; Gaeste sehen
 *  dort die Bestenlisten in Gastform. */
/** Gesamtsummen ueber alle Teilnehmer (Jan, 01.11.2026) — nur die angeklickten, Kacheln wie die Teamstatistik. */
function EventSummen({ ev, t }: { ev: TeamEvent; t: (k: string) => string }) {
  const auswahl = EVENT_SUMMEN.filter((k) => (ev.summen_auswahl ?? []).includes(k.key));
  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("team.event.teamGesamt")}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {auswahl.map((k) => (
          <div key={k.key} className="team-rand rounded-xl border-2 bg-slate-900/60 p-3 text-center">
            <div className="team-akzent text-2xl font-bold leading-tight">{k.fmt(ev.summen?.[k.key] ?? 0)}</div>
            <div className="text-xs text-slate-400">{t(k.labelKey)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventTeilen({ url, titel, t }: { url: string; titel: string; t: (k: string) => string }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-400">{t("team.event.teilen")}</span>
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
        className="min-w-[14rem] flex-1 rounded-lg bg-slate-950 px-3 py-1.5 font-mono text-sm text-slate-100" />
      <button className="team-knopf rounded-xl px-3 py-1.5 text-sm font-semibold"
        onClick={() => navigator.clipboard?.writeText(url).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 2000); }).catch(() => {})}>
        {kopiert ? t("team.kopiert") : t("team.kopieren")}
      </button>
      {typeof navigator.share === "function" && (
        <button className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          onClick={() => navigator.share({ url, title: titel }).catch(() => {})}>{t("team.teilen")}</button>
      )}
    </div>
  );
}

export default function TeamEventSeite() {
  const { slug = "", id = "" } = useParams();
  const { t, lang } = useI18n();
  const gast = !getToken();
  const [team, setTeam] = useState<(TeamAuftritt & { id: number; bestenlisten_oeffentlich?: boolean; meine_rolle?: TeamRolle | null }) | null>(null);
  const [ev, setEv] = useState<TeamEvent | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [bild, setBild] = useState<TeamTafelMitZeilen | null>(null);
  const [popup, setPopup] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [sports, setSports] = useState<string[]>(["pumpfoil"]);
  const [bands, setBands] = useState<FoilBand[]>([]);
  const [alleSpots, setAlleSpots] = useState<{ id: number; name: string }[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    // Direkt das eine Event (01.11.2026) — auch aeltere, die in keiner Liste mehr stehen; Gaeste ueber den
    // oeffentlichen Weg (nur oeffentliche, freigegebene Teams).
    if (gast) {
      api.teamEventOeffentlich(slug, id).then((d) => { setTeam(d.team); setEv(d.event); }).catch(() => setFehlt(true));
    } else {
      api.team(slug).then(setTeam).catch(() => setFehlt(true));
      api.teamEvent(slug, id).then(setEv).catch(() => setFehlt(true));
    }
  }, [slug, id, gast]);

  // Zahnrad fuer Leitung/Moderatoren (Jan, 01.11.2026): dasselbe Popup wie in der Verwaltung.
  const verwalter = !gast && (team?.meine_rolle === "leiter" || team?.meine_rolle === "moderator");
  const popupAuf = () => {
    api.communitySports().then((x) => setSports(Array.from(new Set(["pumpfoil", ...x.map((y) => y.sport)])))).catch(() => {});
    api.foilBands(true, "pumpfoil").then(setBands).catch(() => {});
    api.spotMap(false, "all").then((m) => setAlleSpots(m.filter((x) => x.spot_id != null)
      .map((x) => ({ id: x.spot_id as number, name: x.spot })).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    setPopup(true);
  };
  const popupZu = () => {
    setPopup(false);
    api.teamEvent(slug, id).then(setEv).catch(() => nav(`/teams/${slug}`, { replace: true }));   // geloescht -> zurueck zum Team
  };

  if (fehlt) return <p className="text-sm text-slate-400">{t("team.nichtGefunden")}</p>;
  if (!team || !ev) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;

  return (
    <div className="team-farbe w-full max-w-4xl" style={teamFarbStil(team.farbe)}>
      <Link to={`/teams/${team.slug}`} className="mb-3 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" />
        <TeamWappen name={team.name} logo={team.logo_url} farbe={team.farbe} size={20} />
        {team.name}
      </Link>
      {meldung && <p className="mb-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">{meldung}</p>}
      {ev.banner_url ? <TeamBanner url={ev.banner_url} fokus={ev.banner_fokus} className="mb-4" />
        : ev.teambild_zeigen !== false && team.banner_url ? <TeamBanner url={team.banner_url} fokus={team.banner_fokus} className="mb-4" /> : null}
      <div className="team-rand mb-4 border-b-2 pb-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {verwalter && (
            <button onClick={popupAuf} title={t("team.event.bearbeiten")} aria-label={t("team.event.bearbeiten")}
              className="order-last ml-auto shrink-0 rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
              <SettingsIcon className="h-5 w-5" />
            </button>
          )}
          <h2 className={`team-akzent text-2xl font-bold leading-tight ${ev.status === "laeuft" ? "animate-pulse" : ""}`}>{ev.titel}</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs ${ev.status === "laeuft" ? "team-knopf animate-pulse font-bold" : "bg-slate-800 font-semibold text-slate-300"}`}>
            {t(`team.event.status.${ev.status}`)}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          {eventZeitraum(ev.start, ev.ende, ev.zeitzone, lang)}
          {ev.spots.length > 0 && <> · {ev.spots.map((s) => s.name ?? `#${s.id}`).join(", ")}</>}
        </p>
        {eventGemessen(ev, t) && <p className="text-sm text-slate-300">{t("team.event.gemessen")}: {eventGemessen(ev, t)}</p>}
        {ev.ohne_dateien && <p className="text-sm text-slate-400">{t("team.event.ohneDateienKurz")}</p>}
        {ev.status === "auswertung" && (
          <p className="text-xs text-slate-400">{t("team.event.auswertungHinweis", { bis: eventZeit(ev.einfrieren_am, ev.zeitzone, lang) })}</p>
        )}
        {ev.beschreibung && <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{ev.beschreibung}</p>}
      </div>

      <h3 className="mb-2 text-lg font-bold text-slate-100">{t(eventStandKey(ev.status))}</h3>
      {ev.status === "kommend" ? (
        <Countdown ev={ev} lang={lang} t={t} />
      ) : (
        <>
        {/* Waehrend das Event laeuft (Jan, 01.11.2026): wie lange noch. */}
        {ev.status === "laeuft" && (
          <div className="team-rand mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border-2 p-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("team.event.endetIn")}</span>
            <Uhr ziel={ev.ende} klein t={t} />
          </div>
        )}
        {(ev.summen_auswahl ?? []).length > 0 && <EventSummen ev={ev} t={t} />}
        <div className="grid gap-3 sm:grid-cols-2">
          {ev.tafeln.map((tf, i) => (
            <Tafel key={i} tf={tf} gast={gast} t={t} ohneFilter zurueck={{ zurueck: `/teams/${team.slug}/events/${ev.id}`, zurueckText: ev.titel }} onBild={gast ? undefined : () => setBild(tf)} />
          ))}
        </div>
        </>
      )}

      {/* Teilen-Zeile unter den Bestenlisten, ueber den Regeln (Jan, 01.11.2026). */}
      {team.bestenlisten_oeffentlich && <EventTeilen url={`${window.location.origin}/teams/${team.slug}/events/${ev.id}`} titel={ev.titel} t={t} />}

      {/* Event-Regeln als kleine Box statt Link auf die ganze Regelseite (Jan, 01.11.2026): nur was fuers Event gilt. */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="mb-1 text-sm font-semibold text-slate-200">{t("team.event.regelnTitel")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
          {t("team.regeln.events.text").split("\n").filter(Boolean).map((z, i) => <li key={i}>{z}</li>)}
        </ul>
      </div>

      {popup && (
        <TeamEventsVerwalten slug={team.slug} farbe={team.farbe} sports={sports} bands={bands} alleSpots={alleSpots}
          onMeldung={setMeldung} nurEvent={ev} onZu={popupZu} />
      )}

      {bild && <TeamTafelBild team={team} tafel={bild} onClose={() => setBild(null)} zeitraum={ev.titel} />}
    </div>
  );
}
