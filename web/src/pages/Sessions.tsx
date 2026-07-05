import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { api, CommunitySession, SessionSummary } from "../lib/api";
import { Card, Spinner, ErrorBox } from "../components/ui";
import { AccelToggle } from "../components/AccelToggle";
import { useAccelDefault } from "../lib/useAccelDefault";
import { WaveIcon, ListIcon, RunsIcon, FoilIcon, TimerIcon, HeartPulseIcon, LocationIcon, ChatBubbleIcon } from "../components/Icons";
import { SessionCard } from "../components/SessionCard";
import { SpotWeather } from "../components/SpotWeather";
import { getLastSession, setLastSessionsSearch } from "../lib/lastSession";
import { setCompare } from "../lib/compare";
import { useT } from "../i18n";

const PAGE = 20;

// Hinweis oben in „Meine Sessions": heutige, aufeinanderfolgende Sessions (<=1 h)
// koennten zusammengehoeren -> Vorschlag zum Zusammenfuehren (mit Bestaetigung).
type MergeSug = { ids: number[]; count: number; place: string | null; date: string; sessions: { id: number; start: string; end: string }[] };

function MergeHint() {
  const t = useT();
  const nav = useNavigate();
  const [sugs, setSugs] = useState<MergeSug[]>([]);
  useEffect(() => { api.mergeSuggestions().then(setSugs).catch(() => {}); }, []);
  if (!sugs.length) return null;
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = (d: string) => new Date(d + "T00:00:00").toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
  // Klick -> genau diese Sessions in den Vergleichskorb (bestehende Auswahl ersetzen) und
  // die Vergleichen-&-Mergen-Ansicht oeffnen (dort Vorschau + Zusammenfuehren).
  function review(s: MergeSug) {
    setCompare(s.sessions.map((x) => ({ sessionId: x.id, runIdx: null, owned: true, date: s.date })));
    nav("/vergleich");
  }
  return (
    <div className="mb-4 space-y-2">
      {sugs.map((s) => (
        <div key={s.ids.join("-")} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm">
          <span className="text-slate-200">
            {t("merge.hint", { n: s.count })}{s.place ? ` · ${s.place}` : ""}
          </span>
          <span className="w-full text-xs text-slate-400 sm:w-auto">
            {dateStr(s.date)} · {s.sessions.map((x) => `${hhmm(x.start)}–${hhmm(x.end)}`).join(" · ")}
          </span>
          <button onClick={() => review(s)}
            className="ml-auto rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
            {t("merge.action")}
          </button>
        </div>
      ))}
    </div>
  );
}

// Zurück-Navigation: geladene Items + Scroll-Position je Filter/Monat merken, damit man aus
// der Detailansicht an dieselbe Stelle der Liste zurückkehrt statt oben zu landen (Feedback
// Philipp). Nur im Speicher -> überlebt Client-Navigation, bei echtem Reload frisch.
const listCache = new Map<string, { items: SessionSummary[]; offset: number; hasMore: boolean; scrollY: number }>();
const communityCache = new Map<string, { items: CommunitySession[]; offset: number; more: boolean }>();

// Nach dem Löschen einer Session muss der Listen-Cache raus, sonst zeigt die
// zurückkehrende Liste die gelöschte Session noch (Feedback Jan).
// Erzwingt beim naechsten Mount einen Refetch (statt Cache) — noetig z.B. nach Merge/
// Loeschen, weil die noch gemountete Liste beim Wegnavigieren sonst ihre veralteten
// Items zurueck in den Cache schreibt.
let listDirty = false;
export function invalidateSessionListCache() {
  listDirty = true;
  listCache.clear();
  communityCache.clear();
}

