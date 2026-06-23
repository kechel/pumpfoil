import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, SessionSummary } from "../lib/api";
import { Card, Spinner, ErrorBox } from "../components/ui";
import { WaveIcon, ListIcon } from "../components/Icons";
import { SessionCard } from "../components/SessionCard";
import { useT } from "../i18n";

const PAGE = 20;

function monthLabel(m: string) {
  return new Date(m + "-01T00:00:00").toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export default function Sessions() {
  const t = useT();
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [months, setMonths] = useState<{ month: string; count: number }[]>([]);
  const [sp, setSp] = useSearchParams();
  const initFilter: "pump" | "other" = sp.get("filter") === "other" ? "other" : "pump";
  const initMonth = sp.get("month") || "";
  const [month, setMonth] = useState(initMonth);
  const [filter, setFilter] = useState<"pump" | "other">(initFilter);
  const filterRef = useRef(initFilter);
  const syncUrl = (f: string, m: string) => {
    const n = new URLSearchParams();
    if (f === "other") n.set("filter", "other");
    if (m) n.set("month", m);
    setSp(n, { replace: true });
  };
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const monthRef = useRef(initMonth);

  async function fetchPage(monthVal: string, replace: boolean) {
    if (loadingRef.current) return;
    if (!replace && !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const off = replace ? 0 : offsetRef.current;
      const page = await api.sessions({ limit: PAGE, offset: off, month: monthVal || undefined, filter: filterRef.current });
      offsetRef.current = off + page.length;
      hasMoreRef.current = page.length === PAGE;
      setHasMore(hasMoreRef.current);
      setItems((prev) => (replace ? page : [...prev, ...page]));
    } catch (e) {
      setError(String(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    api.sessionMonths(filterRef.current).then(setMonths).catch(() => {});
    api.getProfile().then((p) => { setName(p.display_name); setAvatar(p.avatar_url); }).catch(() => {});
    fetchPage(monthRef.current, true);
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchPage(monthRef.current, false);
      },
      { rootMargin: "300px" }
    );
    if (sentinelRef.current) obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, []);

  function changeMonth(v: string) {
    setMonth(v);
    monthRef.current = v;
    hasMoreRef.current = true;
    syncUrl(filterRef.current, v);
    fetchPage(v, true);
  }

  function changeFilter(f: "pump" | "other") {
    setFilter(f);
    filterRef.current = f;
    setMonth("");
    monthRef.current = "";
    hasMoreRef.current = true;
    syncUrl(f, "");
    api.sessionMonths(f).then(setMonths).catch(() => {});
    fetchPage("", true);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ListIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-xl font-bold">{t("sessions.title")}{name ? ` · ${name}` : ""}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => changeFilter("pump")}
            className={`rounded-lg px-2.5 py-1.5 text-xs ${filter === "pump" ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}
          >
            {t("sessions.filterPump")}
          </button>
          <button
            onClick={() => changeFilter("other")}
            className={`rounded-lg px-2.5 py-1.5 text-xs ${filter === "other" ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}
            title={t("sessions.filterOtherHint")}
          >
            {t("sessions.filterOther")}
          </button>
        </div>
        <select
          value={month}
          onChange={(e) => changeMonth(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100"
        >
          <option value="">{t("sessions.allMonths")}</option>
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {monthLabel(m.month)} ({m.count})
            </option>
          ))}
        </select>
      </div>

      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {items.length === 0 && !loading ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-slate-300">
          <WaveIcon className="h-10 w-10 text-slate-400" />
          <p>{month ? t("sessions.noneMonth") : t("sessions.none")}</p>
          {!month && <p className="text-sm">{t("sessions.uploadHint")}</p>}
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <SessionCard
              key={s.id}
              sessionId={s.id}
              startedAt={s.started_at}
              endedAt={s.ended_at}
              spot={s.place_name}
              sport={s.sport}
              caption={s.caption}
              avatarName={name}
              avatarUrl={avatar}
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

      {/* Infinite-Scroll-Sentinel + Lade-Indikator */}
      <div ref={sentinelRef} className="h-8" />
      {loading && <div className="py-4"><Spinner /></div>}
      {!hasMore && items.length > 0 && (
        <p className="py-4 text-center text-xs text-slate-400">{t("sessions.listEnd")}</p>
      )}
    </div>
  );
}

function SessionStats({ a }: { a: NonNullable<SessionSummary["analysis"]> }) {
  const t = useT();
  const m = a.metrics;
  const kmh = (v?: number | null) => (v != null ? (v * 3.6).toFixed(1) : null);
  const dur = (s?: number | null) =>
    s == null ? "–" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
      <span>🏄 <b className="text-brand-400">{((a.foiling_distance_m ?? 0) / 1000).toFixed(2)}</b> km</span>
      <span>⏱ {dur(a.foiling_time_s)}</span>
      {m?.num_segments != null && <span>🔁 {m.num_segments} {m.num_segments === 1 ? t("unit.run") : t("unit.runs")}</span>}
      {m?.avg_speed_mps != null && <span>Ø {kmh(m.avg_speed_mps)} km/h</span>}
      {a.pump_count != null && <span>↕ {a.pump_count}{m?.avg_pump_hz ? ` · ${m.avg_pump_hz.toFixed(2)} Hz` : ""}</span>}
      {m?.avg_hr != null && <span>❤ {m.avg_hr}{m?.max_hr ? `/${m.max_hr}` : ""}</span>}
      {m?.farthest_segment_m != null && m.farthest_segment_m > 0 && <span>{t("sessions.farAbbr")} {Math.round(m.farthest_segment_m)} m</span>}
      {m?.longest_segment_s != null && m.longest_segment_s > 0 && <span>{t("sessions.longAbbr")} {dur(m.longest_segment_s)}</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const map: Record<string, string> = {
    analyzed: "bg-emerald-500/15 text-emerald-400",
    complete: "bg-amber-500/15 text-amber-400",
    live: "bg-sky-500/15 text-sky-400",
    recording: "bg-slate-700/40 text-slate-200",
  };
  const labelKey: Record<string, string> = {
    analyzed: "status.analyzed",
    complete: "status.complete",
    live: "status.live",
    recording: "status.recording",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[status] ?? "bg-slate-700/40 text-slate-200"}`}>
      {labelKey[status] ? t(labelKey[status]) : status}
    </span>
  );
}
