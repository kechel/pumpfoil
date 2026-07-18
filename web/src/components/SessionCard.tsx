import { ReactNode, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Avatar } from "./ui";
import { ChevronIcon, HeartIcon, LocationIcon, FoilIcon, CompareIcon, WatchIcon, PlayIcon } from "./Icons";
import { TrackPreview } from "./TrackPreview";
import { VideoModal, ytId } from "./VideoModal";
import { useCompare, toggleCompare, refKey } from "../lib/compare";
import { useT } from "../i18n";
import { fmtDate, fmtTime } from "../lib/time";
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
  sessionId, startedAt, endedAt, tz, spot, foil, deviceLabel, caption,
  avatarName, avatarUrl, name, stats, thumbUrl, photoCount = 0, youtubeUrl,
  likeCount0 = 0, liked0 = false, statusBadge, trackPreview, highlight = false, owned = false,
}: {
  sessionId: number;
  owned?: boolean;   // eigene Session? -> Merge-Angebot in Vergleichen
  startedAt: string | null;
  endedAt?: string | null;
  tz?: string | null;   // Spot-Zeitzone -> Uhrzeiten in Ortszeit
  spot?: string | null;
  foil?: string | null;   // Foil-Label (nur wenn explizit gewählt)
  deviceLabel?: string | null;   // Uhr-/Geräte-Bezeichnung der Aufnahme
  caption?: string | null;
  avatarName?: string | null;
  avatarUrl?: string | null;
  name?: string | null;
  stats?: ReactNode;
  thumbUrl?: string | null;
  photoCount?: number;
  youtubeUrl?: string | null;   // verlinktes YouTube-Video -> Vorschau-Thumbnail mit Play
  likeCount0?: number;
  liked0?: boolean;
  statusBadge?: ReactNode;
  trackPreview?: string | null;
  highlight?: boolean;   // zuletzt angesehene Session in der Liste hervorheben
}) {
  const t = useT();
  const [liked, setLiked] = useState(liked0);
  const [count, setCount] = useState(likeCount0);
  const [vid, setVid] = useState<string | null>(null);   // offenes Video-Popup
  const compareRefs = useCompare();
  const inCompare = compareRefs.some((r) => refKey(r) === refKey({ sessionId, runIdx: null }));
  const toggleLike = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    api.toggleLike(sessionId).then((r) => { setLiked(r.liked); setCount(r.like_count); }).catch(() => {});
  };
  const onCompare = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    toggleCompare({ sessionId, runIdx: null, owned, date: startedAt ? startedAt.slice(0, 10) : undefined });
  };
  // Long-Press (gedrückt halten) markiert die ganze Karte für den Vergleich.
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const startPt = useRef<{ x: number; y: number } | null>(null);
  const cancelHold = () => { if (timer.current != null) { clearTimeout(timer.current); timer.current = null; } };
  const onPointerDown = (e: React.PointerEvent) => {
    longPressed.current = false;
    startPt.current = { x: e.clientX, y: e.clientY };
    cancelHold();
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      toggleCompare({ sessionId, runIdx: null, owned, date: startedAt ? startedAt.slice(0, 10) : undefined });
      if (navigator.vibrate) { navigator.vibrate(30); }
    }, 450);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startPt.current && (Math.abs(e.clientX - startPt.current.x) > 10 || Math.abs(e.clientY - startPt.current.y) > 10)) cancelHold();
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (longPressed.current) { e.preventDefault(); e.stopPropagation(); longPressed.current = false; }
  };
  const dateStr = startedAt
    ? fmtDate(startedAt, tz, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
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
  // Verlinktes Video: Vorschau-Thumbnail (CSP-sicherer Proxy) + Play-Badge; Klick oeffnet das
  // Video-Popup (statt zur Session zu navigieren). Long-Press-Compare wird unterbunden.
  const vidId = youtubeUrl ? ytId(youtubeUrl) : "";
  const videoEl = vidId ? (
    <button
      type="button"
      title={t("row.playVideo")}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setVid(youtubeUrl!); }}
      className="relative block h-12 w-16 overflow-hidden rounded-lg"
    >
      <img src={`/api/public/video-thumb/${vidId}`} alt="" className="h-12 w-16 object-cover" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60">
          <PlayIcon className="h-3.5 w-3.5 text-white" />
        </span>
      </span>
    </button>
  ) : null;

  return (
    <>
    <Link
      to={`/sessions/${sessionId}`}
      id={highlight ? "session-highlight" : undefined}
      className="block select-none scroll-mt-24"
      style={{ WebkitTouchCallout: "none" }}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onPointerMove={onPointerMove}
      onClickCapture={onClickCapture}
    >
      <Card className={`flex items-start justify-between gap-3 p-4 transition-colors hover:border-slate-700 hover:bg-slate-900 ${inCompare ? "ring-2 ring-brand-500" : highlight ? "ring-2 ring-brand-400 ring-offset-2 ring-offset-slate-950" : ""}`}>
        <div className="flex min-w-0 gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <Avatar name={avatarName ?? name} url={avatarUrl} size={44} />
            <button
              onClick={toggleLike}
              title={liked ? t("row.unlike") : t("row.like")}
              className={`flex items-center gap-1 text-sm ${liked ? "text-rose-400" : "text-slate-400 hover:text-slate-200"}`}
            >
              <HeartIcon className="h-4 w-4" filled={liked} />{count > 0 && <span className="text-xs tabular-nums">{count}</span>}
            </button>
            <button
              onClick={onCompare}
              title={inCompare ? t("compare.remove") : t("compare.add")}
              className={`flex items-center text-sm ${inCompare ? "text-brand-400" : "text-slate-400 hover:text-slate-200"}`}
            >
              <CompareIcon className="h-4 w-4" />
            </button>
            {/* Mobil: Thumbnail + Video + Track linksbündig unter dem Profilbild */}
            {(thumbEl || videoEl || trackEl) && (
              <div className="mt-1 flex flex-col items-center gap-1.5 sm:hidden">
                {thumbEl}
                {videoEl}
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
              {startedAt && fmtTime(startedAt, tz)}
              {startedAt && endedAt && <>{` ${t("sessions.timeTo")} `}{fmtTime(endedAt, tz)}</>}
              {startedAt && t("sessions.oclock") && ` ${t("sessions.oclock")}`}
              {startedAt && endedAt && <span className="text-slate-400"> · {fmtSpan(startedAt, endedAt)}</span>}
              {spot && <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300"><LocationIcon className="h-3.5 w-3.5" /> {spot}</span>}
              {foil && <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300"><FoilIcon className="h-3.5 w-3.5" /> {foil}</span>}
              {deviceLabel && <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300"><WatchIcon className="h-3.5 w-3.5" /> {deviceLabel}</span>}
            </div>
            {stats}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* Desktop: Thumbnail + Video + Track rechts */}
          <div className="hidden items-center gap-3 sm:flex">
            {thumbEl}
            {videoEl}
            {trackEl}
          </div>
          {statusBadge}
          <ChevronIcon className="h-5 w-5 text-slate-400" />
        </div>
      </Card>
    </Link>
    {vid && <VideoModal url={vid} onClose={() => setVid(null)} />}
    </>
  );
}
