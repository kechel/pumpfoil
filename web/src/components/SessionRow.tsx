import { useState } from "react";
import { Link } from "react-router-dom";
import { api, CommunitySession } from "../lib/api";
import { Avatar } from "./ui";
import { HeartIcon, LocationIcon } from "./Icons";
import { useT } from "../i18n";

export function fmtDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "2-digit" });
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
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl bg-slate-900 transition-colors hover:bg-slate-800">
      {showName && (
        <div className="w-14 shrink-0 self-stretch">
          <Avatar name={s.name} url={s.avatar_url} size={48} fill rounded="rounded-none" />
        </div>
      )}
      <Link to={`/sessions/${s.session_id}`} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-100">
            {showName && s.name && <span className="text-brand-300">{s.name}</span>}
            {showName && s.name && (showSpot && s.spot ? " · " : "")}
            {showSpot && s.spot && <span className="inline-flex items-center gap-1 text-slate-200"><LocationIcon className="h-3.5 w-3.5" /> {s.spot}</span>}
            {!(showName && s.name) && !(showSpot && s.spot) && <span className="text-slate-300">{t("row.session")}</span>}
          </div>
          <div className="text-[11px] text-slate-400">{fmtDay(s.started_at)}</div>
          {s.caption && <div className="truncate text-[11px] italic text-slate-300">{s.caption}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-right text-xs tabular-nums">
          <div>
            <div className="font-semibold text-white">{s.runs}</div>
            <div className="text-[10px] uppercase text-slate-400">{t("unit.runs")}</div>
          </div>
          <div>
            <div className="font-semibold text-white">{s.foiling_km.toFixed(1)}</div>
            <div className="text-[10px] uppercase text-slate-400">km</div>
          </div>
          {s.max_speed_mps != null && (
            <div>
              <div className="font-semibold text-white">{(s.max_speed_mps * 3.6).toFixed(0)}</div>
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
