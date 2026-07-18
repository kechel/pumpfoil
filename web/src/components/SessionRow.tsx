import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, CommunitySession } from "../lib/api";
import { Avatar, NewBadge } from "./ui";
import { HeartIcon, LocationIcon, CompareIcon, WatchIcon } from "./Icons";
import { useCompare, toggleCompare, refKey } from "../lib/compare";
import { useT } from "../i18n";
import { fmtDate, fmtTime } from "../lib/time";

export function fmtDay(iso: string | null, tz?: string | null): string {
  if (!iso) return "";
  return fmtDate(iso, tz, { weekday: "short", day: "2-digit", month: "short", year: "2-digit" });
}

function LikeButton({ id, liked0, count0 }: { id: number; liked0: boolean; count0: number }) {
  const t = useT();
  const [liked, setLiked] = useState(liked0);
  const [count, setCount] = useState(count0);
  const [busy, setBusy] = useState(false);
  const toggle = () => {
    if (busy) return;
    setBusy(true);
    api.toggleLike(id).then((r) => { setLiked(r.liked); setCount(r.like_count); }).catch(() => {}).finally(() => setBusy(false));
  };
  return (
    <button
      onClick={toggle}
      className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm transition-colors ${liked ? "text-rose-400" : "text-slate-300 hover:text-slate-200"}`}
      title={liked ? t("row.unlike") : t("row.like")}
    >
      <HeartIcon className="h-4 w-4" filled={liked} />
      {count > 0 && <span className="tabular-nums text-xs">{count}</span>}
    </button>
  );
}

export function SessionRow({ s, showName = true, showSpot = true }: { s: CommunitySession; showName?: boolean; showSpot?: boolean }) {
  const t = useT();
  // Long-Press (gedrückt halten) markiert die Session für den Vergleich — wie der
  // Vergleichs-Button in der Detailansicht, nur direkt aus der Liste.
  const refs = useCompare();
  const inCompare = refs.some((r) => refKey(r) === refKey({ sessionId: s.session_id, runIdx: null }));
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => { if (timer.current != null) { clearTimeout(timer.current); timer.current = null; } };
  const onPointerDown = (e: React.PointerEvent) => {
    longPressed.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    cancel();
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      toggleCompare({ sessionId: s.session_id, runIdx: null });
      if (navigator.vibrate) { navigator.vibrate(30); }
    }, 450);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current && (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10)) cancel();
  };
  // Long-Press hat schon getoggelt -> den darauffolgenden Klick (Navigation) schlucken.
  const onClickCapture = (e: React.MouseEvent) => {
    if (longPressed.current) { e.preventDefault(); e.stopPropagation(); longPressed.current = false; }
  };
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onPointerMove={onPointerMove}
      onClickCapture={onClickCapture}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: "none" }}
      className={`relative flex select-none items-stretch overflow-hidden rounded-xl bg-slate-900 transition-colors hover:bg-slate-800 ${inCompare ? "ring-2 ring-brand-500" : ""}`}
    >
      {inCompare && (
        <span className="absolute right-1 top-1 z-10 rounded-full bg-brand-500 p-0.5 text-slate-950" title={t("compare.inList")}>
          <CompareIcon className="h-3.5 w-3.5" />
        </span>
      )}
      {showName && (
        <div className="w-14 shrink-0 self-stretch">
          <Avatar name={s.name} url={s.avatar_url} size={48} fill rounded="rounded-none" />
        </div>
      )}
      <Link to={`/sessions/${s.session_id}`} draggable={false} style={{ WebkitTouchCallout: "none" }} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-100">
            {showName && s.name && <span className="text-brand-300">{s.name}</span>}
            {showName && s.name && s.author_new && <NewBadge className="ml-1 align-middle" />}
            {showName && s.name && (showSpot && s.spot ? " · " : "")}
            {showSpot && s.spot && <span className="inline-flex items-center gap-1 text-slate-200"><LocationIcon className="h-3.5 w-3.5" /> {s.spot}</span>}
            {!(showName && s.name) && !(showSpot && s.spot) && <span className="text-slate-300">{t("row.session")}</span>}
          </div>
          <div className="text-[11px] text-slate-400">
            {fmtDay(s.started_at, s.tz)}
            {s.started_at && (
              <span className="ml-1">
                · {fmtTime(s.started_at!, s.tz)}{s.ended_at && <>{` ${t("sessions.timeTo")} `}{fmtTime(s.ended_at, s.tz)}</>}{t("sessions.oclock") && ` ${t("sessions.oclock")}`}
              </span>
            )}
            {s.device_label && <span className="ml-1 inline-flex items-center gap-1"> · <WatchIcon className="h-3 w-3" /> {s.device_label}</span>}
          </div>
          {s.caption && <div className="truncate text-[11px] italic text-slate-300">{s.caption}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-right text-xs tabular-nums">
          <div>
            <div className="font-semibold text-slate-100">{s.runs}</div>
            <div className="text-[10px] uppercase text-slate-400">{t("unit.runs")}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-100">{s.foiling_km.toFixed(1)}</div>
            <div className="text-[10px] uppercase text-slate-400">km</div>
          </div>
          {s.max_speed_mps != null && (
            <div>
              <div className="font-semibold text-slate-100">{(s.max_speed_mps * 3.6).toFixed(0)}</div>
              <div className="text-[10px] uppercase text-slate-400">km/h</div>
            </div>
          )}
        </div>
        {s.thumb_url && (
          <img src={s.thumb_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
        )}
      </Link>
      <div className="flex items-center pr-1">
        <LikeButton id={s.session_id} liked0={!!s.liked} count0={s.like_count ?? 0} />
      </div>
    </div>
  );
}
