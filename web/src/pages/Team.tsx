// Teamseite /teams/:slug (31.10.2026, docs/TEAMS.md). Eine Seite fuer drei Betrachter:
//  * Mitglieder: Bestenlisten mit Links zu den Sessions, Mitgliederliste, Austreten/Einstellungen.
//  * Angemeldete ohne Mitgliedschaft: freigegebener Auftritt, Beitreten-Knopf (wenn zugelassen),
//    Bestenlisten nur bei oeffentlichem Team.
//  * Gaeste (ohne Login): nur die oeffentliche Bestenliste — Rang, Name, Initialen, Wert. Keine Links.
// Die Regeln setzt der Server (server/app/teams.py); hier wird nur gezeigt, was er liefert.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken, TeamInfo, TeamLogbuchEintrag, TeamMitglied, TeamStatistik, TeamTafelMitZeilen } from "../lib/api";
import { Avatar, Card } from "../components/ui";
import { ChatBubbleIcon, ChevronIcon, LocationIcon, SettingsIcon, ShareIcon } from "../components/Icons";
import TeamTafelBild from "../components/TeamTafelBild";
import { openChatOverlay } from "../components/DmWidget";
import { eventZeitraum } from "../lib/teamEvents";
import { RegelnLink } from "./TeamRegeln";
import { eventStandKey } from "./TeamEventSeite";
import type { TeamEvent } from "../lib/api";
import TeamWappen from "../components/TeamWappen";
import TeamBanner from "../components/TeamBanner";
import { teamFarbStil } from "../lib/teamFarben";
import { eventSummenText, fehlerCode, kennzahl, sportartenText, tafelKurz } from "../lib/teamKennzahlen";
import { useI18n } from "../i18n";

const ZEITRAEUME: [string, string][] = [
  ["today", "period.today"], ["10d", "period.10d"], ["30d", "period.30d"], ["365d", "period.365d"], ["all", "period.all"],
];

type Kopf = Pick<TeamInfo, "name" | "slug" | "beschreibung" | "logo_url" | "farbe" | "mitglieder_anzahl"> & Partial<TeamInfo>;

/** Beitritts-Dialog — auch fuer die Einladungslinks. Das Kleingedruckte steht IMMER da (Jan, 31.10.2026):
 *  wer beitritt, stimmt zu, dass die Bestenlisten oeffentlich sein KOENNEN. */
export function BeitrittDialog({ name, oeffentlich, freigabeNoetig, busy, onJa, onNein }: {
  name: string; oeffentlich: boolean; freigabeNoetig: boolean; busy: boolean; onJa: () => void; onNein: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onNein}>
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-lg font-bold text-slate-100">{t("team.join.title", { name })}</h3>
        <p className="mb-3 text-sm text-slate-300">{freigabeNoetig ? `${t("team.join.anfrage")} ${t("team.join.anfrageProfil")}` : t("team.join.direkt")}</p>
        <p className="mb-4 text-xs leading-relaxed text-slate-400">
          {oeffentlich ? t("team.join.kleinOeffentlich") : t("team.join.kleinIntern")} {t("team.join.kleinAenderbar")}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onNein} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">{t("common.cancel")}</button>
          <button onClick={onJa} disabled={busy} className="team-knopf rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {freigabeNoetig ? t("team.join.anfragen") : t("team.join.beitreten")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Volle Teamadresse zum Teilen (Jan, 31.10.2026: „das muss klar und einfach kommuniziert werden, dass das eine
 *  adresse ist, die man veroeffentlichen / teilen kann, auch an menschen ohne login"). Der Satz darunter sagt,
 *  was Gaeste dort gerade WIRKLICH sehen — haengt an Freigabe und Schalter „Bestenlisten oeffentlich". */
