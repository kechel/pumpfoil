import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, OverallStats, Profile, SessionSummary } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { SessionCard } from "../components/SessionCard";
import { CommunityIcon, SpotsIcon } from "../components/Icons";
import { Chat } from "../components/Chat";
import { useT } from "../i18n";

// Persönliche Startseite: Begrüßung, meine Rekorde, letzte Sessions, Homespot.
export default function PersonalHome() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [latest, setLatest] = useState<SessionSummary[] | null>(null);
  const [homespot, setHomespot] = useState("");

  useEffect(() => {
    api.getProfile().then(setProfile).catch(() => {});
    api.stats(true).then(setStats).catch(() => {});
    api.sessions({ limit: 3 }).then(setLatest).catch(() => setLatest([]));
    api.getSettings().then((s) => setHomespot((s.homespot as string) ?? "")).catch(() => {});
  }, []);

  const recs = stats?.records;
  const recTiles: { label: string; rec?: { value: number; session_id: number | null }; fmt: (v: number) => string }[] = [
    { label: t("rec.farthestRun"), rec: recs?.distance, fmt: (v) => `${Math.round(v)} m` },
    { label: t("rec.longestRun"), rec: recs?.duration, fmt: (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}` },
    { label: t("rec.topSpeed"), rec: recs?.speed, fmt: (v) => `${(v * 3.6).toFixed(1)} km/h` },
    { label: t("rec.longestGlide"), rec: recs?.glide, fmt: (v) => `${v.toFixed(1)} s` },
    { label: t("rec.mostRuns"), rec: recs?.runs, fmt: (v) => `${Math.round(v)}` },
  ];

  return (
    <div className="w-full">
      <h2 className="mb-5 text-2xl font-bold">
        {profile?.display_name ? t("phome.hello", { name: profile.display_name }) : t("nav.home")}
      </h2>

      {/* Meine Rekorde */}
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("side.records")}</h3>
      {!stats ? <Spinner /> : (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {recTiles.map((r) => {
            const v = r.rec?.value ?? 0;
            const inner = (
              <Card className="h-full p-3">
                <div className="text-xs text-slate-400">{r.label}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-brand-300">{v > 0 ? r.fmt(v) : "–"}</div>
              </Card>
            );
            return v > 0 && r.rec?.session_id
              ? <Link key={r.label} to={`/sessions/${r.rec.session_id}`} className="block transition-transform hover:scale-[1.02]">{inner}</Link>
              : <div key={r.label}>{inner}</div>;
          })}
        </div>
      )}

      {/* Homespot-Chat */}
      {homespot && (
        <Card className="mb-6 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <SpotsIcon className="h-5 w-5 text-brand-400" />
              <span className="font-medium text-slate-100">{homespot}</span>
            </span>
            <Link to={`/alle-sessions?spot=${encodeURIComponent(homespot)}`}
              className="text-xs text-brand-300 hover:text-brand-200">{t("phome.homespotSessions")} →</Link>
          </div>
          <Chat scope={`spot:${homespot}`} />
        </Card>
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
              foil={s.foil ? `${s.foil.brand} ${s.foil.model}` : null}
              caption={s.caption}
              avatarName={profile?.display_name}
              avatarUrl={profile?.avatar_url}
              thumbUrl={s.thumb_url}
              photoCount={s.photo_count}
              likeCount0={s.like_count ?? 0}
              liked0={!!s.liked}
              trackPreview={s.track_preview}
            />
          ))}
        </div>
      )}

      <div className="mt-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-brand-300 hover:text-brand-200">
          <CommunityIcon className="h-4 w-4" /> {t("home.community")} →
        </Link>
      </div>
    </div>
  );
}
