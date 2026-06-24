import { ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Avatar } from "./ui";
import { ChevronIcon } from "./Icons";
import { TrackPreview } from "./TrackPreview";
import { useT } from "../i18n";

function hhmm(s: string) {
  return new Date(s).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function fmtSpan(start: string, end: string) {
  const s = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")} h` : `${m}:${String(s % 60).padStart(2, "0")} min`;
}

// Einheitliche Session-Listenkarte (genutzt von „Meine Sessions" und „Alle Sessions").
// Avatar + Datum (+ optionaler Name), optionale Zeit/Dauer, Spot/Sport, Beschriftung,
// frei einsetzbarer Stats-Block, rechts Like + Vorschaubild + optionaler Status.
export function SessionCard({
  sessionId, startedAt, endedAt, spot, foil, caption,
  avatarName, avatarUrl, name, stats, thumbUrl, photoCount = 0,
  likeCount0 = 0, liked0 = false, statusBadge, trackPreview,
}: {
  sessionId: number;
  startedAt: string | null;
  endedAt?: string | null;
  spot?: string | null;
  foil?: string | null;   // Foil-Label (nur wenn explizit gewählt)
  caption?: string | null;
  avatarName?: string | null;
  avatarUrl?: string | null;
  name?: string | null;
  stats?: ReactNode;
  thumbUrl?: string | null;
  photoCount?: number;
  likeCount0?: number;
  liked0?: boolean;
  statusBadge?: ReactNode;
  trackPreview?: string | null;
}) {
  const t = useT();
  const [liked, setLiked] = useState(liked0);
  const [count, setCount] = useState(likeCount0);
  const toggleLike = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    api.toggleLike(sessionId).then((r) => { setLiked(r.liked); setCount(r.like_count); }).catch(() => {});
  };
  const dateStr = startedAt
    ? new Date(startedAt).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    : "";

  const thumbEl = thumbUrl ? (
    <div className="relative">
      <img src={thumbUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
      {photoCount > 1 && (
        <span className="absolute -right-1 -top-1 rounded-full bg-slate-900/90 px-1.5 text-[10px] text-slate-200">{photoCount}</span>
      )}
    </div>
  ) : null;
  const trackEl = trackPreview ? <TrackPreview data={trackPreview} className="h-12 w-16 text-brand-400" /> : null;

  return (
    <Link to={`/sessions/${sessionId}`} className="block">
      <Card className="flex items-start justify-between gap-3 p-4 transition-colors hover:border-slate-700 hover:bg-slate-900">
        <div className="flex min-w-0 gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <Avatar name={avatarName ?? name} url={avatarUrl} size={44} />
            <button
              onClick={toggleLike}
              title={liked ? t("row.unlike") : t("row.like")}
              className={`flex items-center gap-1 text-sm ${liked ? "text-rose-400" : "text-slate-400 hover:text-slate-200"}`}
            >
              {liked ? "❤️" : "🤍"}{count > 0 && <span className="text-xs tabular-nums">{count}</span>}
            </button>
            {/* Mobil: Thumbnail + Track linksbündig unter dem Profilbild */}
            {(thumbEl || trackEl) && (
              <div className="mt-1 flex flex-col items-center gap-1.5 sm:hidden">
                {thumbEl}
                {trackEl}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-semibold">
              {dateStr}
              {name && <span className="text-brand-300"> · {name}</span>}
              {caption && <span className="text-slate-100"> · {caption}</span>}
            </div>
            <div className="text-sm text-slate-300">
              {startedAt && hhmm(startedAt)}
              {startedAt && endedAt && (
                <>
                  {` ${t("sessions.timeTo")} `}{hhmm(endedAt)}
                  <span className="text-slate-400"> · {fmtSpan(startedAt, endedAt)}</span>
                </>
              )}
              {spot && <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">📍 {spot}</span>}
              {foil && <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">🛩 {foil}</span>}
            </div>
            {stats}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* Desktop: Thumbnail + Track rechts */}
          <div className="hidden items-center gap-3 sm:flex">
            {thumbEl}
            {trackEl}
          </div>
          {statusBadge}
          <ChevronIcon className="h-5 w-5 text-slate-400" />
        </div>
      </Card>
    </Link>
  );
}
