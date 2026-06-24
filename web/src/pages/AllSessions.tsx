import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, CommunitySession } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { SessionCard } from "../components/SessionCard";
import { SessionScopeTabs } from "../components/SessionScopeTabs";
import { WaveIcon } from "../components/Icons";
import { useT } from "../i18n";

const PAGE = 20;

export default function AllSessions() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const name = sp.get("name") || "";
  const spot = sp.get("spot") || "";
  const [nameInput, setNameInput] = useState(name);
  const [spots, setSpots] = useState<string[]>([]);
  const [items, setItems] = useState<CommunitySession[]>([]);
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(0);
  const moreRef = useRef(true);
  const loadingRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => { api.communitySpots().then((s) => setSpots(s.all)).catch(() => {}); }, []);
  useEffect(() => { setNameInput(name); }, [name]);

  const load = (reset: boolean) => {
    if (loadingRef.current || (!reset && !moreRef.current)) return;
    loadingRef.current = true; setLoading(true);
    const off = reset ? 0 : offsetRef.current;
    api.communitySessions(PAGE, off, { name: name || undefined, spot: spot || undefined })
      .then((rows) => {
        offsetRef.current = off + rows.length;
        moreRef.current = rows.length === PAGE;
        setItems((prev) => (reset ? rows : [...prev, ...rows]));
      })
      .catch(() => {})
      .finally(() => { loadingRef.current = false; setLoading(false); });
  };

  useEffect(() => { moreRef.current = true; load(true); }, [name, spot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const o = new IntersectionObserver((e) => { if (e[0].isIntersecting) load(false); }, { rootMargin: "400px" });
    if (sentinel.current) o.observe(sentinel.current);
    return () => o.disconnect();
  }, [name, spot]); // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v); else n.delete(k);
    setSp(n);
  };

  return (
    <div>
      <SessionScopeTabs />
      <div className="mb-4 flex items-center gap-2">
        <WaveIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">
          {spot ? `${t("nav.sessions")} · 📍 ${spot}` : t("nav.allSessions")}
        </h2>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <form onSubmit={(e) => { e.preventDefault(); setParam("name", nameInput.trim()); }} className="flex gap-2">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={t("all.filterName")}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
          <button className="rounded-xl bg-slate-800 px-4 text-sm text-slate-200">{t("common.search")}</button>
        </form>
        <select
          value={spot}
          onChange={(e) => setParam("spot", e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100"
        >
          <option value="">{t("all.allSpots")}</option>
          {spots.map((s) => <option key={s} value={s}>📍 {s}</option>)}
        </select>
        {(name || spot) && (
          <button onClick={() => setSp(new URLSearchParams())} className="rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:text-slate-100">
            {t("all.resetFilter")}
          </button>
        )}
      </div>

      {items.length === 0 && !loading ? (
        <Card className="p-8 text-center text-slate-300">{t("all.none")}</Card>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <SessionCard
              key={s.session_id}
              sessionId={s.session_id}
              startedAt={s.started_at}
              spot={s.spot}
              foil={s.foil ? `${s.foil.brand} ${s.foil.model}` : null}
              caption={s.caption}
              name={s.name}
              avatarName={s.name}
              avatarUrl={s.avatar_url}
              thumbUrl={s.thumb_url}
              photoCount={s.photo_count}
              likeCount0={s.like_count ?? 0}
              liked0={!!s.liked}
              trackPreview={s.track_preview}
              stats={
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
                  <span>🔁 {s.runs} {s.runs === 1 ? t("unit.run") : t("unit.runs")}</span>
                  <span>🏄 <b className="text-brand-400">{s.foiling_km.toFixed(1)}</b> km</span>
                </div>
              }
            />
          ))}
        </div>
      )}
      <div ref={sentinel} className="h-8" />
      {loading && <Spinner />}
    </div>
  );
}