function monthLabel(m: string) {
  return new Date(m + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// Vereinheitlichte Sessions-Seite: Umschalter Meine / <Homespot> / Alle + Spotsuche.
// scope=mine -> eigene Sessions; sonst Community-Sessions (optional je Spot gefiltert).
export default function Sessions() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const scope = sp.get("scope") === "all" ? "all" : "mine";
  const spot = sp.get("spot") || "";
  const [homespot, setHomespot] = useState("");
  const [spots, setSpots] = useState<string[]>([]);
  const [myName, setMyName] = useState<string | null>(null);
  // accel|alle-Umschalter für beide Tabs; smarter Default (accel wenn Accel-Daten vorhanden).
  const [accelOnly, setAccelOnly] = useAccelDefault();

  useEffect(() => {
    api.getSettings().then((s) => setHomespot((s.homespot as string) ?? "")).catch(() => {});
    api.communitySpots(false).then((s) => setSpots(s.all)).catch(() => {});  // alle Spots (auch GPS)
    api.getProfile().then((p) => setMyName(p.display_name)).catch(() => {});
  }, []);

  // Aktuelle Listen-Query merken (scope/spot/filter/month), damit der Zurück-Link im Detail
  // wieder in denselben Scope/Filter zurückführt.
  useEffect(() => { setLastSessionsSearch(`?${sp.toString()}`); }, [sp]);

  const isMine = scope === "mine" && !spot;
  const setScope = (next: "mine" | "all", nextSpot = "") => {
    const n = new URLSearchParams();
    if (next === "all") n.set("scope", "all");
    if (nextSpot) n.set("spot", nextSpot);
    setSp(n);
  };

  const title = isMine
    ? `${t("sessions.title")}${myName ? ` · ${myName}` : ""}`
    : spot
      ? `${t("sessions.title")} · ${spot}`
      : `${t("sessions.title")} · ${t("nav.allSessions.short")}`;

  const tabCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-brand-500 text-slate-950" : "text-slate-200 hover:bg-slate-800"}`;

  return (
    <div>
      {/* Überschrift ganz oben (wie auf allen Seiten) */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {isMine ? <ListIcon className="h-7 w-7 text-brand-400" /> : <WaveIcon className="h-7 w-7 text-brand-400" />}
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>

      {/* Scope-Umschalter + Spotsuche */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
          <button className={tabCls(isMine)} onClick={() => setScope("mine")}>{t("nav.mySessions.short")}</button>
          {homespot && (
            <button className={`inline-flex items-center gap-1 ${tabCls(spot === homespot)}`} onClick={() => setScope("all", homespot)}><LocationIcon className="h-4 w-4" /> {homespot}</button>
          )}
          <button className={tabCls(scope === "all" && !spot)} onClick={() => setScope("all")}>{t("nav.allSessions.short")}</button>
        </div>
        <select
          value={spot}
          onChange={(e) => setScope("all", e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100"
        >
          <option value="">{t("all.allSpots")}</option>
          {spots.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {spot && <SpotChatToggle spot={spot} t={t} />}
        <AccelToggle value={accelOnly} onChange={setAccelOnly} className="ml-auto" />
      </div>

      {isMine && <MergeHint />}

      {spot && <SpotWeather spot={spot} />}
      {isMine ? <MySessionsList myName={myName} accelOnly={accelOnly} /> : <CommunityList name="" spot={spot} accelOnly={accelOnly} />}
    </div>
  );
}

// Button neben den Scope-Umschaltern: direkt in den Fullscreen-Spot-Chat
// (/chat?scope=spot:<name>), beschriftet mit Spotnamen.
function SpotChatToggle({ spot, t }: { spot: string; t: (k: string) => string }) {
  return (
    <Link
      to={`/chat?scope=${encodeURIComponent(`spot:${spot}`)}`}
      className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
    >
      <ChatBubbleIcon className="h-4 w-4 text-brand-400" /> {t("chat.spotChat")} {spot}
    </Link>
  );
}

// --- Eigene Sessions (mit Monats-/Sportart-Filter) --------------------------

function MySessionsList({ myName, accelOnly }: { myName: string | null; accelOnly: boolean }) {
  const t = useT();
  const accelRef = useRef(accelOnly); accelRef.current = accelOnly;
  const firstAccel = useRef(true);
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [months, setMonths] = useState<{ month: string; count: number }[]>([]);
  const initFilter: "pump" | "other" = sp.get("filter") === "other" ? "other" : "pump";
  const [month, setMonth] = useState(sp.get("month") || "");
  const [filter, setFilter] = useState<"pump" | "other">(initFilter);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterRef = useRef(initFilter);
  const monthRef = useRef(month);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const cacheKey = () => `${filterRef.current}|${monthRef.current}|${accelRef.current}`;
  const restoreRef = useRef(false);                 // nach Cache-Restore die markierte Karte einscrollen
  const itemsRef = useRef<SessionSummary[]>([]);    // stets aktuelle Items (für Cache beim Unmount)

  const syncUrl = (f: string, m: string) => {
    const n = new URLSearchParams(sp);
    f === "other" ? n.set("filter", "other") : n.delete("filter");
    m ? n.set("month", m) : n.delete("month");
    setSp(n, { replace: true });
  };

  async function fetchPage(monthVal: string, replace: boolean) {
    if (loadingRef.current) return;
    if (!replace && !hasMoreRef.current) return;
    loadingRef.current = true; setLoading(true); setError(null);
    try {
      const off = replace ? 0 : offsetRef.current;
      const page = await api.sessions({ limit: PAGE, offset: off, month: monthVal || undefined, filter: filterRef.current, accelOnly: accelRef.current });
      offsetRef.current = off + page.length;
      hasMoreRef.current = page.length === PAGE;
      setHasMore(hasMoreRef.current);
      setItems((prev) => (replace ? page : [...prev, ...page]));
    } catch (e) {
      setError(String(e));
    } finally {
      loadingRef.current = false; setLoading(false);
    }
  }

  // Stale-while-revalidate: nach dem Cache-Restore die erste Seite frisch holen und
  // seither hochgeladene Sessions oben einfügen. So bleibt Scroll/Position beim Zurück
  // aus dem Detail erhalten, aber neue Sessions erscheinen sofort (Cache „greift" online nicht dauerhaft).
  async function revalidateHead(monthVal: string) {
    try {
      const fresh = await api.sessions({ limit: PAGE, offset: 0, month: monthVal || undefined, filter: filterRef.current, accelOnly: accelRef.current });
      const known = new Set(itemsRef.current.map((s) => s.id));
      const added = fresh.filter((s) => !known.has(s.id));
      if (!added.length) return;
      // Nach Datum einsortieren (neueste zuerst) — nicht blind vorne anhaengen:
      // eine zusammengefuehrte Session hat ein aelteres Datum, gehoert nicht an den Kopf.
      const merged = [...added, ...itemsRef.current].sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
      itemsRef.current = merged;
      offsetRef.current += added.length;   // vorne eingefügte Einträge -> Folge-Offset anheben
      setItems(merged);
      listCache.set(cacheKey(), { items: merged, offset: offsetRef.current, hasMore: hasMoreRef.current, scrollY: window.scrollY });
    } catch (e) { /* offline/Fehler: Cache bleibt einfach stehen */ }
  }

  useEffect(() => {
    api.sessionMonths(filterRef.current).then(setMonths).catch(() => {});
    api.getProfile().then((p) => setAvatar(p.avatar_url)).catch(() => {});
    const cached = listCache.get(cacheKey());
    if (!listDirty && cached && cached.items.length) {
      setItems(cached.items);
      offsetRef.current = cached.offset;
      hasMoreRef.current = cached.hasMore;
      setHasMore(cached.hasMore);
      restoreRef.current = true;  // nach dem Rendern die markierte Karte einscrollen
      itemsRef.current = cached.items;
      revalidateHead(monthRef.current);   // im Hintergrund neue Sessions nachziehen
    } else {
      listDirty = false;
      fetchPage(monthRef.current, true);
    }
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) fetchPage(monthRef.current, false); }, { rootMargin: "300px" });
    if (sentinelRef.current) obs.observe(sentinelRef.current);
    return () => {
      obs.disconnect();
      // Aktuellen Listen-Zustand + Scroll-Position sichern (für die Rückkehr aus dem Detail).
      listCache.set(cacheKey(), { items: itemsRef.current, offset: offsetRef.current, hasMore: hasMoreRef.current, scrollY: window.scrollY });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // accel|alle umgeschaltet -> Liste zurücksetzen und neu laden (Erst-Mount überspringen).
  useEffect(() => {
    if (firstAccel.current) { firstAccel.current = false; return; }
    hasMoreRef.current = true; offsetRef.current = 0;
    const cached = listCache.get(cacheKey());
    if (cached && cached.items.length) {
      setItems(cached.items); offsetRef.current = cached.offset; hasMoreRef.current = cached.hasMore; setHasMore(cached.hasMore);
      itemsRef.current = cached.items;
      revalidateHead(monthRef.current);
    } else {
      setItems([]); fetchPage(monthRef.current, true);
    }
  }, [accelOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Items immer im Ref spiegeln + nach dem Restore die markierte Karte in den Blick scrollen
  // (robuster als eine Pixel-Position: unabhängig vom Scroll-Container). Doppeltes rAF, damit
  // das Layout nach dem Render steht.
  useEffect(() => {
    itemsRef.current = items;
    if (restoreRef.current && items.length) {
      restoreRef.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById("session-highlight")?.scrollIntoView({ block: "center" });
      }));
    }
  }, [items]);

  function changeMonth(v: string) {
    setMonth(v); monthRef.current = v; hasMoreRef.current = true; offsetRef.current = 0;
    listCache.delete(cacheKey());
    syncUrl(filterRef.current, v); fetchPage(v, true);
  }
  function changeFilter(f: "pump" | "other") {
    setFilter(f); filterRef.current = f; setMonth(""); monthRef.current = ""; hasMoreRef.current = true; offsetRef.current = 0;
    listCache.delete(cacheKey());
    syncUrl(f, ""); api.sessionMonths(f).then(setMonths).catch(() => {}); fetchPage("", true);
  }

  const lastViewed = getLastSession();

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <button onClick={() => changeFilter("pump")} className={`rounded-lg px-2.5 py-1.5 text-xs ${filter === "pump" ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}>{t("sessions.filterPump")}</button>
          <button onClick={() => changeFilter("other")} className={`rounded-lg px-2.5 py-1.5 text-xs ${filter === "other" ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`} title={t("sessions.filterOtherHint")}>{t("sessions.filterOther")}</button>
        </div>
        <select value={month} onChange={(e) => changeMonth(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100">
          <option value="">{t("sessions.allMonths")}</option>
          {months.map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)} ({m.count})</option>)}
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
              owned={s.owned ?? true}
              startedAt={s.started_at}
              endedAt={s.ended_at}
              spot={s.place_name}
              foil={s.foil ? `${s.foil.brand} ${s.foil.model} ${s.foil.size}` : null}
              caption={s.caption}
              avatarName={myName}
              avatarUrl={avatar}
              thumbUrl={s.thumb_url}
              photoCount={s.photo_count}
              likeCount0={s.like_count ?? 0}
              liked0={!!s.liked}
              trackPreview={s.track_preview}
              highlight={s.id === lastViewed}
              stats={s.analysis && <SessionStats a={s.analysis} />}
              statusBadge={s.status !== "analyzed" ? <StatusBadge status={s.status} /> : undefined}
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-8" />
      {loading && <div className="py-4"><Spinner /></div>}
      {!hasMore && items.length > 0 && <p className="py-4 text-center text-xs text-slate-400">{t("sessions.listEnd")}</p>}
    </div>
  );
}

// --- Community-Sessions (alle / je Spot) ------------------------------------

function CommunityList({ name, spot, accelOnly }: { name: string; spot: string; accelOnly: boolean }) {
  const t = useT();
  const [items, setItems] = useState<CommunitySession[]>([]);
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(0);
  const moreRef = useRef(true);
  const loadingRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const restoreRef = useRef(false);
  const itemsRef = useRef<CommunitySession[]>([]);
  const lastViewed = getLastSession();

  const load = (reset: boolean) => {
    if (loadingRef.current || (!reset && !moreRef.current)) return;
    loadingRef.current = true; setLoading(true);
    const off = reset ? 0 : offsetRef.current;
    api.communitySessions(PAGE, off, { name: name || undefined, spot: spot || undefined, accelOnly })
      .then((rows) => {
        offsetRef.current = off + rows.length;
        moreRef.current = rows.length === PAGE;
        setItems((prev) => (reset ? rows : [...prev, ...rows]));
      })
      .catch(() => {})
      .finally(() => { loadingRef.current = false; setLoading(false); });
  };

  useEffect(() => {
    const cached = communityCache.get(`${name}|${spot}|${accelOnly}`);
    if (cached && cached.items.length) {
      setItems(cached.items); offsetRef.current = cached.offset; moreRef.current = cached.more;
      restoreRef.current = true;  // nach dem Render die markierte Karte einscrollen
    } else {
      moreRef.current = true; offsetRef.current = 0; load(true);
    }
    return () => { communityCache.set(`${name}|${spot}|${accelOnly}`, { items: itemsRef.current, offset: offsetRef.current, more: moreRef.current }); };
  }, [name, spot, accelOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const o = new IntersectionObserver((e) => { if (e[0].isIntersecting) load(false); }, { rootMargin: "400px" });
    if (sentinel.current) o.observe(sentinel.current);
    return () => o.disconnect();
  }, [name, spot, accelOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    itemsRef.current = items;
    if (restoreRef.current && items.length) {
      restoreRef.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById("session-highlight")?.scrollIntoView({ block: "center" });
      }));
    }
  }, [items]);

  return (
    <div>
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
              foil={s.foil ? `${s.foil.brand} ${s.foil.model} ${s.foil.size}` : null}
              caption={s.caption}
              name={s.name}
              avatarName={s.name}
              avatarUrl={s.avatar_url}
              thumbUrl={s.thumb_url}
              photoCount={s.photo_count}
              likeCount0={s.like_count ?? 0}
              liked0={!!s.liked}
              trackPreview={s.track_preview}
              highlight={s.session_id === lastViewed}
              stats={
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-1"><RunsIcon className="h-4 w-4 text-slate-400" /> {s.runs} {s.runs === 1 ? t("unit.run") : t("unit.runs")}</span>
                  <span className="inline-flex items-center gap-1"><FoilIcon className="h-4 w-4 text-brand-400" /> <b className="text-brand-400">{s.foiling_km.toFixed(1)}</b> km</span>
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

export function SessionStats({ a }: { a: NonNullable<SessionSummary["analysis"]> }) {
  const t = useT();
  const m = a.metrics;
  const kmh = (v?: number | null) => (v != null ? (v * 3.6).toFixed(1) : null);
  const dur = (s?: number | null) => (s == null ? "–" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
      <span className="inline-flex items-center gap-1"><FoilIcon className="h-4 w-4 text-brand-400" /> <b className="text-brand-400">{((a.foiling_distance_m ?? 0) / 1000).toFixed(2)}</b> km</span>
      <span className="inline-flex items-center gap-1"><TimerIcon className="h-4 w-4 text-slate-400" /> {dur(a.foiling_time_s)}</span>
      {m?.num_segments != null && <span className="inline-flex items-center gap-1"><RunsIcon className="h-4 w-4 text-slate-400" /> {m.num_segments} {m.num_segments === 1 ? t("unit.run") : t("unit.runs")}</span>}
      {m?.avg_speed_mps != null && <span>Ø {kmh(m.avg_speed_mps)} km/h</span>}
      {a.pump_count != null && <span>↕ {a.pump_count}{m?.avg_pump_hz ? ` · ${m.avg_pump_hz.toFixed(2)} Hz` : ""}</span>}
      {m?.avg_hr != null && <span className="inline-flex items-center gap-1"><HeartPulseIcon className="h-4 w-4 text-slate-400" /> {m.avg_hr}{m?.max_hr ? `/${m.max_hr}` : ""}</span>}
      {m?.farthest_segment_m != null && m.farthest_segment_m > 0 && <span>{t("sessions.farAbbr")} {Math.round(m.farthest_segment_m)} m</span>}
      {m?.longest_segment_s != null && m.longest_segment_s > 0 && <span>{t("sessions.longAbbr")} {dur(m.longest_segment_s)}</span>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const map: Record<string, string> = {
    analyzed: "bg-emerald-500/15 text-emerald-400",
    complete: "bg-amber-500/15 text-amber-400",
    live: "bg-sky-500/15 text-sky-400",
    recording: "bg-slate-700/40 text-slate-200",
  };
  const labelKey: Record<string, string> = {
    analyzed: "status.analyzed", complete: "status.complete", live: "status.live", recording: "status.recording",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[status] ?? "bg-slate-700/40 text-slate-200"}`}>
      {labelKey[status] ? t(labelKey[status]) : status}
    </span>
  );
}
