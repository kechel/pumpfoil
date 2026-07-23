import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, CommunitySession, CommunityGroup, SessionSummary, type Transfer } from "../lib/api";
import { Card, Spinner, ErrorBox, Avatar } from "../components/ui";
import { AccelToggle } from "../components/AccelToggle";
import { useAccelDefault } from "../lib/useAccelDefault";
import { WaveIcon, SessionsIcon, RunsIcon, FoilIcon, TimerIcon, HeartPulseIcon, LocationIcon, ChatBubbleIcon, CompareIcon, SendIcon, ChevronIcon } from "../components/Icons";
import { useCompare } from "../lib/compare";
import { fmtTime } from "../lib/time";
import { fmtPumpRate } from "../lib/pumpRate";
import { SessionCard } from "../components/SessionCard";
import { TrackPreview } from "../components/TrackPreview";
import { SpotWeather } from "../components/SpotWeather";
import { getLastSession, setLastSessionsSearch } from "../lib/lastSession";
import { setCompare } from "../lib/compare";
import { openChatOverlay } from "../components/DmWidget";
import { useT } from "../i18n";

const PAGE = 20;

// Hinweis oben in „Meine Sessions": heutige, aufeinanderfolgende Sessions (<=1 h)
// koennten zusammengehoeren -> Vorschlag zum Zusammenfuehren (mit Bestaetigung).
type MergeSug = { ids: number[]; count: number; place: string | null; date: string; tz?: string | null; sessions: { id: number; start: string; end: string }[] };