function TeamAdresse({ kopf, t, kompakt = false }: { kopf: Kopf; t: (k: string, p?: Record<string, string>) => string; kompakt?: boolean }) {
  const url = `${window.location.origin}/teams/${kopf.slug}`;
  const [kopiert, setKopiert] = useState(false);
  const zustand = kopf.bestenlisten_oeffentlich ? "oeffentlich" : kopf.oeffentlich ? "wartet" : "intern";
  const zeile = (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
          className={`min-w-[14rem] flex-1 rounded-lg bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 ${kompakt ? "text-right" : ""}`} />
        <button className="team-knopf rounded-xl px-3 py-2 text-sm font-semibold"
          onClick={() => navigator.clipboard?.writeText(url).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 2000); }).catch(() => {})}>
          {kopiert ? t("team.kopiert") : t("team.kopieren")}
        </button>
        {typeof navigator.share === "function" && (
          <button className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            onClick={() => navigator.share({ url, title: kopf.name }).catch(() => {})}>{t("team.teilen")}</button>
        )}
      </div>
  );
  // Fremde (Jan, 01.11.2026): nur die Zeile neben „Beitreten“, ohne Karte und ohne Erklaerung.
  if (kompakt) return zeile;
  return (
    <Card className="mb-4 p-4">
      <p className="mb-1 text-sm font-semibold text-slate-100">{t("team.adresseTeilen.titel")}</p>
      {zeile}
      <p className={`mt-2 text-sm ${zustand === "oeffentlich" ? "text-slate-300" : "text-amber-700 dark:text-amber-300"}`}>
        {t(`team.adresseTeilen.${zustand}`)}
      </p>
    </Card>
  );
}

