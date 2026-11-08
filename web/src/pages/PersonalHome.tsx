import { TechnikUebersicht } from "../components/TechnikTabelle";
import { EventAbzeichen, EventHinweise, TeamEventsListe, useTeamEventAbzeichen } from "../components/EventHinweis";
import { sortiereNachSport, sortiereSports, standardSportart, classLabelKey } from "../lib/sportClass";
import { setLastSessionsFilter } from "../lib/lastSession";
import { useWiederAufwachen } from "../lib/useWiederAufwachen";
import { useEffect, useRef, useState } from "react";
import { fmtDate } from "../lib/time";
import { foilLabel } from "../lib/foilLabel";
import { Link, useSearchParams } from "react-router-dom";
import { api, Aktivitaet, CommunitySession, FoilStatsGroup, MeinSpot, OverallStats, Profile, SessionSummary, TeamKurz } from "../lib/api";
import TeamWappen from "../components/TeamWappen";
import { TeamHerkunft } from "../components/TeamHerkunft";
import { teamFarbStil } from "../lib/teamFarben";
import { Avatar, Card, Spinner } from "../components/ui";
import { ChatBubbleIcon, HeartIcon } from "../components/Icons";
import { SessionCard } from "../components/SessionCard";
import { ListenAnsicht } from "../components/ListenAnsicht";
import { useKompakteListe } from "../lib/kompakteListe";
import { CommunityList, EigeneAbzeichen, SessionStats, SpotBereich, renderCommunitySession } from "./Sessions";
import History from "./History";
import Foiler from "./Foiler";
import { TeamSuche } from "./Teams";
import LinkedAccounts from "./LinkedAccounts";
import { Reiterleiste, useReiter, useWischleiste, type ReiterDef } from "../components/Reiter";
import { TeamWahl, useTeamWahl } from "../components/TeamWahl";
import { InstallPwa } from "../components/InstallPwa";
import { WelcomeBanner } from "../components/WelcomeBanner";
import { GarminBeidesBanner } from "../components/GarminBeides";
import { StartHelp } from "../components/StartHelp";
import { UploadProgressCard, UhrenLiveStatus } from "../components/UploadProgressCard";
import { CommunityIcon, FoilIcon, SendIcon, SettingsIcon, HomeIcon, LocationIcon, SparklesIcon, WatchIcon } from "../components/Icons";
import { geraeteText } from "../lib/deviceLabel";
import { FreundePumpen } from "../components/FreundePumpen";
import { FreundesAnfragen } from "../components/Freundschaft";
import { PERIODS, SportRekordeZeilen } from "./Home";

// Voreingestelltes Zeitfenster der Kacheln. Einer der Werte aus PERIODS.
const STANDARD_ZEITRAUM = "10d";
// Rueckfall-Kette: ist das Fenster leer, wird EINE Stufe weiter aufgemacht — und zwar
// schrittweise (Jan), nicht gleich bis Allzeit. Wer seit zwei Wochen faehrt, soll die zwei
// Wochen sehen und nicht seine Rekorde von vorletztem Sommer. Greift NUR beim ersten Laden;
// sobald jemand selbst auf einen Zeitraum tippt, bleibt seine Wahl stehen.
const RUECKFALL = ["10d", "30d", "365d", "all"];
import { CHANGELOG_SEEN_KEY, abonnieren, neuestesDatum } from "../lib/changelogLatest";
import { useT, useI18n, useNumberFormat } from "../i18n";
import { fmtLaufDauer } from "../lib/dauer";

// Kleiner Hinweis, wenn mir jemand eine Session übertragen will (Details/Annehmen in „Meine Sessions").
function TransferHint() {
  const t = useT();
  const [n, setN] = useState(0);
  useEffect(() => { api.transfersIncoming().then((r) => setN(r.length)).catch(() => {}); }, []);
  if (n === 0) return null;
  return (
    <Link to="/sessions" className="mb-5 flex items-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm text-slate-200 hover:bg-brand-500/20">
      <SendIcon className="h-5 w-5 shrink-0 text-brand-400" />
      <span>{t("transfer.homeHint")}</span>
      <span className="ml-auto text-xs text-brand-600 dark:text-brand-300">→</span>
    </Link>
  );
}

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

