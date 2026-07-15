import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Avatar } from "./ui";
import { HeartIcon, FlagIcon, CloseIcon, ChevronIcon } from "./Icons";
import { useT } from "../i18n";
import { useCloseOnBack } from "../lib/useCloseOnBack";

export interface LightboxPhoto {
  url: string;
  session_id: number;
  name?: string | null;
  avatar_url?: string | null;
  caption?: string | null;
  started_at?: string | null;
  like_count?: number;
  liked?: boolean;
  my_inappropriate?: boolean;
}

// Fullscreen-Galerie: durchschalten (Pfeile/Tastatur/Swipe), liken/melden, Link zur Session.
// Schließt per Backdrop-Klick, das X oder Esc. Etwas Rand → man sieht, dass man nicht weg ist.
export function Lightbox({ photos, index, onClose, onChange, readOnly = false }: {
  photos: LightboxPhoto[];
  index: number;
  onClose: () => void;
  onChange?: (i: number) => void;
  readOnly?: boolean;   // öffentlicher Link: Like/Melden/Session-Link ausblenden (kein Login)
}) {
  const t = useT();
  useCloseOnBack(true, onClose);
  const [i, setI] = useState(index);
  const [state, setState] = useState<Record<number, { liked: boolean; like_count: number; my_inappropriate: boolean }>>({});

  useEffect(() => setI(index), [index]);
  const go = (next: number) => { const n = (next + photos.length) % photos.length; setI(n); onChange?.(n); };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go((i + 1));
      else if (e.key === "ArrowLeft") go((i - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [i, photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = photos[i];
  if (!p) return null;
  const st = state[p.session_id] ?? { liked: !!p.liked, like_count: p.like_count ?? 0, my_inappropriate: !!p.my_inappropriate };
  const setSt = (patch: Partial<typeof st>) => setState((prev) => ({ ...prev, [p.session_id]: { ...st, ...patch } }));

  const like = (e: React.MouseEvent) => {
    e.stopPropagation();
    api.toggleLike(p.session_id).then((r) => setSt({ liked: r.liked, like_count: r.like_count })).catch(() => {});
  };
  const report = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!st.my_inappropriate && !confirm(t("vote.reportConfirm"))) return;
    api.toggleVote(p.session_id, "inappropriate").then((r) => setSt({ my_inappropriate: r.my_inappropriate })).catch(() => {});
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Kopfzeile: Schließen */}
      <div className="flex shrink-0 items-center justify-between p-3 text-slate-200">
        <span className="text-xs tabular-nums text-slate-400">{i + 1} / {photos.length}</span>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close"
          className="rounded-full bg-white/10 p-1.5 leading-none hover:bg-white/20"><CloseIcon className="h-5 w-5" /></button>
      </div>

      {/* Bild + Navigationspfeile */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        {photos.length > 1 && (
          <button onClick={(e) => { e.stopPropagation(); go(i - 1); }} aria-label="Previous"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronIcon className="h-6 w-6 rotate-180" /></button>
        )}
        <img
          src={p.url}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
        {photos.length > 1 && (
          <button onClick={(e) => { e.stopPropagation(); go(i + 1); }} aria-label="Next"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronIcon className="h-6 w-6" /></button>
        )}
      </div>

      {/* Fußzeile: Wer/Caption + Votes + Session-Link */}
      <div className="shrink-0 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-xl bg-slate-900/80 px-3 py-2">
          <Avatar name={p.name} url={p.avatar_url} size={28} />
          <div className="min-w-0 flex-1">
            {p.name && <div className="truncate text-sm text-slate-100">{p.name}</div>}
            {p.caption && <div className="truncate text-xs italic text-slate-300">{p.caption}</div>}
          </div>
          {!readOnly && (<>
          <button onClick={like}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm ${st.liked ? "bg-rose-500/20 text-rose-500" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
            <HeartIcon className="h-4 w-4" filled={st.liked} /> {st.like_count > 0 && <span className="tabular-nums text-xs">{st.like_count}</span>}
          </button>
          <button onClick={report} title={st.my_inappropriate ? t("sd.reported") : t("sd.inappropriate")}
            className={`rounded-lg px-2.5 py-1.5 text-sm ${st.my_inappropriate ? "bg-red-500/20 text-red-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            <FlagIcon className="h-4 w-4" />
          </button>
          <Link to={`/sessions/${p.session_id}`} onClick={onClose}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
            {t("lb.toSession")}
          </Link>
          </>)}
        </div>
      </div>
    </div>
  );
}