function MergeHint() {
  const t = useT();
  const nav = useNavigate();
  const [sugs, setSugs] = useState<MergeSug[]>([]);
  useEffect(() => { api.mergeSuggestions().then(setSugs).catch(() => {}); }, []);
  if (!sugs.length) return null;
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
            {dateStr(s.date)} · {s.sessions.map((x) => `${fmtTime(x.start, s.tz)}–${fmtTime(x.end, s.tz)}`).join(" · ")}
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

// Eingehende Session-Übertragungen (jemand will mir seine Session geben, z. B. mit meiner
// Uhr gefahren). Ansehen / Annehmen (→ gehört mir) / Ablehnen. Nur in „Meine Sessions".
function IncomingTransfers({ onAccepted }: { onAccepted: () => void }) {
  const t = useT();
  const nav = useNavigate();
  const [rows, setRows] = useState<Transfer[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => { api.transfersIncoming().then(setRows).catch(() => {}); }, []);
  if (!rows.length) return null;
  const dateStr = (iso: string | null) => iso ? new Date(iso).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  function accept(tr: Transfer) {
    setBusy(tr.id);
    api.transferAccept(tr.id)
      .then(() => { setRows((l) => l.filter((x) => x.id !== tr.id)); invalidateSessionListCache(); onAccepted(); })
      .catch((e) => alert(String(e))).finally(() => setBusy(null));
  }
  function decline(tr: Transfer) {
    setBusy(tr.id);
    api.transferDecline(tr.id)
      .then(() => setRows((l) => l.filter((x) => x.id !== tr.id)))
      .catch((e) => alert(String(e))).finally(() => setBusy(null));
  }
  return (
    <div className="mb-4 space-y-2">
      {rows.map((tr) => (
        <div key={tr.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm">
          <SendIcon className="h-5 w-5 shrink-0 text-brand-400" />
          <span className="text-slate-200">
            <b>{t("transfer.incomingTitle")}</b> {t("transfer.from", { name: tr.other?.display_name || "?" })}
            {tr.session?.place ? ` · ${tr.session.place}` : ""}{tr.session?.started_at ? ` · ${dateStr(tr.session.started_at)}` : ""}
          </span>
          <div className="ml-auto flex gap-2">
            {tr.session && (
              <button onClick={() => nav(`/sessions/${tr.session!.id}`)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">{t("transfer.view")}</button>
            )}
            <button disabled={busy === tr.id} onClick={() => accept(tr)}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">{t("transfer.accept")}</button>
            <button disabled={busy === tr.id} onClick={() => decline(tr)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">{t("transfer.decline")}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Kleiner, wegklickbarer Hinweis: Session lange druecken -> markieren & vergleichen.
function CompareTip() {
  const t = useT();
  const [hidden, setHidden] = useState(() => localStorage.getItem("hideCompareTip") === "1");
  if (hidden) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
      <CompareIcon className="h-4 w-4 shrink-0 text-brand-400" />
      <span className="flex-1">{t("compare.tip")}</span>
      <button onClick={() => { localStorage.setItem("hideCompareTip", "1"); setHidden(true); }}
        className="shrink-0 rounded p-1 text-slate-500 hover:text-slate-300" aria-label="OK">✕</button>
    </div>
  );
}

// Zurück-Navigation: geladene Items + Scroll-Position je Filter/Monat merken, damit man aus
// der Detailansicht an dieselbe Stelle der Liste zurückkehrt statt oben zu landen (Feedback
// Philipp). Nur im Speicher -> überlebt Client-Navigation, bei echtem Reload frisch.
const listCache = new Map<string, { items: SessionSummary[]; offset: number; hasMore: boolean; scrollY: number }>();
const communityCache = new Map<string, { items: CommunityGroup[]; offset: number; more: boolean }>();

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
// Scroll-to-top-FAB: erscheint nach längerem Scrollen rechts unten NEBEN dem Chat-FAB (right-4);
// ist der Vergleichs-Button (compare-bar, right-20) sichtbar, rückt er links davor.
function ScrollTopFab() {
  const cmp = useCompare();
  const [show, setShow] = useState(false);
  const [right, setRight] = useState(80);
  useEffect(() => {
    const h = () => setShow(window.scrollY > 1000);
    window.addEventListener("scroll", h, { passive: true });
    h();
    return () => window.removeEventListener("scroll", h);
  }, []);
  useEffect(() => {
    if (!show) return;
    const el = document.getElementById("compare-bar");
    setRight(el ? 96 + el.offsetWidth : 80);   // 80 = right-20; +Breite+16 wenn Vergleich sichtbar
  }, [show, cmp.length]);
  if (!show) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      style={{ right }}
      className="fixed bottom-20 z-[1100] flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-slate-200 shadow-lg backdrop-blur transition-colors hover:bg-slate-800 md:bottom-4"
    >
      <ChevronIcon className="h-5 w-5 -rotate-90" />
    </button>
  );
}

export default function Sessions() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const scope = sp.get("scope") === "all" ? "all" : "mine";
  const spot = sp.get("spot") || "";   // spot_id (String) — Name wird für Anzeige/Chat aufgelöst
  const [homespot, setHomespot] = useState("");
  const [homespotId, setHomespotId] = useState<number | null>(null);
  const [spots, setSpots] = useState<{ id: number; name: string }[]>([]);
  const nameById = useMemo(() => Object.fromEntries(spots.map((s) => [String(s.id), s.name])), [spots]);
  const spotName = spot ? (nameById[spot] ?? spot) : "";
  const hsRef = homespotId != null ? String(homespotId) : homespot;   // Homespot als id, Fallback Name
  const [myName, setMyName] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);   // bump nach angenommener Übertragung → Liste neu laden
  // accel|alle-Umschalter für beide Tabs; smarter Default (accel wenn Accel-Daten vorhanden).
  const [accelOnly, setAccelOnly] = useAccelDefault();

  useEffect(() => {
    api.getSettings().then((s) => { setHomespot((s.homespot as string) ?? ""); setHomespotId((s.homespot_id as number | null) ?? null); }).catch(() => {});
    api.spotMap(false).then((m) => setSpots(   // alle Spots (auch GPS) als {id,name}
      m.filter((x) => x.spot_id != null).map((x) => ({ id: x.spot_id as number, name: x.spot }))
       .sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
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
      ? `${t("sessions.title")} · ${spotName}`
      : `${t("sessions.title")} · ${t("nav.allSessions.short")}`;

  const tabCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-brand-500 text-slate-950" : "text-slate-200 hover:bg-slate-800"}`;

  return (
    <div>
      <ScrollTopFab />
      {/* Überschrift ganz oben (wie auf allen Seiten) */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SessionsIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>

      {/* Scope-Umschalter + Spotsuche */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
          <button className={tabCls(isMine)} onClick={() => setScope("mine")}>{t("nav.mySessions.short")}</button>
          {homespot && (
            <button className={`inline-flex items-center gap-1 ${tabCls(spot === hsRef)}`} onClick={() => setScope("all", hsRef)}><LocationIcon className="h-4 w-4" /> {homespot}</button>
          )}
          <button className={tabCls(scope === "all" && !spot)} onClick={() => setScope("all")}>{t("nav.allSessions.short")}</button>
        </div>
        <select
          value={spot}
          onChange={(e) => setScope("all", e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100"
        >
          <option value="">{t("all.allSpots")}</option>
          {spots.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
        </select>
        {spot && <SpotChatToggle spot={spotName} t={t} />}
        <AccelToggle value={accelOnly} onChange={setAccelOnly} className="ml-auto" />
      </div>

      {isMine && <IncomingTransfers onAccepted={() => setReloadKey((k) => k + 1)} />}
      {isMine && <MergeHint />}
      <CompareTip />

      {spot && <SpotWeather spot={spot} />}
      {isMine ? <MySessionsList key={reloadKey} myName={myName} accelOnly={accelOnly} /> : <CommunityList name="" spot={spot} accelOnly={accelOnly} />}
    </div>
  );
}

// Button neben den Scope-Umschaltern: direkt in den Fullscreen-Spot-Chat
// öffnet das Chat-Overlay direkt im Spot-Chat, beschriftet mit Spotnamen.
function SpotChatToggle({ spot, t }: { spot: string; t: (k: string) => string }) {
  return (
    <button
      onClick={() => openChatOverlay(`spot:${spot}`, spot)}
      className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
    >
      <ChatBubbleIcon className="h-4 w-4 text-brand-400" /> {t("chat.spotChat")} {spot}
    </button>
  );
}

// --- Eigene Sessions (mit Monats-/Sportart-Filter) --------------------------

// Eigene Session im Zwischenzustand: GPS ist schon da (status "live"), Accel lädt noch hoch.
// Liste/Detail pollen und ersetzen sie automatisch durch die fertige Version.
const isInterim = (s: SessionSummary) => (s.owned ?? true) && s.status === "live";

export function ProcessingNote() {
  const t = useT();
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-brand-500/10 px-2.5 py-1.5 text-xs text-slate-700 dark:text-brand-200">
      <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand-400/40 border-t-brand-400" />
      {t("session.loadingAccel")}
    </div>
  );
}

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

  // Auto-Refresh, solange eine eigene Session noch im Upload/Analyse-Zwischenzustand ist:
  // erste Seite still nachladen und die betroffenen Karten in-place durch die fertige Version
  // ersetzen (Läufe/Längen/Pumps „snappen" nach). Läuft nur, wenn wirklich eine „live" ist.
  useEffect(() => {
    if (!items.some(isInterim)) return;
    const iv = setInterval(() => {
      api.sessions({ limit: PAGE, offset: 0, month: monthRef.current || undefined, filter: filterRef.current, accelOnly: accelRef.current })
        .then((fresh) => setItems((prev) => prev.map((p) => fresh.find((f) => f.id === p.id) ?? p)))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(iv);
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
        {/* Alle Aussortierten löschen — Server erzwingt owner+other; hier nur Komfort + Confirm. */}
        {filter === "other" && items.length > 0 && (
          <button
            onClick={() => {
              if (!confirm(t("sessions.deleteAllOtherConfirm", { n: items.length }))) return;
              api.deleteAllOtherSessions()
                .then((r) => { invalidateSessionListCache(); setItems([]); alert(t("sessions.deleteAllOtherDone", { n: r.deleted })); })
                .catch((e) => alert(String(e)));
            }}
            className="ml-auto rounded-lg border border-red-500/50 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
          >
            {t("sessions.deleteAllOther")}
          </button>
        )}
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
              tz={s.tz}
              endedAt={s.ended_at}
              spot={s.place_name}
              foil={s.foil ? `${s.foil.brand} ${s.foil.model} ${s.foil.size}` : null}
              deviceLabel={s.device_label}
              caption={s.caption}
              avatarName={myName}
              avatarUrl={avatar}
              thumbUrl={s.thumb_url}
              photoCount={s.photo_count}
              youtubeUrl={s.youtube_url}
              videoUrl={s.video_url}
              likeCount0={s.like_count ?? 0}
              liked0={!!s.liked}
              trackPreview={s.track_preview}
              highlight={s.id === lastViewed}
              stats={
                <>
                  {s.analysis && <SessionStats a={s.analysis} />}
                  {isInterim(s) && <ProcessingNote />}
                </>
              }
              statusBadge={(s.transfer_to || s.status !== "analyzed") ? (
                <div className="flex items-center gap-1.5">
                  {s.transfer_to && (
                    <span title={t("transfer.pending", { name: s.transfer_to })}
                      className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:text-amber-300">
                      {t("transfer.badge")}
                    </span>
                  )}
                  {s.status !== "analyzed" && <StatusBadge status={s.status} />}
                </div>
              ) : undefined}
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

// Eine Community-Session als Listenkarte (identisch für Einzel-Session und aufgeklappte
// Gruppen-Mitglieder). `nested` = leicht eingerückt/gedämpft innerhalb einer Gruppe.
function renderCommunitySession(s: CommunitySession, t: (k: string) => string, lastViewed: number | null) {
  return (
    <SessionCard
      key={s.session_id}
      sessionId={s.session_id}
      startedAt={s.started_at}
      tz={s.tz}
      endedAt={s.ended_at}
      spot={s.spot}
      foil={s.foil ? `${s.foil.brand} ${s.foil.model} ${s.foil.size}` : null}
      deviceLabel={s.device_label}
      caption={s.caption}
      name={s.name}
      avatarName={s.name}
      avatarUrl={s.avatar_url}
      thumbUrl={s.thumb_url}
      photoCount={s.photo_count}
      youtubeUrl={s.youtube_url}
      videoUrl={s.video_url}
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
  );
}

function durHM(s: number) {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h` : `${m} min`;
}

// Tages-Gruppe (≥2 Sessions eines Nutzers am selben Tag/Spot): eingeklappte Kopf-Kachel mit
// Tages-Summen + Zähler + Chevron; aufgeklappt die Einzel-Sessions (jede mit Detail-Link).
function DayGroupCard({ g, t, lastViewed }: { g: CommunityGroup; t: (k: string) => string; lastViewed: number | null }) {
  const [open, setOpen] = useState(false);
  const dateStr = g.date ? new Date(g.date + "T00:00:00").toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const kmh = g.max_speed_mps != null ? (g.max_speed_mps * 3.6).toFixed(1) : null;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-slate-800/40"
        aria-expanded={open}
      >
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <Avatar name={g.name} url={g.avatar_url} size={44} />
          {/* Mobil: Minimap(s) unter dem Avatar (wie Einzel-Kachel), gestapelt. */}
          {(g.track_previews?.length ?? 0) > 0 && (
            <div className="flex flex-col items-center gap-1.5 sm:hidden">
              {g.track_previews!.map((tp, i) => (
                <TrackPreview key={i} data={tp} className="h-12 w-16 text-brand-400" />
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {dateStr}
            {g.name && <span className="text-brand-300"> · {g.name}</span>}
          </div>
          {g.spot && (
            <div className="text-sm text-slate-300">
              <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300"><LocationIcon className="h-3.5 w-3.5" /> {g.spot}</span>
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
            <span className="inline-flex items-center gap-1"><SessionsIcon className="h-4 w-4 text-brand-400" /> <b className="text-brand-400">{g.count}</b> {t("unit.sessions")}</span>
            <span className="inline-flex items-center gap-1"><FoilIcon className="h-4 w-4 text-brand-400" /> <b className="text-brand-400">{g.foiling_km.toFixed(1)}</b> km</span>
            {g.foiling_time_s > 0 && <span className="inline-flex items-center gap-1"><TimerIcon className="h-4 w-4 text-slate-400" /> {durHM(g.foiling_time_s)}</span>}
            {g.pump_count > 0 && <span className="inline-flex items-center gap-1"><WaveIcon className="h-4 w-4 text-slate-400" /> {g.pump_count}</span>}
            {kmh && <span className="text-slate-400">max {kmh} km/h</span>}
          </div>
        </div>
        {/* Desktop: Minimap(s) rechts (wie Einzel-Kachel), mehrere nebeneinander. */}
        {(g.track_previews?.length ?? 0) > 0 && (
          <div className="hidden shrink-0 items-center gap-2 self-center sm:flex">
            {g.track_previews!.map((tp, i) => (
              <TrackPreview key={i} data={tp} className="h-12 w-16 text-brand-400" />
            ))}
          </div>
        )}
        <ChevronIcon className={`h-5 w-5 shrink-0 self-center text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-800 px-2 py-3 sm:px-3">
          {g.sessions.map((s) => renderCommunitySession(s, t, lastViewed))}
        </div>
      )}
    </div>
  );
}

function CommunityList({ name, spot, accelOnly }: { name: string; spot: string; accelOnly: boolean }) {
  const t = useT();
  const [items, setItems] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(0);
  const moreRef = useRef(true);
  const loadingRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const restoreRef = useRef(false);
  const itemsRef = useRef<CommunityGroup[]>([]);
  const lastViewed = getLastSession();

  const load = (reset: boolean) => {
    if (loadingRef.current || (!reset && !moreRef.current)) return;
    loadingRef.current = true; setLoading(true);
    const off = reset ? 0 : offsetRef.current;
    api.communitySessionsGrouped(PAGE, off, { name: name || undefined, spot: spot || undefined, accelOnly })
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
          {items.map((g) => (
            g.count <= 1
              ? renderCommunitySession(g.sessions[0], t, lastViewed)
              : <DayGroupCard key={`g-${g.user_id}-${g.date}`} g={g} t={t} lastViewed={lastViewed} />
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
      {a.pump_count != null && <span>↕ {a.pump_count}{m?.avg_pump_hz ? ` · ${fmtPumpRate(m.avg_pump_hz)}` : ""}</span>}
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