// Persönliche Startseite: Begrüßung, Kacheln (Rekorde + Gesamt-Stats), letzte Sessions.
// Start-Erfolgsquote (persönlich): Startversuche (attempts-Preset) gegen echte Läufe.
// Ganz unten auf der eigenen Home, 5 Zeitfenster.
function StartSuccessSection() {
  const t = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.startSuccess>> | null>(null);
  useEffect(() => { api.startSuccess().then(setData).catch(() => {}); }, []);
  if (!data || (data.windows.all?.total ?? 0) === 0) return null;   // ohne Läufe: nichts zeigen
  // KEIN Schwellen-Dropdown mehr: die Quote ist seit dem Umbau versuchsbasiert (attempts-Preset
  // gegen echte Laeufe), die Distanz-Schwelle ist wirkungslos — der Server liefert threshold_m
  // nur noch als Kompat-Konstante 0 zurueck. Das Dropdown sprang deshalb immer auf 0 zurueck
  // (Jans Bug-Report 02.08.): speichern -> neu laden -> Server sagt wieder 0.
  return (
    <div className="mt-8">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">{t("home.startSuccess")}</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PERIODS.map(([k, lbl]) => {
          const w = data.windows[k];
          return (
            <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
              <div className="text-2xl font-bold tabular-nums text-brand-400">{w?.rate == null ? "–" : `${w.rate}%`}</div>
              <div className="mt-1 text-sm text-slate-300">{t(lbl)}</div>
              {w && w.total > 0 && <div className="mt-0.5 text-sm tabular-nums text-slate-500">{w.success}/{w.total}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// „Neuerungen"-Badge (Funkeln + Datum) — oben rechts auf der Home, auch mobil sichtbar
// (die Sidebar mit dem Menü-Badge ist mobil ausgeblendet). Cyan wenn ungesehen, sonst grau.
function ChangelogBadge() {
  const { t, lang } = useI18n();
  const [seen, setSeen] = useState<string | null>(() => {
    try { return localStorage.getItem(CHANGELOG_SEEN_KEY); } catch { return null; }
  });
  // Datum vom Server, s. Kommentar in App.tsx.
  const [neuestes, setNeuestes] = useState(neuestesDatum());
  useEffect(() => abonnieren(setNeuestes), []);
  const unseen = !!neuestes && seen !== neuestes;
  let dateStr = neuestes;
  try { dateStr = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" }).format(new Date(neuestes)); } catch { /* ignore */ }
  if (!neuestes) return null;   // ohne Datum keine Kachel, statt einer leeren
  return (
    <Link to="/changelog" title={t("nav.changelog")} onClick={() => { try { localStorage.setItem(CHANGELOG_SEEN_KEY, neuestes); } catch { /* ignore */ } setSeen(neuestes); }}
      className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium transition ${unseen ? "bg-brand-500/15 text-brand-600 dark:text-brand-300" : "text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300"}`}>
      <SparklesIcon className="h-4 w-4" filled={unseen} /> {dateStr}
    </Link>
  );
}

function BoardAttitudeSection() {
  const t = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.boardAttitudeStats>> | null>(null);
  useEffect(() => { api.boardAttitudeStats().then(setData).catch(() => {}); }, []);
  // Keine Brett-Aufnahme oder kein Lauf ab 30 s: nichts zeigen statt einer Ueberschrift ohne Inhalt.
  const hat = (p?: { mit: unknown; ohne: unknown } | null) => !!p && !!(p.mit || p.ohne);
  if (!data || (!hat(data.technik) && !hat(data.technik_kurz))) return null;
  return (
    <div className="mt-8">
      {/* Statt eines erklaerenden Satzes (Jan, 24.09.2026: „ganz raus") steht neben der
          Ueberschrift dasselbe Abzeichen wie auf den Kacheln — es sagt schon, woher die
          Zahlen kommen: nur aus Aufnahmen mit dem Handy am Brett. */}
      <h2 className="mb-2 flex flex-wrap items-center gap-2 text-xl font-bold">
        {t("home.boardAttitude")}
        <span className="inline-flex items-center gap-1 rounded bg-brand-500/20 px-1.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
          <WatchIcon className="h-3.5 w-3.5" /> {geraeteText("Phone", "board", t)}
        </span>
      </h2>
      {/* EINE Tabelle (Jan, 08.10.2026): alle Laeufe und je Foil als Zeilen, die Zahlen
          untereinander in den Zellen wie bei „Lage je Lauf", eine Legende. Die alte Tabelle je
          Lauflaenge ist raus („alte unuebersichtliche Darstellung"); die unkorrigierten Werte
          stehen in Klammern. Je Foil nur, wenn es mehr als eines gibt. */}
      {/* Zweimal (Jan, 08.10.2026): Laeufe ab 30 s (Mittelteil) und Laeufe unter 30 s (ganzer Lauf),
          nie vermischt — er vermutet Unterschiede zwischen kurzen und langen Laeufen. */}
      <TechnikUebersicht titel={t("tech.hLong")} zeilen={[
        { label: t("tech.allRuns"), technik: data.technik, kg: data.kurve_gerade, kgOhne: data.kurve_gerade_ohne, ganz: data.technik_ganz },
        ...(data.je_foil.length > 1 ? data.je_foil.map((f) => ({ label: f.foil, technik: f.technik, kg: f.kurve_gerade, kgOhne: f.kurve_gerade_ohne, ganz: f.technik_ganz })) : []),
      ]} />
      <TechnikUebersicht titel={t("tech.hShort")} mitteText="tech.lShort" zeilen={[
        { label: t("tech.allRuns"), technik: data.technik_kurz, nurGanz: true },
        ...(data.je_foil.length > 1 ? data.je_foil.map((f) => ({ label: f.foil, technik: f.technik_kurz, nurGanz: true })) : []),
      ]} />
    </div>
  );
}

// Carve-Anzahl je Grad-Kategorie (90–180° / 180–360° / >360°) je Zeitfenster. Unter der Start-Quote.
function CarveStatsSection() {
  const t = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.carveStats>> | null>(null);
  useEffect(() => { api.carveStats().then(setData).catch(() => {}); }, []);
  if (!data) return null;
  const cats: [string, "s" | "m" | "l"][] = [["90–180°", "s"], ["180–360°", "m"], [">360°", "l"]];
  const anyCarve = PERIODS.some(([k]) => { const w = data.windows[k]; return w && (w.s + w.m + w.l) > 0; });
  if (!anyCarve) return null;
  return (
    <div className="mt-8">
      <h2 className="mb-2 text-xl font-bold">Carves</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="bg-slate-900/70 text-slate-300">
              <th className="px-3 py-2 text-left font-medium"></th>
              {PERIODS.map(([k, lbl]) => <th key={k} className="px-3 py-2 text-right font-medium">{t(lbl)}</th>)}
            </tr>
          </thead>
          <tbody>
            {cats.map(([label, key]) => (
              <tr key={key} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-300">{label}</td>
                {PERIODS.map(([k]) => (
                  <td key={k} className="px-3 py-2 text-right tabular-nums text-brand-400">{data.windows[k]?.[key] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Wenden/Halsen auf dem Foil je Monat (19.10.2026, Stand-Buch: quote_verlauf) — nur fuer Fahrer mit
// Wind-Sessions; die neuesten Monate oben, hoechstens 12.
// `userId`: Admin-Kontrollansicht auf der Foiler-Seite (20.10.2026), sonst die eigenen.
export function ManoeverVerlaufSection({ userId }: { userId?: number } = {}) {
  const t = useT();
  const [d, setD] = useState<Awaited<ReturnType<typeof api.manoeverVerlauf>> | null>(null);
  useEffect(() => { api.manoeverVerlauf(userId).then(setD).catch(() => {}); }, [userId]);
  const monate = (d?.monate ?? []).filter((m) => m.wende + m.halse > 0).slice(-12).reverse();
  if (!monate.length) return null;
  const zelle = (durch: number, n: number) => (n ? `${durch} / ${n} (${Math.round((100 * durch) / n)} %)` : "–");
  return (
    <div className="mt-8">
      <h2 className="mb-2 text-xl font-bold">{t("phome.manTitle")}</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="bg-slate-900/70 text-slate-300">
              <th className="px-3 py-2 text-left font-medium">{t("phome.manMonth")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("sd.jibes")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("sd.tacks")}</th>
            </tr>
          </thead>
          <tbody>
            {monate.map((m) => (
              <tr key={m.monat} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-300">{m.monat}</td>
                <td className="px-3 py-2 text-right tabular-nums text-brand-400">{zelle(m.halse_durch, m.halse)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-brand-400">{zelle(m.wende_durch, m.wende)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Eigene Bestwerte je Sportart (20.10.2026), eine Zeile je Sportart; `userId` fuer die Admin-Ansicht.
export function EigeneSportRekorde({ userId }: { userId?: number } = {}) {
  const t = useT();
  const [d, setD] = useState<{ sport: string; rekorde: Record<string, any> }[]>([]);
  useEffect(() => { api.sportRekorde("all", userId).then((r) => setD(r.sportarten)).catch(() => {}); }, [userId]);
  return <SportRekordeZeilen sportarten={d} titel={t("phome.sportRec")} />;
}

// Jahresbilanz je Sportart (19.10.2026, Stand-Buch: jahresbilanz): je Jahr eine Zeile pro Sportart.
export function JahresbilanzSection({ userId }: { userId?: number } = {}) {
  const t = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.jahresbilanz>> | null>(null);
  const [jahr, setJahr] = useState<number | null>(null);
  useEffect(() => { api.jahresbilanz(userId).then((d) => { setData(d); setJahr(d.jahre[0]?.jahr ?? null); }).catch(() => {}); }, [userId]);
  if (!data || !data.jahre.length || jahr == null) return null;
  const zeile = data.jahre.find((j) => j.jahr === jahr) ?? data.jahre[0];
  return (
    <div className="mt-8">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">{t("phome.ybTitle")}</h2>
        {data.jahre.slice(0, 5).map((j) => (
          <button key={j.jahr} onClick={() => setJahr(j.jahr)}
            className={`rounded-full px-3 py-1 text-sm ${j.jahr === zeile.jahr ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}>
            {j.jahr}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="bg-slate-900/70 text-slate-300">
              <th className="px-3 py-2 text-left font-medium"></th>
              <th className="px-3 py-2 text-right font-medium">{t("phome.ybSessions")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("phome.ybHours")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("phome.ybKm")}</th>
              <th className="px-3 py-2 text-right font-medium"><FoilIcon className="inline h-4 w-4" aria-label={t("sd.foilShare")} /> km</th>
            </tr>
          </thead>
          <tbody>
            {zeile.sportarten.map((x) => (
              <tr key={x.sport} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-300">{t(`cls.sport.${x.sport}`)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-brand-400">{x.sessions}</td>
                <td className="px-3 py-2 text-right tabular-nums text-brand-400">{x.stunden.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-brand-400">{x.km.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-brand-400">{x.foil_km.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Nimmt beide Session-Formen (eigene Liste und Community-Brief) — nur die Felder, die beide haben.
const setupLabels = (s: { setup?: { stab?: { brand: string; model: string; size: string } | null;
                                   mast_len_cm?: number | null;
                                   board?: { name: string } | null } | null }) => ({
  stab: s.setup?.stab ? `${s.setup.stab.brand} ${s.setup.stab.model} ${s.setup.stab.size}`.trim() : null,
  mast: s.setup?.mast_len_cm ? `${s.setup.mast_len_cm} cm` : null,
  board: s.setup?.board?.name || null,
});


export default function PersonalHome() {
  const t = useT();
  const kompakt = useKompakteListe();   // Session-Liste als Kacheln oder Zeilen (ListenAnsicht)
  // Wer von der Startseite aus eine Session öffnet, kommt aus KEINER gefilterten Liste — dann
  // sollen „älter/neuer" dort wieder durch die eigenen Sessions gehen und nicht durch den
  // Spot, den man vorhin angeschaut hat (s. lastSession.ts).
  useEffect(() => { setLastSessionsFilter({}); }, []);
  const nf = useNumberFormat();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<OverallStats | null>(null);
  // Dieselben Kacheln noch einmal je Foil (Jans Wunsch 30.08.). Eigener Abruf, damit die
  // Startseite ohne ihn nicht wartet — der Block erscheint einfach, sobald er da ist.
  const [byFoil, setByFoil] = useState<FoilStatsGroup[]>([]);
  const [latest, setLatest] = useState<SessionSummary[] | null>(null);
  const [latestFehler, setLatestFehler] = useState(false);
  const [homespot, setHomespot] = useState("");
  const [homespotId, setHomespotId] = useState<number | null>(null);
  // Alle Spots mit eigenen Sessions, fuer den Reiter „Spots" (Spotzeile + Kacheln unter „Alle").
  const [meineSpots, setMeineSpots] = useState<MeinSpot[] | null>(null);
  useEffect(() => { api.mySpotsStats().then(setMeineSpots).catch(() => setMeineSpots([])); }, []);
  const [meineTeams, setMeineTeams] = useState<TeamKurz[]>([]);
  useEffect(() => { api.teamsMine().then((l) => setMeineTeams(l.filter((x) => x.status === "aktiv"))).catch(() => {}); }, []);
  // Rekorde: nur aus Sessions mit Accel (präzise) oder aus allen (inkl. GPS-only).
  // VORERST Default "alle" (zu wenige Nutzer, um einzuschränken); smarter Default vorbereitet.
  const [accelOnly, setAccelOnly] = useState(false);
  // Zeitraum der Rekorde/Kacheln — gleiche Fenster wie die Community-Ranglisten (PERIODS).
  // Default seit 30.08. "10 Tage" (Jan) statt "Allzeit": die Startseite soll zeigen, wie es
  // GERADE laeuft, nicht die ewige Bestenliste — und der neue Abschnitt „je Foil" bleibt damit
  // von selbst kurz, weil nur Foils aus dem Fenster auftauchen. Umschalten geht weiter.
  const [period, setPeriod] = useState(STANDARD_ZEITRAUM);
  // Sportart der EIGENEN Rekorde. "" = noch nicht gewaehlt -> der Server nimmt die haeufigste
  // und schickt sie zurueck; ab dann steht sie hier. Anlass: PeterHs Skate-Session zaehlte in
  // seinen Gesamtzahlen mit, obwohl sie als andere Sportart markiert war (16.08.).
  const [sport, setSport] = useState("");
  const [sports, setSports] = useState<{ sport: string; sessions: number }[]>([]);
  const decidedRef = useRef(false);
  // true, solange der Zeitraum noch nicht von Hand gewaehlt wurde -> Rueckfall erlaubt.
  const autoRef = useRef(true);

  // Die letzten Sessions NEU holen — beim Aufbau der Seite und immer, wenn sie aus dem
  // Hintergrund zurueckkommt. Vorher hing das allein am Mount: wer die PWA tagelang offen liess
  // (oder den Laptop zuklappte), sah bis Strg-R denselben Stand. `fresh` geht dabei am
  // Service-Worker-Cache vorbei, sonst antwortet der mit genau der alten Liste.
  // Ein FEHLGESCHLAGENER Abruf ist keine leere Liste (Jan, 24.09.2026: offline stand die
  // Begruessung „So kommt deine erste Session hierher" da, obwohl er hunderte Sessions hat).
  // `fresh` geht am Cache vorbei und scheitert offline zwangslaeufig — dann bleibt der Platz
  // leer, den Grund nennt schon das Offline-Band ganz oben.
  const letzteHolen = () => {
    api.sessions({ limit: 3, fresh: true })
      .then((l) => { setLatestFehler(false); setLatest(l); })
      .catch(() => { setLatestFehler(true); setLatest([]); });
  };
  useWiederAufwachen(letzteHolen);

  useEffect(() => {
    api.getProfile().then(setProfile).catch(() => {});
    letzteHolen();
    // `homespot_effective`, nicht `homespot`: bei leerem Profilwert leitet der Server ihn aus
    // der letzten Session ab (s. settings.py). Vorher blieb die Wetterkarte bei 96 % der
    // Nutzer aus, obwohl das Profil „Automatisch (letzte Session)" versprach.
    api.getSettings().then((s) => {
      setHomespot((s.homespot_effective as string) ?? (s.homespot as string) ?? "");
      setHomespotId(typeof s.homespot_effective_id === "number" ? s.homespot_effective_id : null);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    api.statsByFoil(accelOnly, period, sport || undefined).then(setByFoil).catch(() => setByFoil([]));
    api.stats(accelOnly, period, sport || undefined).then((s) => {
      // Der Accel-Default wird NUR beim ersten Laden entschieden, und nur im Standard-Fenster:
      // in einem kurzen Fenster (z. B. „Heute") sind leere Rekorde normal und wuerden den
      // Umschalter sonst grundlos auf „alle" zwingen.
      if (!decidedRef.current && period === STANDARD_ZEITRAUM) {
        decidedRef.current = true;
        const noAccel = !s.records || (["distance", "duration", "speed"] as const)
          .every((k) => (s.records?.[k]?.value ?? 0) === 0);
        if (accelOnly && noAccel) { setAccelOnly(false); return; }  // -> Refetch mit "alle"
      }
      // Leeres Fenster? Eine Stufe weiter aufmachen, statt leere Kacheln zu zeigen.
      // Gemessen am 30.08.: 38 % der Nutzer haben in den letzten 10 Tagen keine Session.
      if (autoRef.current && s.count === 0) {
        const i = RUECKFALL.indexOf(period);
        if (i >= 0 && i < RUECKFALL.length - 1) { setPeriod(RUECKFALL[i + 1]); return; }
      }
      autoRef.current = false;   // ab hier steht das Fenster (leer oder nicht)
      setStats(s);
      if (s.sports) setSports(s.sports);
      if (!sport && s.sport) setSport(s.sport);   // Voreinstellung des Servers uebernehmen
    }).catch(() => {});
  }, [accelOnly, period, sport]);

  // Kachel-Definitionen EINMAL — die Gesamtansicht und jeder Foil-Block nehmen dieselbe Quelle,
  // sonst driften Formatierung und Reihenfolge auseinander.
  type RecTile = { label: string; rec?: { value: number; session_id: number | null; started_at?: string | null }; fmt: (v: number) => string };
  const recTilesOf = (s: OverallStats | null): RecTile[] => {
    const r = s?.records;
    return [
      { label: t("rec.farthestRun"), rec: r?.distance, fmt: (v) => `${Math.round(v)} m` },
      { label: t("rec.longestRun"), rec: r?.duration, fmt: (v) => fmtLaufDauer(v) },
      { label: t("rec.topSpeed"), rec: r?.speed, fmt: (v) => `${(v * 3.6).toFixed(1)} km/h` },
      { label: t("rec.longestGlide"), rec: r?.glide, fmt: (v) => `${v.toFixed(1)} s` },
      { label: t("rec.mostRuns"), rec: r?.runs, fmt: (v) => `${Math.round(v)}` },
    ];
  };
  const statTilesOf = (s: OverallStats | null) => s ? [
    { label: t("side.sessions"), value: String(s.count) },
    { label: t("stat.runs"), value: String(s.runs_total) },
    { label: t("side.foiling"), value: `${s.foiling_km.toFixed(1)} km` },
    { label: t("side.foilingTime"), value: fmtDur(s.foiling_min) },
    { label: t("side.pumps"), value: nf(s.pumps) },
  ] : [];

  const kachelGitter = (s: OverallStats | null) => (
    <div className="mb-6 grid grid-cols-3 gap-1.5 lg:grid-cols-5">
      {recTilesOf(s).map((r) => {
        const v = r.rec?.value ?? 0;
        const inner = (
          <Card className="h-full px-2.5 py-1.5">
            <div className="text-[11px] leading-tight text-slate-400">{r.label}</div>
            <div className="text-lg font-bold leading-tight tabular-nums text-brand-400">{v > 0 ? r.fmt(v) : "–"}</div>
            {v > 0 && r.rec?.started_at && (
              <div className="text-[10px] leading-tight tabular-nums text-slate-500">
                {fmtDate(r.rec.started_at, (r.rec as any).tz, { day: "2-digit", month: "2-digit", year: "2-digit" })}
              </div>
            )}
          </Card>
        );
        return v > 0 && r.rec?.session_id
          ? <Link key={r.label} to={`/sessions/${r.rec.session_id}`} className="block transition-transform hover:scale-[1.02]">{inner}</Link>
          : <div key={r.label}>{inner}</div>;
      })}
      {statTilesOf(s).map((x) => (
        <Card key={x.label} className="h-full px-2.5 py-1.5">
          <div className="text-[11px] leading-tight text-slate-400">{x.label}</div>
          <div className="text-lg font-bold leading-tight tabular-nums text-brand-400">{x.value}</div>
        </Card>
      ))}
    </div>
  );


  // Reiter (Plan docs/UX-IA.md, 02.11.2026). Home startet immer mit der Uebersicht — dort schaut man nach dem Pumpen
  // zuerst hin —, deshalb ohne `merken`.
  const teamEvAbz = useTeamEventAbzeichen();
  const reiter: ReiterDef[] = [
    { id: "uebersicht", label: t("tab.overview") },
    { id: "rekorde", label: t("side.records") },
    // Abzeichen: LIVE bzw. Zahl der kommenden Events der eigenen Teams (Jan, 06.11.2026).
    { id: "team", label: t("tab.team"), badge: <EventAbzeichen {...teamEvAbz} /> },
    // „Spots" statt „Homespot" (Jan, 04.11.2026): darunter alle eigenen Spots, der Homespot vorgewaehlt.
    ...(homespotId != null || (meineSpots?.length ?? 0) > 0 ? [{ id: "spots", label: t("nav.spots") }] : []),
    // „Stats" statt „Verlauf" (Jan, 02.11.2026), darin eine zweite Reiterzeile fuer die einzelnen Auswertungen.
    { id: "stats", label: t("tab.stats") },
    // Uhr & Konten (Jan, 02.11.2026): die eigenen Uhren und verknuepften Konten, sonst die beiden Einstiege.
    { id: "uhr", label: t("ptab.watches") },
    // Die eigene Profilseite, so wie andere sie sehen (Jan, 04.11.2026) — vorher fuehrte das Profilbild links oben dorthin.
    ...(profile?.id ? [{ id: "profil", label: t("nav.profile") }] : []),
  ];
  const [tab, setTab] = useReiter("home", reiter.map((r) => r.id), "uebersicht");
  const [foilWahl, setFoilWahl] = useState<string>("alle");
  const [profilAls, setProfilAls] = useState<"freunde" | "alle">("alle");
  const foilGruppe = byFoil.find((g) => String(g.foil_id ?? "keins") === foilWahl);

  return (
    <div className="w-full">
      <WelcomeBanner />
      <GarminBeidesBanner />
      {/* flex-wrap: auf dem Handy rutscht der NEU-Hinweis unter die Begruessung, statt sie auf
          null Breite zu quetschen (Jan, 05.10.2026). */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <HomeIcon className="h-7 w-7 shrink-0 text-brand-400" />
        <h2 className="min-w-0 truncate text-2xl font-bold">
          {profile?.display_name ? t("phome.hello", { name: profile.display_name }) : t("nav.home")}
        </h2>
        <ChangelogBadge />
        <FreundePumpen />
      </div>

      <Reiterleiste reiter={reiter} aktiv={tab} onWahl={setTab} unter={tab === "stats" || tab === "spots"} />

      {tab === "uebersicht" && <>
        {/* Laufendes oder bald beginnendes globales Event (Jan, 06.11.2026). */}
        <EventHinweise art="global" />
        <FreundesAnfragen />

        {/* Live-Upload-Karte: eigene Session lädt gerade hoch (Home + Sessions, NICHT Community). */}
        <UploadProgressCard />
        <UhrenLiveStatus />

        <TransferHint />

        {/* App installieren (mobil, nur wenn installierbar) */}
        <InstallPwa className="mb-5 w-full sm:w-auto md:hidden" />

        {/* Letzte Sessions ganz oben. Homespot und Teams standen hier als Links; seit 02.11.2026 sind es Reiter. */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("phome.latest")}</h3>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <ListenAnsicht />
            <Link to="/sessions" className="whitespace-nowrap text-xs text-brand-600 dark:text-brand-300 hover:text-brand-700 dark:hover:text-brand-200">{t("phome.allMine")} →</Link>
          </div>
        </div>
        {/* Wartet eine eigene Session auf Zuordnung, MUSS es hier stehen: ein Push allein genügt nicht
            (wer Push aus hat, erfährt nie, dass seine Session aus den Auswertungen gefallen ist) und die
            drei Karten unten zeigen ältere Sessions nicht. Jan: „der andere sollte schon eine meldung
            sehen in seinem homebereich … oder einen marker an seiner session". Beides jetzt. */}
        {(profile?.needs_classification ?? 0) > 0 && (
          <Link
            /* Bei EINER offenen Session direkt dorthin, bei mehreren in die Liste — dort trägt jede
               betroffene Karte das Badge „Bitte zuordnen". */
            to={(profile?.needs_classification ?? 0) === 1 && profile?.needs_classification_id
                  ? `/sessions/${profile.needs_classification_id}` : "/sessions"}
            className="mb-4 block rounded-xl border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-800 hover:bg-amber-500/15 dark:text-amber-200">
            {(profile?.needs_classification ?? 0) === 1
              ? t("home.needsClassification")
              : t("home.needsClassificationN", { n: profile?.needs_classification ?? 0 })} →
          </Link>
        )}
        {/* Aussortierte: nur ein Einzeiler, und nur solange etwas FRISCHES dabei ist (letzte 7 Tage,
            Server: sorted_out_new) -> verfaellt von selbst, kein Wegklicken. */}
        {(profile?.sorted_out_new ?? 0) > 0 && (
          <Link to="/sessions?filter=other"
            className="mb-4 block rounded-xl border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-800 hover:bg-amber-500/15 dark:text-amber-200">
            {(profile?.sorted_out_new ?? 0) === 1
              ? t("home.sortedOut")
              : t("home.sortedOutN", { n: profile?.sorted_out_new ?? 0 })} →
          </Link>
        )}
        {!latest ? <Spinner /> : latest.length === 0 ? (
          latestFehler ? null : <StartHelp />
        ) : (
          <div className={`mb-6 ${kompakt ? "space-y-1.5" : "space-y-3"}`}>
            {latest.map((s) => (
              <SessionCard
                key={s.id}
                sessionId={s.id}
                startedAt={s.started_at}
                tz={s.tz}
                endedAt={s.ended_at}
                spot={s.place_name}
                foil={s.foil ? foilLabel(s.foil) : null}
                ohneFoil={s.sport_profil?.foil === false}
                sportLabel={s.sport_class && s.sport_class !== "pumpfoil" ? t(classLabelKey({ sport_class: s.sport_class })) : null}
                {...setupLabels(s)}
                deviceLabel={s.device_label}
                placement={s.placement}
                caption={s.caption}
                avatarName={profile?.display_name}
                avatarUrl={profile?.avatar_url}
                thumbUrl={s.thumb_url}
                photoCount={s.photo_count}
                youtubeUrl={s.youtube_url}
                videoUrl={s.video_url}
                likeCount0={s.like_count ?? 0}
                kommentare={s.comment_count ?? 0}
                liked0={!!s.liked}
                trackPreview={s.track_preview}
                stats={s.analysis && <SessionStats a={s.analysis} profil={s.sport_profil} />}
                statusBadge={<EigeneAbzeichen transferTo={s.transfer_to} status={s.status} neuBewerten={s.neu_bewerten} />}
                sportClass={s.sport_class}
                dataQuality={s.data_quality}
                needsClassification={!!s.needs_classification}
              />
            ))}
          </div>
        )}

        <NeuBeiMir />
        <FreundeLetzte />

        <div className="mt-6">
          <Link to="/community" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-300 hover:text-brand-700 dark:hover:text-brand-200">
            <CommunityIcon className="h-4 w-4" /> {t("home.community")} →
          </Link>
        </div>
      </>}

      {tab === "rekorde" && <>
        {/* Rekorde-Kopf mit Accel/alle-Auswahl (zwei Buttons, aktiver markiert) */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-[11px] font-medium" title={t("side.recordsHint")}>
            <button onClick={() => setAccelOnly(true)}
              className={`px-2.5 py-0.5 ${accelOnly ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              {t("side.onlyAccel")}
            </button>
            <button onClick={() => setAccelOnly(false)}
              className={`px-2.5 py-0.5 ${!accelOnly ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              {t("side.all")}
            </button>
          </div>
          {/* Sportart — nur zeigen, wenn es ueberhaupt mehr als eine gibt. */}
          {sports.length > 1 && (
            <select value={sport} onChange={(e) => setSport(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">
              {sortiereNachSport(sports, (x) => x.sport, t).map((x) => <option key={x.sport} value={x.sport}>{t(`cls.sport.${x.sport}`)}</option>)}
            </select>
          )}
          {/* Foil statt eines zweiten Kachelblocks je Foil (02.11.2026: die Wiederholung las sich doppelt und
              dreifach). Nur ab ZWEI Gruppen — bei einem einzigen Foil gaebe es nichts zu waehlen. */}
          {byFoil.length > 1 && (
            <select value={foilGruppe ? foilWahl : "alle"} onChange={(e) => setFoilWahl(e.target.value)}
              className="max-w-[14rem] rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">
              <option value="alle">{t("cr.foilAll")}</option>
              {byFoil.map((g) => (
                <option key={g.foil_id ?? "keins"} value={String(g.foil_id ?? "keins")}>
                  {g.foil_id
                    ? foilLabel({ brand: g.brand ?? "", model: g.model ?? "", size: g.size ?? "", aspect_ratio: g.aspect_ratio })
                    : t("phome.noFoil")} ({g.sessions})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Zeitraum — dieselben Fenster wie in der Community (PERIODS). Wirkt auf Rekorde UND Gesamt-Kacheln. */}
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {PERIODS.map(([k, labelKey]) => (
            <button
              key={k}
              onClick={() => { autoRef.current = false; setPeriod(k); }}
              className={`rounded-lg px-2.5 py-1 text-xs ${period === k ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {!stats ? <Spinner /> : kachelGitter(foilGruppe ? foilGruppe.stats : stats)}

        <EigeneSportRekorde />

        {/* Laengste eigene Laeufe im Vergleich (fuer alle seit 02.10.2026, cyan hervorgehoben). */}
        <div className="mt-6">
          <Link id="laengste-laeufe-knopf" to="/laeufe"
            className="inline-flex items-center gap-1 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-brand-400">
            {t("longest.link")} →
          </Link>
        </div>
      </>}

      {/* Events der eigenen Teams als Kacheln (laufende zuerst) — ersetzt die einzelne „Team-Event laeuft"-Zeile. */}
      {tab === "team" && <MeineTeams teams={meineTeams} />}

      {tab === "spots" && <SpotsBereich homespotId={homespotId} homespotName={homespot} liste={meineSpots} />}

      {tab === "stats" && <StatsBereich />}

      {/* Uhren und Konten in einer Ansicht mit eigenen Reitern, dieselbe wie /konten (02.11.2026). */}
      {tab === "uhr" && <LinkedAccounts eingebettet />}

      {/* Hinweis oben, damit klar ist, dass das die OEFFENTLICHE Seite ist und nicht die Einstellungen; das Zahnrad fuehrt
          zur Privatsphaere, wo man festlegt, was andere sehen (Jan, 04.11.2026). */}
      {tab === "profil" && profile?.id && <>
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-800/70 px-3 py-2 text-sm text-slate-300">
          <span className="min-w-0 flex-1">{t("phome.profileHint")}</span>
          {/* Vorschau (Jan, 04.11.2026): nur Freunde | Alle — „nur ich" waere dasselbe wie Freunde, die sehen alles. */}
          <div className="flex shrink-0 gap-1 rounded-lg bg-slate-900/60 p-0.5">
            {(["freunde", "alle"] as const).map((a) => (
              <button key={a} type="button" onClick={() => setProfilAls(a)}
                className={`rounded-md px-2.5 py-1 text-xs ${profilAls === a ? "bg-slate-950 font-semibold text-slate-100 shadow-sm" : "text-slate-400 hover:text-slate-200"}`}>
                {t(a === "freunde" ? "phome.asFriends" : "phome.asAll")}
              </button>
            ))}
          </div>
          <Link to="/einstellungen?tab=privat" aria-label={t("ptab.privacy")} title={t("ptab.privacy")}
                className="shrink-0 rounded-lg p-1 text-brand-600 hover:bg-slate-900 dark:text-brand-300">
            <SettingsIcon className="h-5 w-5" />
          </Link>
        </div>
        <Foiler userId={profile.id} eingebettet als={profilAls} />
      </>}
    </div>
  );
}

/** Reiter „Stats" (02.11.2026): die Auswertungen, die vorher untereinander auf Home standen, als zweite Reiterzeile.
 * Eigener Adress-Parameter (`sub`). Hat eine Auswertung keine Daten, zeichnet sie nichts — dann steht „—" da. */
function StatsBereich() {
  const t = useT();
  const reiter: ReiterDef[] = [
    { id: "verlauf", label: t("nav.history") },
    // Jahresbilanz, Start-Erfolgsquote, Carves, Wenden & Halsen untereinander in EINEM Reiter (Jan, 02.11.2026).
    { id: "kennzahlen", label: t("tab.insights") },
    { id: "brett", label: t("home.boardAttitude") },
  ];
  const [sub, setSub] = useReiter("homestats", reiter.map((r) => r.id), "verlauf", { param: "sub" });
  return (
    <>
      <Reiterleiste reiter={reiter} aktiv={sub} onWahl={setSub} stufe={2} />
      {/* Die Abschnitte tragen ihren eigenen oberen Abstand (mt-8) von frueher, als sie untereinander standen; beim ersten
          wird er abgeschaltet. Vorher glich ein -mt-8 hier ihn aus — das hob durch Randverschmelzung auch den Abstand unter
          der Reiterzeile auf (Jan, 02.11.2026). */}
      <div className="peer [&>*:first-child]:!mt-0">
        {sub === "verlauf" && <History eingebettet />}
        {sub === "kennzahlen" && <>
          <JahresbilanzSection />
          <StartSuccessSection />
          <CarveStatsSection />
          <ManoeverVerlaufSection />
        </>}
        {sub === "brett" && <BoardAttitudeSection />}
      </div>
      {/* Leer: bei der Lage des Bretts eine Erklaerung (die wenigsten haben Brett-Aufnahmen, Jan 02.11.2026), sonst ein Satz. */}
      <div className="mt-8 hidden peer-empty:block">
        {sub === "brett" ? <BrettErklaerung /> : <p className="text-sm text-slate-400">{t("tab.noData")}</p>}
      </div>
    </>
  );
}

/** Was die Lage des Bretts ist, wie man sie bekommt und was sie zeigt — fuer alle ohne Brett-Aufnahme. */
function BrettErklaerung() {
  const t = useT();
  return (
    <Card className="max-w-2xl space-y-2 p-4 text-sm text-slate-300">
      <h3 className="text-base font-semibold text-slate-100">{t("brett.erkl.titel")}</h3>
      <p>{t("brett.erkl.was")}</p>
      <p>{t("brett.erkl.wie")}</p>
      <p>{t("brett.erkl.bringt")}</p>
      <p>{t("brett.erkl.daten")}</p>
      <Link to="/nerd-analysen-4" className="inline-block text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200">
        {t("brett.erkl.mehr")} →
      </Link>
    </Card>
  );
}

/** Reiter „Team": die eigenen Teams (ersetzt die kleinen Links neben den letzten Sessions, 02.11.2026). */
function MeineTeams({ teams }: { teams: TeamKurz[] }) {
  const t = useT();
  return (
    <>
      {teams.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400">{t("team.keineTeams")}</p>
      ) : (
        <Card className="mb-4 p-2">
          {teams.map((m) => (
            // Offene Anfragen (nur Leitung/Moderatoren bekommen sie > 0) als Zahl daneben; der Link fuehrt immer auf
            // die Teamseite (Jan, 01.11.2026: „nicht direkt ins management").
            <Link key={m.id} to={`/teams/${m.slug}`} className="team-farbe flex items-center gap-3 rounded-xl p-2 hover:bg-slate-800/60"
              style={teamFarbStil(m.farbe)}>
              <TeamWappen name={m.name} logo={m.logo_url} farbe={m.farbe} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5"><span className="team-akzent truncate font-medium">{m.name}</span><TeamHerkunft land={m.land} /></span>
                <span className="block text-xs text-slate-400">{t(`team.rolle.${m.rolle}`)}</span>
              </span>
              {m.anfragen > 0 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-slate-950">{m.anfragen}</span>}
            </Link>
          ))}
        </Card>
      )}
      {/* „Meine Teams · Team gruenden" ist raus (Jan, 04.11.2026) — das steht jetzt unter Einstellungen › Team. Ohne eigenes
          Team steht hier gleich die Teamsuche, darunter der Weg zum Gruenden. */}
      {teams.length === 0 && <>
        <TeamSuche />
        <Link to="/einstellungen?tab=team" className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200">
          {t("team.gruenden")} →
        </Link>
      </>}
      {teams.length > 0 && <TeamEventsListe />}
      {teams.length > 0 && <TeamLetzteMitWahl teams={teams} />}
    </>
  );
}

/** Reiter „Spots" (Jan, 04.11.2026): zweite Zeile = die eigenen Spots (Homespot zuerst, dann zuletzt besuchte), wischbar
 * wie die Reiter, „Alle (n)" rechts immer sichtbar. Ein Spot -> darunter seine Reiter (Rekorde, Sessions, …); „Alle" -> die
 * Kacheln. Spot in der Adresse (`?spot=<id>|alle`), der Unterreiter (`stab`) bleibt beim Spotwechsel stehen. */
function SpotsBereich({ homespotId, homespotName, liste }: { homespotId: number | null; homespotName: string; liste: MeinSpot[] | null }) {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const pillen: { id: number; name: string }[] = [];
  if (homespotId != null) pillen.push({ id: homespotId, name: liste?.find((x) => x.spot_id === homespotId)?.name ?? homespotName });
  for (const x of liste ?? []) if (x.spot_id !== homespotId) pillen.push({ id: x.spot_id, name: x.name ?? "—" });
  const roh = sp.get("spot");
  const wahl = roh === "alle" || pillen.some((p) => String(p.id) === roh) ? roh! : (pillen.length ? String(pillen[0].id) : "alle");
  const waehlen = (id: string) => setSp((alt) => { const n = new URLSearchParams(alt); n.set("spot", id); return n; }, { replace: true });
  const { leiste, rand, pfeil } = useWischleiste(wahl, pillen.length);
  if (!liste) return <Spinner />;
  const gewaehlt = pillen.find((p) => String(p.id) === wahl);
  return <>
    <div className="-mt-4 mb-4 flex items-center gap-1 rounded-b-xl bg-slate-800/70 p-1.5">
      <div className="relative min-w-0 flex-1">
        <div ref={leiste} role="tablist" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {pillen.map((p) => {
            const an = String(p.id) === wahl;
            const Symbol = p.id === homespotId ? HomeIcon : LocationIcon;
            return (
              <button key={p.id} role="tab" aria-selected={an} onClick={() => waehlen(String(p.id))}
                className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
                  an ? "bg-slate-950 font-semibold text-slate-100 shadow-sm" : "text-slate-300 hover:text-slate-100"}`}>
                <Symbol className="h-4 w-4 shrink-0 text-brand-400" />{p.name}
              </button>
            );
          })}
        </div>
        {rand.links && pfeil(-1)}
        {rand.rechts && pfeil(1)}
      </div>
      <button role="tab" aria-selected={wahl === "alle"} onClick={() => waehlen("alle")}
        className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
          wahl === "alle" ? "bg-slate-950 font-semibold text-slate-100 shadow-sm" : "text-slate-300 hover:text-slate-100"}`}>
        {t("mySpots.all", { n: liste.length })}
      </button>
    </div>
    {gewaehlt
      ? <SpotAnsicht key={gewaehlt.id} spotId={gewaehlt.id} kopf={
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <LocationIcon className="h-5 w-5 shrink-0 text-brand-400" />
            <h3 className="min-w-0 truncate text-lg font-semibold">{gewaehlt.name}</h3>
            <Link to={`/sessions?spot=${gewaehlt.id}`} className="ml-auto whitespace-nowrap text-xs text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200">
              {t("tab.spotPage")} →
            </Link>
          </div>} />
      : <MeineSpots liste={liste} homespotId={homespotId} onWahl={(id) => waehlen(String(id))} />}
  </>;
}

/** Ein Spot unter „Spots": DERSELBE Inhalt wie die Spot-Seite (SpotBereich, samt Session-Liste) — nur die Kopfzeile ist
 * eine andere (Jan, 02.11.2026). Sportart-Knoepfe wie auf der Spot-Seite, Vorgabe „Alle" (Jan, 08.11.2026: am Illmensee
 * fehlte die Foilscoot-Session — vorher stand hier fest Pumpfoil, sobald es am Spot welche gab). */
function SpotAnsicht({ spotId, kopf }: { spotId: number; kopf?: React.ReactNode }) {
  const t = useT();
  const [sports, setSports] = useState<string[] | null>(null);
  const [sport, setSport] = useState("all");
  useEffect(() => {
    let aktuell = true;
    setSport("all");
    api.communitySports(String(spotId)).then((l) => { if (aktuell) setSports(l.map((x) => x.sport)); }).catch(() => { if (aktuell) setSports([]); });
    return () => { aktuell = false; };
  }, [spotId]);
  if (!sports) return <Spinner />;
  const knoepfe = sports.length > 1 && (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {["all", ...sports].map((s) => (
        <button key={s} onClick={() => setSport(s)}
          className={`rounded-full border px-3 py-1 text-sm ${s === sport
            ? "border-brand-500 bg-brand-500 font-semibold text-slate-950"
            : "border-slate-700 text-slate-200 hover:border-slate-500"}`}>
          {s === "all" ? t("all.allSports") : t(`cls.sport.${s}`)}
        </button>
      ))}
    </div>
  );
  // Kopf (Spotname + Link) UNTER der Reiterzeile, sonst risse er die Zeile von der Spotzeile darueber ab.
  return <SpotBereich spot={String(spotId)} sport={sport} accelOnly={false} param="stab" kopf={<>{kopf}{knoepfe}</>}
    sessions={<CommunityList key={sport} name="" spot={String(spotId)} accelOnly={false} sport={sport} />} />;
}

/** „Meine Spots" (Jan, 03.11.2026): alle Spots mit eigenen Sessions, zuletzt besuchte zuerst, mit Sessions, letztem
 * Besuch, On-Foil-Zeit/-Strecke, Laeufen und Pumps. Gezaehlt am Server wie die Spot-Liste des Verlaufs (my-spots). */
function MeineSpots({ liste, homespotId, onWahl }: { liste: MeinSpot[]; homespotId: number | null; onWahl: (id: number) => void }) {
  const t = useT();
  if (!liste.length) return <p className="text-sm text-slate-400">{t("mySpots.empty")}</p>;
  const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 100000 ? 1 : 0)} km`);
  const zeit = (sek: number) => (sek < 3600 ? `${Math.round(sek / 60)} min` : `${(sek / 3600).toFixed(1)} h`);
  const tag = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
  // Kacheln je Spot, ab sm zwei-, ab xl dreispaltig (Jan, 03.11.2026: die Zeilen ueber volle Breite waren zu gross).
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {liste.map((sp) => {
        const zahlen: [string, string][] = [
          [t("team.stat.sessions"), sp.sessions.toLocaleString()],
          // On-Foil-Zahlen nur, wenn es am Spot Sessions MIT Foil gibt (04.11.2026; Pumps zaehlt der Server nur dort).
          ...(sp.foil_sessions > 0 ? [[t("team.stat.zeit"), zeit(sp.time_s)], [t("team.stat.strecke"), km(sp.distance_m)]] as [string, string][] : []),
          [t("team.stat.laeufe"), sp.runs.toLocaleString()],
          ...(sp.pumps > 0 ? [[t("team.stat.pumps"), sp.pumps.toLocaleString()] as [string, string]] : []),
        ];
        // Sportarten als letztes Feld, nur wenn sie vom eigenen Standard abweichen (Jan, 03.11.2026).
        const sportText = sp.sports.some((x) => x !== standardSportart())
          ? sortiereSports(sp.sports, t).map((x) => t(`cls.sport.${x}`)).join(", ") : null;
        return (
          // Klick waehlt den Spot in der Spotzeile (04.11.2026), statt auf die Spot-Seite zu springen.
          <button key={sp.spot_id} type="button" onClick={() => onWahl(sp.spot_id)}
            className={`flex flex-col rounded-2xl text-left border bg-slate-900/60 p-3 hover:border-slate-600 ${sp.spot_id === homespotId ? "border-brand-500" : "border-slate-800"}`}>
            <div className="flex min-w-0 items-center gap-1.5">
              <LocationIcon className="h-4 w-4 shrink-0 text-brand-400" />
              <span className="min-w-0 truncate font-semibold">{sp.name ?? "—"}</span>
              {sp.spot_id === homespotId && (
                <span className="shrink-0 rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-slate-950">{t("foiler.homespot")}</span>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-400">
              {sp.water && sp.water !== sp.name && <>{sp.water} · </>}
              {t("mySpots.last", { d: tag(sp.last) })} · {t("mySpots.since", { d: tag(sp.first) })}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5">
              {zahlen.map(([l, v]) => (
                <div key={l} className="min-w-0">
                  <div className="text-sm font-bold leading-tight text-brand-700 dark:text-brand-300">{v}</div>
                  <div className="truncate text-xs text-slate-400">{l}</div>
                </div>
              ))}
              {sportText && (
                <div className={`min-w-0 ${zahlen.length === 4 ? "col-span-2" : zahlen.length % 3 === 2 ? "col-span-3" : ""}`} title={sportText}>
                  <div className="truncate text-sm font-bold leading-tight text-brand-700 dark:text-brand-300">{sportText}</div>
                  <div className="truncate text-xs text-slate-400">{t("mySpots.sports")}</div>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** „Neu bei deinen Sessions" (Olek/Jan, 03.11.2026): die letzten Kommentare und Likes anderer an den eigenen
 * Sessions, hoechstens 5 aus 14 Tagen (Server). Likes je Session zusammengefasst. Leer -> gar nicht da. */
function NeuBeiMir() {
  const t = useT();
  const [liste, setListe] = useState<Aktivitaet[] | null>(null);
  useEffect(() => { api.myActivity().then(setListe).catch(() => setListe([])); }, []);
  if (!liste || liste.length === 0) return null;
  const wann = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("act.title")}</h3>
      <div className="space-y-1.5">
        {liste.map((e) => {
          const ziel = e.typ === "comment" ? `/sessions/${e.session_id}#kommentare` : `/sessions/${e.session_id}`;
          const session = [e.started_at ? t("act.session", { d: new Date(e.started_at).toLocaleDateString() }) : null, e.spot]
            .filter(Boolean).join(" · ");
          return (
            <div key={`${e.typ}-${e.message_id ?? e.session_id}`} className="flex items-start gap-2.5 rounded-lg bg-slate-900 px-2.5 py-2">
              <Avatar name={e.user.name} url={e.user.avatar_url} userId={e.user.id} size={32} />
              {/* Das Profilbild fuehrt aufs Profil, der Rest der Zeile zur Session (kein <a> im <a>). */}
              <Link to={ziel} className="min-w-0 flex-1 hover:underline">
                <div className="flex items-start gap-1.5 text-sm text-slate-200">
                  {e.typ === "comment"
                    ? <ChatBubbleIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                    : <HeartIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" filled />}
                  <span className="min-w-0">
                    <span className="pf-name font-semibold">{e.user.name}</span>{" "}
                    {e.typ === "comment" ? t("act.comment")
                      : (e.anzahl ?? 1) > 1 ? t("act.likeMany", { n: (e.anzahl ?? 1) - 1 }) : t("act.like")}
                  </span>
                  <span className="ml-auto shrink-0 pt-0.5 text-xs tabular-nums text-slate-400">{wann(e.at)}</span>
                </div>
                {e.typ === "comment" && e.text && <div className="mt-0.5 line-clamp-2 text-sm italic text-slate-300">{e.text}</div>}
                {session && <div className="mt-0.5 truncate text-xs text-slate-400">{session}</div>}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Freunde mit ihrer letzten Session als Session-Kachel (Jan, 02.11.2026) — je Freund genau eine, zuletzt aktive zuerst,
 * hoechstens 10 (Server). Dieselbe Karte wie im Feed. */
function FreundeLetzte() {
  const t = useT();
  const kompakt = useKompakteListe();
  const [liste, setListe] = useState<CommunitySession[] | null>(null);
  useEffect(() => { api.friendsLatest().then(setListe).catch(() => setListe([])); }, []);
  if (!liste || liste.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("friends.title")}</h3>
      <div className={kompakt ? "space-y-1.5" : "space-y-3"}>{liste.map((s) => renderCommunitySession(s, t, null))}</div>
    </div>
  );
}

/** Die letzten Sessions der eigenen Teams (Jan, 02.11.2026), unter der Teamliste — mit der gemeinsamen Team-Auswahl
 * (components/TeamWahl): Standard alle Teams zusammen, bei mehreren eingrenzbar. */
function TeamLetzteMitWahl({ teams }: { teams: TeamKurz[] }) {
  const t = useT();
  const kompakt = useKompakteListe();
  const [wahl, setWahl] = useTeamWahl(teams);
  const [liste, setListe] = useState<CommunitySession[] | null>(null);
  useEffect(() => { setListe(null); api.teamLatest(wahl).then(setListe).catch(() => setListe([])); }, [wahl]);
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("phome.latest")}</h3>
      <TeamWahl teams={teams} wahl={wahl} onWahl={setWahl} />
      {!liste ? <Spinner /> : liste.length === 0 ? <p className="text-sm text-slate-400">—</p>
        : <div className={kompakt ? "space-y-1.5" : "space-y-3"}>{liste.map((x) => renderCommunitySession(x, t, null))}</div>}
    </div>
  );
}