function Statistik({ s, t }: { s: TeamStatistik; t: (k: string, p?: Record<string, string>) => string }) {
  const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 100000 ? 1 : 0)} km`);
  const zeit = (sek: number) => (sek < 3600 ? `${Math.round(sek / 60)} min` : `${(sek / 3600).toFixed(1)} h`);
  const kacheln: [string, string][] = [
    [t("team.stat.pumps"), s.pumps.toLocaleString()],
    [t("team.stat.strecke"), km(s.distance_m)],
    [t("team.stat.zeit"), zeit(s.time_s)],
    [t("team.stat.sessions"), s.sessions.toLocaleString()],
    [t("team.stat.laeufe"), s.runs.toLocaleString()],
    [t("team.stat.aktiv"), `${s.aktive} / ${s.mitglieder}`],
  ];
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {kacheln.map(([l, v]) => (
        <div key={l} className="rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-center">
          <div className="team-akzent text-lg font-bold leading-tight">{v}</div>
          <div className="text-xs text-slate-400">{l}</div>
        </div>
      ))}
    </div>
  );
}

/** Vergangene Events, kompakt wie das Logbuch: je Event eine Zeile mit den Siegern; aufklappen zeigt die Bestenlisten. */
/** Vergangene Events, kompakt wie das Logbuch: je Event eine Zeile mit den Siegern; ein Klick oeffnet das Event. */
function VergangeneEvents({ events, slug, lang, t }: {
  events: TeamEvent[]; slug: string; lang: string; t: (k: string, p?: Record<string, string>) => string;
}) {
  return (
    <Card className="mt-4 p-4">
      <h3 className="mb-1 font-semibold text-slate-100">{t("team.event.vergangen")}</h3>
      <ul>
        {events.map((e) => (
          <li key={e.id} className="border-t border-slate-800 py-2 text-sm first:border-t-0">
            <Link to={`/teams/${slug}/events/${e.id}`} className="flex items-start gap-2 hover:underline">
              <span className="min-w-0 flex-1">
                <span className="team-akzent block font-semibold">{e.titel}</span>
                <span className="block text-xs text-slate-400">{eventZeitraum(e.start, e.ende, e.zeitzone, lang)}</span>
                {siegerText(e, t) && <span className="block text-slate-300">{siegerText(e, t)}</span>}
                {!e.tafeln.length && eventSummenText(e, t) && <span className="block text-slate-300">{eventSummenText(e, t)}</span>}
              </span>
              <ChevronIcon className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Sportarten eines Events: die seiner Bestenlisten, ohne Bestenliste die der Gesamtsummen. */
function eventSportarten(e: TeamEvent): string[] {
  const aus = e.tafeln.length ? e.tafeln.map((tf) => tf.sportart) : [e.summen_sportart ?? "pumpfoil"];
  return Array.from(new Set(aus));
}

/** Wer je Bestenliste vorn liegt, in einer Zeile: „Längster Lauf: Jan 1:42 · Höchstgeschwindigkeit: Olek 21 km/h“. */
function siegerText(e: TeamEvent, t: (k: string) => string): string {
  return e.tafeln.map((tf) => {
    const z = tf.zeilen[0];
    return z ? `${tafelKurz(tf, t)}: ${z.name ?? z.initialen} ${kennzahl(tf.kennzahl).fmt(z.value)}` : null;
  }).filter(Boolean).join(" · ");
}

function Logbuch({ eintraege, t, zurueck }: { eintraege: TeamLogbuchEintrag[]; t: (k: string, p?: Record<string, string>) => string; zurueck: { zurueck: string; zurueckText: string } }) {
  return (
    <Card className="mt-4 p-4">
      <h3 className="mb-1 font-semibold text-slate-100">{t("team.logbuch")}</h3>
      <p className="mb-2 text-xs text-slate-400">{t("team.logbuchHinweis")}</p>
      {eintraege.length === 0 ? <p className="text-sm text-slate-400">{t("team.logbuchLeer")}</p> : (
        <ul>
          {eintraege.map((e, i) => {
            const k = kennzahl(e.kennzahl);
            const p = { name: e.name ?? "—", was: t(k.labelKey), wert: k.fmt(e.wert),
                        vorher: e.vorher_name ?? "—", vorherWert: e.vorher_wert != null ? k.fmt(e.vorher_wert) : "" };
            const text = e.vorher_wert == null ? t("team.logbuch.start", p) : t("team.logbuch.gebrochen", p);
            const datum = e.gefahren_am ?? e.erfasst_am;
            return (
              <li key={i} className="flex items-start gap-2 border-t border-slate-800 py-2 text-sm first:border-t-0">
                <span className="w-20 shrink-0 text-xs text-slate-400">{datum ? new Date(datum).toLocaleDateString() : ""}</span>
                <span className="min-w-0 flex-1 text-slate-200">
                  {e.session_id ? <Link to={`/sessions/${e.session_id}`} state={zurueck} className="hover:underline">{text}</Link> : text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function Tafel({ tf, gast, t, onBild, ohneFilter = false, zurueck }: {
  tf: TeamTafelMitZeilen; gast: boolean; t: (k: string, p?: Record<string, string>) => string; onBild?: () => void;
  /** Filterzeile („auch nur GPS" …) weglassen — auf der Event-Seite (Jan, 01.11.2026). */
  ohneFilter?: boolean;
  /** Zurueck-Link der Session- und Profilseite („‹ Eventname" statt „‹ Sessions", Jan 01.11.2026), wie in LaengsteLaeufe. */
  zurueck?: { zurueck: string; zurueckText: string };
}) {
  const k = kennzahl(tf.kennzahl);
  const filter = [
    tf.sportart !== "pumpfoil" ? t(`cls.sport.${tf.sportart}`) : null,
    tf.nur_teamspots ? t("team.tafel.nurTeamspots") : null,
    tf.nur_brett ? t("team.tafel.nurBrett") : null,
    // „auch nur GPS" steht nicht mehr an jeder Bestenliste (Jan, 01.11.2026) — das erklaert das Team, wenn es will.
  ].filter(Boolean).join(" · ");
  return (
    <Card className="p-4">
      <div className="flex items-start gap-2">
        <h3 className="team-akzent min-w-0 flex-1 font-semibold">{t(k.labelKey)}</h3>
        {onBild && tf.zeilen.length > 0 && (
          <button onClick={onBild} title={t("team.bild.titel")} aria-label={t("team.bild.titel")}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <ShareIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {filter && !ohneFilter && <p className="text-xs text-slate-400">{filter}</p>}
      {tf.zeilen.length === 0 ? <p className="mt-2 text-sm text-slate-400">{t("team.tafel.leer")}</p> : (
        <ol className="mt-2">
          {tf.zeilen.map((z) => {
            const wert = k.fmt(z.value);
            return (
              <li key={`${z.rang}-${z.user_id ?? z.name}`} className="flex items-center gap-2 border-t border-slate-800 py-1.5 first:border-t-0">
                <span className={`w-6 shrink-0 text-right text-sm font-bold ${z.rang <= 3 ? "team-akzent" : "text-slate-400"}`}>{z.rang}</span>
                {gast || !z.user_id ? (
                  <span className="team-farbe team-flaeche inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-slate-200">{z.initialen}</span>
                ) : <Avatar name={z.name} url={z.avatar_url} seed={z.user_id} userId={z.user_id} size={28} linkState={zurueck} />}
                <span className="min-w-0 flex-1">
                  {gast || !z.user_id ? <span className="block truncate text-sm text-slate-100">{z.name ?? "—"}</span>
                    : <Link to={`/foiler/${z.user_id}`} state={zurueck} className="pf-name block truncate text-sm text-slate-100 hover:text-brand-400">{z.name ?? "—"}</Link>}
                  {!gast && z.started_at && (
                    <span className="block truncate text-xs text-slate-400">
                      {new Date(z.started_at).toLocaleDateString()}{z.spot ? ` · ${z.spot}` : ""}
                    </span>
                  )}
                </span>
                {!gast && z.session_id
                  ? <Link to={`/sessions/${z.session_id}`} state={zurueck} className="shrink-0 text-sm font-semibold text-slate-100 hover:underline">{wert}</Link>
                  : <span className="shrink-0 text-sm font-semibold text-slate-100">{wert}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export default function Team() {
  const { slug = "" } = useParams();
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const gast = !getToken();
  const [kopf, setKopf] = useState<Kopf | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [period, setPeriod] = useState("30d");
  const [tafeln, setTafeln] = useState<TeamTafelMitZeilen[] | null>(null);
  const [mitglieder, setMitglieder] = useState<TeamMitglied[] | null>(null);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [stat, setStat] = useState<TeamStatistik | null>(null);
  const [logbuch, setLogbuch] = useState<TeamLogbuchEintrag[] | null>(null);
  const [bild, setBild] = useState<{ tf: TeamTafelMitZeilen; zeile: string } | null>(null);
  const [events, setEvents] = useState<TeamEvent[] | null>(null);

  const laden = () => {
    if (gast) return;
    api.team(slug).then((d) => {
      if (d.slug && d.slug !== slug) { nav(`/teams/${d.slug}`, { replace: true }); return; }
      setKopf(d);
      if (d.darf_mitglieder) api.teamMitglieder(slug).then((m) => setMitglieder(m.mitglieder)).catch(() => setMitglieder(null));
    }).catch(() => setFehlt(true));
  };
  useEffect(laden, [slug]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gast) {
      api.teamOeffentlich(slug, period).then((d) => { setKopf(d); setTafeln(d.tafeln); setEvents(d.events ?? []); }).catch(() => setFehlt(true));
    } else if (kopf?.darf_bestenlisten) {
      api.teamBestenlisten(slug, period).then((d) => setTafeln(d.tafeln)).catch(() => setTafeln([]));
      api.teamStatistik(slug, period).then(setStat).catch(() => setStat(null));
    }
  }, [slug, period, gast, kopf?.darf_bestenlisten]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gast && kopf?.darf_bestenlisten) {
      api.teamLogbuch(slug).then(setLogbuch).catch(() => setLogbuch(null));
      api.teamEvents(slug).then(setEvents).catch(() => setEvents(null));
    }
  }, [slug, gast, kopf?.darf_bestenlisten]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (fehlt) return <p className="text-sm text-slate-400">{t("team.nichtGefunden")}</p>;
  if (!kopf) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;

  const freigabeNoetig = !kopf.automatisch_akzeptieren;
  const beitreten = () => {
    setBusy(true);
    api.teamBeitreten(slug).then((r) => {
      setDialog(false);
      setMeldung(r.status === "aktiv" ? t("team.join.erfolg") : t("team.join.angefragt"));
      laden();
    }).catch((e) => setMeldung(t(`team.err.${fehlerCode(e)}`))).finally(() => setBusy(false));
  };
  // Oben: kommende, laufende und bis eine Woche nach dem Ende auch beendete Events; aeltere unten kompakt
  // (Jan, 01.11.2026). Reihenfolge oben: laeuft, kommend (naechstes zuerst), dann die gerade vorbei sind.
  const RANG = { laeuft: 0, kommend: 1, auswertung: 2, beendet: 3 } as const;
  const grenze = Date.now() - 7 * 24 * 3600 * 1000;
  const eventsOben = (events ?? []).filter((e) => e.status !== "beendet" || new Date(e.ende).getTime() > grenze)
    .sort((a, b) => RANG[a.status] - RANG[b.status] || (a.status === "kommend" ? a.start.localeCompare(b.start) : b.ende.localeCompare(a.ende)));
  const eventsUnten = (events ?? []).filter((e) => !eventsOben.includes(e)).sort((a, b) => b.ende.localeCompare(a.ende));
  const austreten = () => {
    if (!window.confirm(kopf.mein_status === "angefragt" ? t("team.zurueckziehenFrage") : t("team.austretenFrage", { name: kopf.name }))) return;
    api.teamAustreten(slug).then(() => { setMitglieder(null); setTafeln(null); laden(); })
      .catch((e) => setMeldung(t(`team.err.${fehlerCode(e)}`)));
  };

  return (
    <div className="team-farbe w-full max-w-4xl" style={teamFarbStil(kopf.farbe)}>
      {!gast && (
        <Link to="/teams" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
          <ChevronIcon className="h-4 w-4 rotate-180" /> {t("team.meine")}
        </Link>
      )}
      {kopf.banner_url && <TeamBanner url={kopf.banner_url} fokus={kopf.banner_fokus} className="mb-4" />}
      {/* Kopf als Raster: Wappen links ueber alle Zeilen; Name + Zahnrad oben; darunter Mitglieder · oeffentlich ·
          Sportarten, und der Team-Chat rechtsbuendig in derselben Spalte wie das Zahnrad (Jan, 01.11.2026). */}
      <div className="team-rand mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b-2 pb-4">
        <div className="row-span-3"><TeamWappen name={kopf.name} logo={kopf.logo_url} farbe={kopf.farbe} size={64} /></div>
        <h2 className="team-akzent text-2xl font-bold leading-tight">{kopf.name}</h2>
        <div className="justify-self-end">
          {(kopf.meine_rolle === "leiter" || kopf.meine_rolle === "moderator") && (
            <Link to={`/teams/${kopf.slug}/verwalten`} title={t("team.tab.verwalten")}
              className="block rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
              <SettingsIcon className="h-5 w-5" />
            </Link>
          )}
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-slate-400">
            {t("team.mitgliederAnzahl", { n: String(kopf.mitglieder_anzahl) })}
            {kopf.bestenlisten_oeffentlich && <> · {t("team.oeffentlichBadge")}</>}
            {!!kopf.sportarten?.length && <> · {sportartenText(kopf.sportarten, t)}</>}
          </p>
          {/* Offene Anfragen fuer Leitung/Moderatoren, anklickbar zur Verwaltung (Jan, 01.11.2026). */}
          {!!kopf.anfragen_offen && (
            <Link to={`/teams/${kopf.slug}/verwalten`}
              className="ml-auto inline-flex items-center rounded-xl bg-brand-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-brand-400">
              {t(kopf.anfragen_offen === 1 ? "team.anfragenEins" : "team.anfragenViele", { n: String(kopf.anfragen_offen) })}
            </Link>
          )}
          {kopf.chat_scope && (
            <button onClick={() => openChatOverlay(kopf.chat_scope as string, t("team.chatTitel", { name: kopf.name }))}
              className={`${kopf.anfragen_offen ? "" : "ml-auto "}inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800`}>
              <ChatBubbleIcon className="team-akzent h-4 w-4" /> {t("team.chat")}
            </button>
          )}
        </div>
        {kopf.beschreibung && <p className="col-span-2 mt-1 whitespace-pre-line text-sm text-slate-300">{kopf.beschreibung}</p>}
      </div>

      {meldung && <p className="mb-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">{meldung}</p>}

      {/* Fremde sehen die Teamadresse nur kompakt neben „Beitreten“, wenn das Team oeffentlich UND freigegeben ist;
          Mitglieder sehen sie immer, als Karte weiter unten (Jan, 01.11.2026). */}
      {!gast && kopf.mein_status !== "aktiv" && ((!kopf.mein_status && kopf.anmeldungen_zulassen) || kopf.bestenlisten_oeffentlich) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {!kopf.mein_status && kopf.anmeldungen_zulassen && (
            <button onClick={() => setDialog(true)} className="team-knopf shrink-0 rounded-xl px-4 py-2 font-semibold">
              {t("team.join.knopf")}
            </button>
          )}
          {kopf.bestenlisten_oeffentlich && <TeamAdresse kopf={kopf} t={t} kompakt />}
        </div>
      )}
      {kopf.mein_status === "angefragt" && (
        <p className="mb-4 text-sm text-slate-300">{t("team.join.wartet")}{" "}
          <button onClick={austreten} className="underline hover:text-slate-100">{t("team.zurueckziehen")}</button>
        </p>
      )}


      {eventsOben.length > 0 && (
        <div className="mb-5 space-y-3">
          {eventsOben.map((e) => (
            // Kompakte Kachel; ein Klick oeffnet das Event mit allen Bestenlisten (Jan, 01.11.2026).
            <Link key={e.id} to={`/teams/${kopf.slug}/events/${e.id}`} className="block">
              <Card className={`p-4 hover:border-slate-700 ${e.status === "laeuft" ? "team-rand border-2" : ""}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className={`team-akzent text-lg font-bold ${e.status === "laeuft" ? "animate-pulse" : ""}`}>{e.titel}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${e.status === "laeuft" ? "team-knopf animate-pulse font-bold" : "bg-slate-800 font-semibold text-slate-300"}`}>
                    {t(`team.event.status.${e.status}`)}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{eventZeitraum(e.start, e.ende, e.zeitzone, lang)}</p>
                {/* Nur Titel, Zeitraum, Sportart, Spots und eigener Text (Jan, 01.11.2026) — Kennzahlen und Stand stehen auf
                    der Event-Seite. Sportart und Spots als Abzeichen wie in den Session-Kacheln. */}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {eventSportarten(e).map((sp) => (
                    <span key={sp} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">{t(`cls.sport.${sp}`)}</span>
                  ))}
                  {e.spots.map((sp) => (
                    <span key={sp.id} className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">
                      <LocationIcon className="h-3.5 w-3.5" /> {sp.name ?? `#${sp.id}`}
                    </span>
                  ))}
                </div>
                {e.beschreibung && <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-slate-400">{e.beschreibung}</p>}
                <p className="team-akzent mt-2 text-sm font-semibold">{t(eventStandKey(e.status))} →</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {(gast || kopf.darf_bestenlisten) && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {ZEITRAEUME.map(([k, lk]) => (
              <button key={k} onClick={() => setPeriod(k)}
                className={`rounded-full px-3 py-1 text-sm ${period === k ? "team-knopf font-semibold" : "border border-slate-700 text-slate-300 hover:bg-slate-800"}`}>
                {t(lk)}
              </button>
            ))}
          </div>
          {stat && <Statistik s={stat} t={t} />}
          {!tafeln ? <p className="text-sm text-slate-400">{t("common.loading")}</p> : tafeln.length === 0
            ? <p className="text-sm text-slate-400">{t("team.keineTafeln")}</p>
            : <div className="grid gap-3 sm:grid-cols-2">{tafeln.map((tf) => (
                <Tafel key={tf.id ?? tf.kennzahl} tf={tf} gast={gast} t={t} zurueck={{ zurueck: `/teams/${kopf.slug}`, zurueckText: kopf.name }} onBild={gast ? undefined : () => setBild({ tf, zeile: t(ZEITRAEUME.find(([k]) => k === period)?.[1] ?? "period.30d") })} />
              ))}</div>}
        </>
      )}
      {!gast && !kopf.darf_bestenlisten && kopf.mein_status !== "angefragt" && (
        <p className="text-sm text-slate-400">{t("team.nurFuerMitglieder")}</p>
      )}

      {mitglieder && (
        <Card className="mt-4 p-4">
          <h3 className="mb-2 font-semibold text-slate-100">{t("team.mitglieder")}</h3>
          <div className="flex flex-wrap gap-3">
            {mitglieder.map((m) => (
              <Link key={m.user_id} to={`/foiler/${m.user_id}`} className="flex items-center gap-2 text-sm text-slate-200 hover:text-brand-400">
                <Avatar name={m.name} url={m.avatar_url} seed={m.user_id} size={28} link={false} />
                <span>{m.name}</span>
                {m.rolle !== "mitglied" && <span className="team-akzent text-xs">{t(`team.rolle.${m.rolle}`)}</span>}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Reihenfolge unten (Jan, 01.11.2026): Teamadresse vorletzt, Logbuch ganz unten. */}
      {eventsUnten.length > 0 && <VergangeneEvents events={eventsUnten} slug={kopf.slug} lang={lang} t={t} />}
      {kopf.mein_status === "aktiv" && <div className="mt-4"><TeamAdresse kopf={kopf} t={t} /></div>}
      {(gast || kopf.darf_bestenlisten) && logbuch && <Logbuch eintraege={logbuch} t={t} zurueck={{ zurueck: `/teams/${kopf.slug}`, zurueckText: kopf.name }} />}

      {kopf.mein_status === "aktiv" && kopf.meine_rolle !== "leiter" && (
        <button onClick={austreten} className="mt-6 text-sm text-slate-400 underline hover:text-slate-200">{t("team.austreten")}</button>
      )}

      {gast && (
        <p className="mt-6 text-sm text-slate-400">{t("team.gastHinweis")}</p>
      )}
      {/* „Auch nur GPS" einmal unten statt an jeder Bestenliste (Jan, 01.11.2026). */}
      {tafeln && tafeln.some((tf) => !tf.accel_only) && (
        <p className="mt-6 text-sm text-slate-400">
          {t(tafeln.every((tf) => !tf.accel_only) ? "team.tafel.gpsAlle" : "team.tafel.gpsEinige")}
        </p>
      )}
      {/* Gaeste brauchen die ganze Regelseite nicht (Jan, 01.11.2026); die Event-Seite hat ihre eigene Regel-Box. */}
      {!gast && <div className="mt-6"><RegelnLink /></div>}

      {bild && (
        <TeamTafelBild team={kopf} tafel={bild.tf} onClose={() => setBild(null)} zeitraum={bild.zeile} />
      )}

      {dialog && (
        <BeitrittDialog name={kopf.name} oeffentlich={!!kopf.oeffentlich} freigabeNoetig={freigabeNoetig}
          busy={busy} onJa={beitreten} onNein={() => setDialog(false)} />
      )}
    </div>
  );
}
