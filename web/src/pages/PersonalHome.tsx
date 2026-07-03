import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ChatRoom, OverallStats, Profile, SessionSummary } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { SessionCard } from "../components/SessionCard";
import { SessionStats, StatusBadge } from "./Sessions";
import { SpotWeather } from "../components/SpotWeather";
import { InstallPwa } from "../components/InstallPwa";
import { CommunityIcon, BellIcon, ChatBubbleIcon, LocationIcon } from "../components/Icons";
import { useT } from "../i18n";

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

// Persönliche Startseite: Begrüßung, Kacheln (Rekorde + Gesamt-Stats), letzte Sessions.
export default function PersonalHome() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [latest, setLatest] = useState<SessionSummary[] | null>(null);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [homespot, setHomespot] = useState("");
  // Rekorde: nur aus Sessions mit Accel (präzise) oder aus allen (inkl. GPS-only).
  // Default = nur Accel; hat der Nutzer gar keine Accel-Läufe, einmalig auf "alle" fallen.
  const [accelOnly, setAccelOnly] = useState(true);
  const decidedRef = useRef(false);

  useEffect(() => {
    api.getProfile().then(setProfile).catch(() => {});
    api.sessions({ limit: 3 }).then(setLatest).catch(() => setLatest([]));
    api.chatRooms().then(setRooms).catch(() => {});
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

  const unreadTotal = rooms.reduce((n, r) => n + r.unread, 0);

  return (
    <div className="w-full">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">
          {profile?.display_name ? t("phome.hello", { name: profile.display_name }) : t("nav.home")}
        </h2>
        <Link to="/chat"
          className="relative flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400">
          <ChatBubbleIcon className="h-4 w-4" /> {t("chat.title")}
          {unreadTotal > 0 && (
            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">{unreadTotal}</span>
          )}
        </Link>
      </div>

      {/* App installieren (mobil, nur wenn installierbar) */}
      <InstallPwa className="mb-5 w-full sm:w-auto md:hidden" />

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
                    {new Date(r.rec.started_at).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" })}
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

      {/* Meine Chats */}
      {rooms.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("phome.myChats")}</h3>
          <div className="space-y-2">
            {rooms.map((r) => (
              <Link key={r.scope} to={r.url}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 hover:border-slate-700 hover:bg-slate-900">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {r.scope.startsWith("spot:")
                      ? <LocationIcon className="h-4 w-4 shrink-0 text-brand-400" />
                      : <ChatBubbleIcon className="h-4 w-4 shrink-0 text-brand-400" />}
                    <span className="font-medium text-slate-100">{r.label}</span>
                    <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                      {t(r.scope.startsWith("spot:") ? "chat.kindSpot" : "chat.kindSession")}
                    </span>
                    {r.push && <BellIcon className="h-3.5 w-3.5 text-brand-400" />}
                  </span>
                  <span className="block truncate text-xs text-slate-400">{r.last_text}</span>
                </span>
                {r.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-slate-950">{r.unread}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Letzte Sessions */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("phome.latest")}</h3>
        <Link to="/sessions" className="text-xs text-brand-300 hover:text-brand-200">{t("phome.allMine")} →</Link>
      </div>
      {!latest ? <Spinner /> : latest.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-300">{t("sessions.none")}</Card>
      ) : (
        <div className="space-y-3">
          {latest.map((s) => (
            <SessionCard
              key={s.id}
              sessionId={s.id}
              startedAt={s.started_at}
              endedAt={s.ended_at}
              spot={s.place_name}
              foil={s.foil ? `${s.foil.brand} ${s.foil.model} ${s.foil.size}` : null}
              caption={s.caption}
              avatarName={profile?.display_name}
              avatarUrl={profile?.avatar_url}
              thumbUrl={s.thumb_url}
              photoCount={s.photo_count}
              likeCount0={s.like_count ?? 0}
              liked0={!!s.liked}
              trackPreview={s.track_preview}
              stats={s.analysis && <SessionStats a={s.analysis} />}
              statusBadge={s.status !== "analyzed" ? <StatusBadge status={s.status} /> : undefined}
            />
          ))}
        </div>
      )}

      <div className="mt-6">
        <Link to="/community" className="inline-flex items-center gap-1 text-sm text-brand-300 hover:text-brand-200">
          <CommunityIcon className="h-4 w-4" /> {t("home.community")} →
        </Link>
      </div>
    </div>
  );
}
