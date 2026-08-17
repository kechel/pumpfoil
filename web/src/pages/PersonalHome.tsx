import { useEffect, useRef, useState } from "react";
import { fmtDate } from "../lib/time";
import { Link } from "react-router-dom";
import { api, OverallStats, Profile, SessionSummary } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { SessionCard } from "../components/SessionCard";
import { SessionStats, StatusBadge } from "./Sessions";
import { SpotWeather } from "../components/SpotWeather";
import { HrProgress } from "../components/HrProgress";
import { InstallPwa } from "../components/InstallPwa";
import { WelcomeBanner } from "../components/WelcomeBanner";
import { StartHelp } from "../components/StartHelp";
import { UploadProgressCard } from "../components/UploadProgressCard";
import { CommunityIcon, SendIcon, HomeIcon, SparklesIcon } from "../components/Icons";
import { PERIODS } from "./Home";
import { LATEST_CHANGELOG_DATE, CHANGELOG_SEEN_KEY } from "./Changelog";
import { useT, useI18n } from "../i18n";

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
      <span className="ml-auto text-xs text-brand-300">→</span>
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
  const unseen = seen !== LATEST_CHANGELOG_DATE;
  let dateStr = LATEST_CHANGELOG_DATE;
  try { dateStr = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" }).format(new Date(LATEST_CHANGELOG_DATE)); } catch { /* ignore */ }
  return (
    <Link to="/changelog" title={t("nav.changelog")} onClick={() => { try { localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_DATE); } catch { /* ignore */ } setSeen(LATEST_CHANGELOG_DATE); }}
      className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium transition ${unseen ? "bg-brand-500/15 text-brand-600 dark:text-brand-300" : "text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300"}`}>
      <SparklesIcon className="h-4 w-4" filled={unseen} /> {dateStr}
    </Link>
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [latest, setLatest] = useState<SessionSummary[] | null>(null);
  const [homespot, setHomespot] = useState("");
  // Rekorde: nur aus Sessions mit Accel (präzise) oder aus allen (inkl. GPS-only).
  // VORERST Default "alle" (zu wenige Nutzer, um einzuschränken); smarter Default vorbereitet.
  const [accelOnly, setAccelOnly] = useState(false);
  // Zeitraum der Rekorde/Kacheln — gleiche Fenster wie die Community-Ranglisten (PERIODS).
  // Default "all" = bisheriges Verhalten (Allzeit), damit niemand plötzlich leere Kacheln sieht.
  const [period, setPeriod] = useState("all");
  // Sportart der EIGENEN Rekorde. "" = noch nicht gewaehlt -> der Server nimmt die haeufigste
  // und schickt sie zurueck; ab dann steht sie hier. Anlass: PeterHs Skate-Session zaehlte in
  // seinen Gesamtzahlen mit, obwohl sie als andere Sportart markiert war (16.08.).
  const [sport, setSport] = useState("");
  const [sports, setSports] = useState<{ sport: string; sessions: number }[]>([]);
  const decidedRef = useRef(false);

  useEffect(() => {
    api.getProfile().then(setProfile).catch(() => {});
    api.sessions({ limit: 3 }).then(setLatest).catch(() => setLatest([]));
    api.getSettings().then((s) => setHomespot((s.homespot as string) ?? "")).catch(() => {});
  }, []);
  useEffect(() => {
    api.stats(accelOnly, period, sport || undefined).then((s) => {
      // Der Accel-Default wird NUR beim ersten Laden entschieden, und nur auf "Allzeit":
      // in einem kurzen Fenster (z. B. „Heute") sind leere Rekorde normal und wuerden den
      // Umschalter sonst grundlos auf „alle" zwingen.
      if (!decidedRef.current && period === "all") {
        decidedRef.current = true;
        const noAccel = !s.records || (["distance", "duration", "speed"] as const)
          .every((k) => (s.records?.[k]?.value ?? 0) === 0);
        if (accelOnly && noAccel) { setAccelOnly(false); return; }  // -> Refetch mit "alle"
      }
      setStats(s);
      if (s.sports) setSports(s.sports);
      if (!sport && s.sport) setSport(s.sport);   // Voreinstellung des Servers uebernehmen
    }).catch(() => {});
  }, [accelOnly, period, sport]);

  const recs = stats?.records;
  // Rekord-Kacheln (klickbar -> Session) + Gesamt-Stat-Kacheln, alle zusammen oben.
  const recTiles: { label: string; rec?: { value: number; session_id: number | null; started_at?: string | null }; fmt: (v: number) => string }[] = [
    { label: t("rec.farthestRun"), rec: recs?.distance, fmt: (v) => `${Math.round(v)} m` },
    { label: t("rec.longestRun"), rec: recs?.duration, fmt: (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}` },
    { label: t("rec.topSpeed"), rec: recs?.speed, fmt: (v) => `${(v * 3.6).toFixed(1)} km/h` },
    { label: t("rec.longestGlide"), rec: recs?.glide, fmt: (v) => `${v.toFixed(1)} s` },
    { label: t("rec.mostRuns"), rec: recs?.runs, fmt: (v) => `${Math.round(v)}` },
  ];
  const statTiles = stats ? [
    { label: t("side.sessions"), value: String(stats.count) },
    { label: t("stat.runs"), value: String(stats.runs_total) },
    { label: t("side.foiling"), value: `${stats.foiling_km.toFixed(1)} km` },
    { label: t("side.foilingTime"), value: fmtDur(stats.foiling_min) },
    { label: t("side.pumps"), value: stats.pumps.toLocaleString("de") },
  ] : [];


  return (
    <div className="w-full">
      <WelcomeBanner />
      <div className="mb-5 flex items-center gap-2">
        <HomeIcon className="h-7 w-7 shrink-0 text-brand-400" />
        <h2 className="min-w-0 truncate text-2xl font-bold">
          {profile?.display_name ? t("phome.hello", { name: profile.display_name }) : t("nav.home")}
        </h2>
        <ChangelogBadge />
      </div>

      {/* Live-Upload-Karte: eigene Session lädt gerade hoch (Home + Sessions, NICHT Community). */}
      <UploadProgressCard />

      <TransferHint />

      {/* App installieren (mobil, nur wenn installierbar) */}
      <InstallPwa className="mb-5 w-full sm:w-auto md:hidden" />

      {/* Letzte Sessions ganz oben (direkt nach der Begrüßung) */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("phome.latest")}</h3>
        <Link to="/sessions" className="text-xs text-brand-300 hover:text-brand-200">{t("phome.allMine")} →</Link>
      </div>
      {/* Wartet eine eigene Session auf Zuordnung, MUSS es hier stehen: ein Push allein genügt nicht
          (wer Push aus hat, erfährt nie, dass seine Session aus den Auswertungen gefallen ist) und die
          drei Karten unten zeigen ältere Sessions nicht. Jan: „der andere sollte schon eine meldung
          sehen in seinem homebereich … oder einen marker an seiner session". Beides jetzt. */}
      {(profile?.needs_classification ?? 0) > 0 && (
        <Link
          /* Bei EINER offenen Session direkt dorthin, bei mehreren in die Liste — dort trägt jede
             betroffene Karte das Badge „Bitte zuordnen". Acht einzelne Hinweise wären Lärm, und ein
             Link auf nur eine von acht würde die anderen sieben verstecken. */
          to={(profile?.needs_classification ?? 0) === 1 && profile?.needs_classification_id
                ? `/sessions/${profile.needs_classification_id}` : "/sessions"}
          className="mb-4 block rounded-xl border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-800 hover:bg-amber-500/15 dark:text-amber-200">
          {(profile?.needs_classification ?? 0) === 1
            ? t("home.needsClassification")
            : t("home.needsClassificationN", { n: profile?.needs_classification ?? 0 })} →
        </Link>
      )}
      {/* Aussortierte: nur ein Einzeiler, und nur solange etwas FRISCHES dabei ist (letzte 7 Tage,
          Server: sorted_out_new) -> verfaellt von selbst, kein Wegklicken. Die Erklaerung steht
          absichtlich erst in der Aussortiert-Ansicht, hier soll kein Absatz stehen. */}
      {(profile?.sorted_out_new ?? 0) > 0 && (
        <Link to="/sessions?filter=other"
          className="mb-4 block rounded-xl border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-800 hover:bg-amber-500/15 dark:text-amber-200">
          {(profile?.sorted_out_new ?? 0) === 1
            ? t("home.sortedOut")
            : t("home.sortedOutN", { n: profile?.sorted_out_new ?? 0 })} →
        </Link>
      )}
      {!latest ? <Spinner /> : latest.length === 0 ? (
        <StartHelp />
      ) : (
        <div className="mb-6 space-y-3">
          {latest.map((s) => (
            <SessionCard
              key={s.id}
              sessionId={s.id}
              startedAt={s.started_at}
              tz={s.tz}
              endedAt={s.ended_at}
              spot={s.place_name}
              foil={s.foil ? `${s.foil.brand} ${s.foil.model} ${s.foil.size}` : null}
              {...setupLabels(s)}
              deviceLabel={s.device_label}
              caption={s.caption}
              avatarName={profile?.display_name}
              avatarUrl={profile?.avatar_url}
              thumbUrl={s.thumb_url}
              photoCount={s.photo_count}
              youtubeUrl={s.youtube_url}
              videoUrl={s.video_url}
              likeCount0={s.like_count ?? 0}
              liked0={!!s.liked}
              trackPreview={s.track_preview}
              stats={s.analysis && <SessionStats a={s.analysis} />}
              statusBadge={s.status !== "analyzed" ? <StatusBadge status={s.status} /> : undefined}
              sportClass={s.sport_class}
              dataQuality={s.data_quality}
              needsClassification={!!s.needs_classification}
            />
          ))}
        </div>
      )}

      {/* Rekorde-Kopf mit Accel/alle-Auswahl (zwei Buttons, aktiver markiert) */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("side.records")}</h3>
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
        {/* Sportart — nur zeigen, wenn es ueberhaupt mehr als eine gibt. Gleiches Feld wie bei den
            Community-Rekorden, damit „meine Rekorde" und „Community-Rekorde" gleich bedient werden. */}
        {sports.length > 1 && (
          <select value={sport} onChange={(e) => setSport(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">
            {sports.map((x) => <option key={x.sport} value={x.sport}>{t(`cls.sport.${x.sport}`)}</option>)}
          </select>
        )}
      </div>

      {/* Zeitraum — dieselben Fenster wie in der Community (PERIODS, ein Ort fuer beides).
          Wirkt auf die Rekorde UND die Gesamt-Kacheln darunter, weil beides aus derselben
          Abfrage kommt: „30 Tage" heisst dann auch Foiling/Pumps der letzten 30 Tage. */}
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {PERIODS.map(([k, labelKey]) => (
          <button
            key={k}
            onClick={() => setPeriod(k)}
            className={`rounded-lg px-2.5 py-1 text-xs ${period === k ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Alle Kacheln: Rekorde + Gesamt-Stats */}
      {!stats ? <Spinner /> : (
        <div className="mb-6 grid grid-cols-3 gap-1.5 lg:grid-cols-5">
          {recTiles.map((r) => {
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
          {statTiles.map((s) => (
            <Card key={s.label} className="h-full px-2.5 py-1.5">
              <div className="text-[11px] leading-tight text-slate-400">{s.label}</div>
              <div className="text-lg font-bold leading-tight tabular-nums text-brand-400">{s.value}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Trainingskurve: Puls nach 1/2/5 Minuten Lauf über die Sessions hinweg. Folgt derselben
          Sportart-Auswahl wie die Rekorde darüber; zeigt sich selbst nur, wenn es genug Puls gibt. */}
      <HrProgress sport={sport || undefined} />

      {/* Wetter & Pegel für den eigenen Homespot */}
      {homespot && <SpotWeather spot={homespot} showSpot />}

      <div className="mt-6">
        <Link to="/community" className="inline-flex items-center gap-1 text-sm text-brand-300 hover:text-brand-200">
          <CommunityIcon className="h-4 w-4" /> {t("home.community")} →
        </Link>
      </div>

      <StartSuccessSection />
      <CarveStatsSection />
    </div>
  );
}
