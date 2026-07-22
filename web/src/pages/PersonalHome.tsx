import { useEffect, useRef, useState } from "react";
import { fmtDate } from "../lib/time";
import { Link } from "react-router-dom";
import { api, OverallStats, Profile, SessionSummary } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { SessionCard } from "../components/SessionCard";
import { SessionStats, StatusBadge } from "./Sessions";
import { SpotWeather } from "../components/SpotWeather";
import { InstallPwa } from "../components/InstallPwa";
import { WelcomeBanner } from "../components/WelcomeBanner";
import { CommunityIcon, SendIcon, HomeIcon } from "../components/Icons";
import { PERIODS } from "./Home";
import { useT } from "../i18n";

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
// Start-Erfolgsquote (persönlich): erkannter Lauf < Schwelle = Startversuch, >= Schwelle = Erfolg.
// Ganz unten auf der eigenen Home, 5 Zeitfenster, Schwelle einstellbar (Nutzer-Settings).
function StartSuccessSection() {
  const t = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.startSuccess>> | null>(null);
  const [thr, setThr] = useState<number>(20);
  const load = () => api.startSuccess().then((d) => { setData(d); setThr(d.threshold_m); }).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!data || (data.windows.all?.total ?? 0) === 0) return null;   // ohne Läufe: nichts zeigen
  function commit(v: number) {
    const nn = Math.max(5, Math.min(200, Math.round(v || 20)));
    setThr(nn);
    api.saveSettings({ start_threshold_m: nn }).then(load).catch(() => {});
  }
  return (
    <div className="mt-8">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">{t("home.startSuccess")}</h2>
        <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
          {t("home.startThreshold")}
          <input type="number" value={thr} min={5} max={200} step={5}
            onChange={(e) => setThr(Number(e.target.value))}
            onBlur={(e) => commit(Number(e.target.value))}
            className="w-14 rounded bg-slate-800 px-1.5 py-0.5 text-right tabular-nums text-slate-100" /> m
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PERIODS.map(([k, lbl]) => {
          const w = data.windows[k];
          return (
            <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
              <div className="text-lg font-bold tabular-nums text-brand-400">{w?.rate == null ? "–" : `${w.rate}%`}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-300">{t(lbl)}</div>
              {w && w.total > 0 && <div className="mt-0.5 text-[10px] tabular-nums text-slate-500">{w.success}/{w.total}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PersonalHome() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [latest, setLatest] = useState<SessionSummary[] | null>(null);
  const [homespot, setHomespot] = useState("");
  // Rekorde: nur aus Sessions mit Accel (präzise) oder aus allen (inkl. GPS-only).
  // VORERST Default "alle" (zu wenige Nutzer, um einzuschränken); smarter Default vorbereitet.
  const [accelOnly, setAccelOnly] = useState(false);
  const decidedRef = useRef(false);

  useEffect(() => {
    api.getProfile().then(setProfile).catch(() => {});
    api.sessions({ limit: 3 }).then(setLatest).catch(() => setLatest([]));
    api.getSettings().then((s) => setHomespot((s.homespot as string) ?? "")).catch(() => {});
  }, []);
  useEffect(() => {
    api.stats(accelOnly).then((s) => {
      if (!decidedRef.current) {
        decidedRef.current = true;
        const noAccel = !s.records || (["distance", "duration", "speed"] as const)
          .every((k) => (s.records?.[k]?.value ?? 0) === 0);
        if (accelOnly && noAccel) { setAccelOnly(false); return; }  // -> Refetch mit "alle"
      }
      setStats(s);
    }).catch(() => {});
  }, [accelOnly]);

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
      <h2 className="mb-5 flex items-center gap-2 text-2xl font-bold">
        <HomeIcon className="h-7 w-7 text-brand-400" />
        {profile?.display_name ? t("phome.hello", { name: profile.display_name }) : t("nav.home")}
      </h2>

      <TransferHint />

      {/* App installieren (mobil, nur wenn installierbar) */}
      <InstallPwa className="mb-5 w-full sm:w-auto md:hidden" />

      {/* Letzte Sessions ganz oben (direkt nach der Begrüßung) */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("phome.latest")}</h3>
        <Link to="/sessions" className="text-xs text-brand-300 hover:text-brand-200">{t("phome.allMine")} →</Link>
      </div>
      {!latest ? <Spinner /> : latest.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-300">{t("sessions.none")}</Card>
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
            />
          ))}
        </div>
      )}

      {/* Rekorde-Kopf mit Accel/alle-Auswahl (zwei Buttons, aktiver markiert) */}
      <div className="mb-2 flex items-center gap-2">
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

      {/* Wetter & Pegel für den eigenen Homespot */}
      {homespot && <SpotWeather spot={homespot} showSpot />}

      <div className="mt-6">
        <Link to="/community" className="inline-flex items-center gap-1 text-sm text-brand-300 hover:text-brand-200">
          <CommunityIcon className="h-4 w-4" /> {t("home.community")} →
        </Link>
      </div>

      <StartSuccessSection />
    </div>
  );
}
