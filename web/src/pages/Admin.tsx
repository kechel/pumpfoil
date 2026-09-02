import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, AdminSession, AdminUser, AdminPhoto, AdminOverview, AdminAuditEntry, AdminFeedback, OverallStats, ChatMsg, UserFilter, UserSort, AdminUserActivity, StatKey, NewsBanner, AdminBlock, AdminStatsSeries, AdminPending, AdminUserSport, AdminSocialChannel, AdminSocialItem } from "../lib/api";
import { Card, Spinner, ErrorBox, Avatar, NewBadge } from "../components/ui";
import { FlagIcon, FakeIcon, HeartIcon, CameraIcon, LocationIcon } from "../components/Icons";
import { TimeChart } from "../components/TimeChart";
import { useT, useNumberFormat, LANGS } from "../i18n";
import { DATA_QUALITY, SPORTS } from "../lib/sportClass";
import { demoGewuenscht, demoSetzen, demoAnzahl, demoBeobachten } from "../lib/demoNames";

type Tab = "overview" | "classify" | "flagged" | "fake" | "suspect" | "sessions" | "deleted" | "users" | "photos" | "chat" | "spots" | "audit" | "feedback" | "news" | "blocks" | "social";
const TABS: [Tab, string][] = [
  ["overview", "adm.tab.overview"],
  ["classify", "adm.tab.classify"],
  ["flagged", "adm.tab.flagged"],
  ["fake", "adm.tab.fake"],
  ["suspect", "adm.tab.suspect"],
  ["users", "adm.tab.users"],
  ["photos", "adm.tab.photos"],
  ["chat", "adm.tab.chat"],
  ["spots", "adm.tab.spots"],
  ["sessions", "adm.tab.sessions"],
  ["deleted", "adm.tab.deleted"],
  ["feedback", "adm.tab.feedback"],
  ["news", "adm.tab.news"],
  ["social", "adm.tab.social"],
  ["blocks", "adm.tab.blocks"],
  ["audit", "adm.tab.audit"],
];

export default function Admin() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.find(([k]) => k === sp.get("tab"))?.[0] ?? "overview") as Tab;
  const setTab = (tb: Tab) => setSp(new URLSearchParams({ tab: tb }));  // frischer Tab (Suche/Filter weg)
  // Offene Moderationszahlen für Tab-Badges (leichtes /admin/pending).
  const [pending, setPending] = useState<AdminPending | null>(null);
  useEffect(() => { api.adminPending().then(setPending).catch(() => {}); }, []);
  const badge: Partial<Record<Tab, number>> = {
    flagged: pending?.flagged ?? 0, fake: pending?.fake ?? 0,
    suspect: pending?.suspect ?? 0, chat: pending?.chat ?? 0,
  };
  return (
    <div>
      <nav className="mb-5 flex flex-wrap gap-0.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        {TABS.map(([k, labelKey]) => {
          const n = badge[k] ?? 0;
          const active = tab === k;
          return (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${active ? "bg-brand-500 font-semibold text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"}`}
          >
            {t(labelKey)}
            {n > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${active ? "bg-slate-950/25 text-slate-950" : "bg-amber-500 text-slate-950"}`}>{n}</span>
            )}
          </button>
          );
        })}
      </nav>
      <DemoModusZeile />
      {tab === "overview" && <OverviewTab />}
      {tab === "classify" && <><ClassifyTab /><FlagsTab /><UserSportTab /></>}
      {tab === "flagged" && <SessionsTab scope="flagged" />}
      {tab === "fake" && <SessionsTab scope="fake" />}
      {tab === "suspect" && <SessionsTab scope="suspect" />}
      {tab === "sessions" && <SessionsTab scope="all" />}
      {tab === "deleted" && <SessionsTab scope="deleted" />}
      {tab === "users" && <UsersTab />}
      {tab === "photos" && <PhotosTab />}
      {tab === "chat" && <ChatModTab />}
      {tab === "spots" && <SpotsTab />}
      {tab === "feedback" && <FeedbackTab />}
      {tab === "news" && <NewsTab />}
      {tab === "social" && <SocialTab />}
      {tab === "blocks" && <BlocksTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

// Demo-Modus fuer Screen-Recordings. Absichtlich OHNE Uebersetzung: die Admin-Ansicht wird nie
// oeffentlich gezeigt (Jan), 16 Sprachen fuer ein internes Werkzeug waeren verschwendete Muehe.
// Steht bewusst UEBER allen Tabs, damit man ihn im Eifer der Aufnahme nicht suchen muss.
function DemoModusZeile() {
  const [an, setAn] = useState(demoGewuenscht());
  const [n, setN] = useState(demoAnzahl());
  const [busy, setBusy] = useState(false);
  useEffect(() => demoBeobachten(() => setN(demoAnzahl())), []);
  async function um() {
    setBusy(true);
    try {
      await demoSetzen(!an);
      setAn(demoGewuenscht());
      setN(demoAnzahl());
    } finally { setBusy(false); }
  }
  return (
    <Card className={`mb-4 p-3 text-sm ${an ? "ring-2 ring-amber-500" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={um}
          disabled={busy}
          className={`rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50 ${
            an ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
        >
          {an ? "Demo-Modus AN" : "Demo-Modus aus"}
        </button>
        <span className="text-slate-300">
          Für Screen-Recordings: alle Nutzernamen werden durch „Rider N" ersetzt und zusätzlich
          verschwommen gezeichnet — Avatare ebenfalls.
        </span>
      </div>
      <p className="mt-2 text-slate-400">
        Ersetzt wird schon in der API-Antwort, der echte Name kommt also nirgends in die Seite —
        auch nicht mitten in einer Chat-Nachricht. Gilt nur für dich, nur in diesem Browser
        (localStorage), und der Admin-Bereich ist bewusst ausgenommen, weil man sonst nicht mehr
        moderieren könnte. {an ? `Aktiv, ${n} Namen erkannt.` : ""}
      </p>
      {an && (
        <p className="mt-1 font-semibold text-amber-400">
          Nicht vergessen, ihn nach der Aufnahme wieder auszuschalten.
        </p>
      )}
    </Card>
  );
}

function useInfinite<T>(fetchPage: (offset: number) => Promise<T[]>, deps: unknown[], page = 30) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(0); const moreRef = useRef(true); const loadingRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const load = (reset: boolean) => {
    if (loadingRef.current || (!reset && !moreRef.current)) return;
    loadingRef.current = true; setLoading(true);
    const off = reset ? 0 : offsetRef.current;
    fetchPage(off)
      .then((pg) => { offsetRef.current = off + pg.length; moreRef.current = pg.length === page; setItems((prev) => (reset ? pg : [...prev, ...pg])); })
      .catch(() => {})
      .finally(() => { loadingRef.current = false; setLoading(false); });
  };
  useEffect(() => { moreRef.current = true; load(true); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const o = new IntersectionObserver((e) => { if (e[0].isIntersecting) load(false); }, { rootMargin: "300px" });
    if (sentinel.current) o.observe(sentinel.current);
    return () => o.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { items, setItems, loading, sentinel, PAGE: page };
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => { setData(null); fn().then(setData).catch((e) => setError(String(e))); };
  useEffect(reload, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, setData, reload };
}

function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" }) : "";
}

// ---------------------------------------------------------------- Overview ----
function OverviewTab() {
  const t = useT();
  const { data, error } = useAsync<AdminOverview>(() => api.adminOverview());
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  // Tab-Link (3. Feld) = anklickbare Moderations-Kachel; leuchtet, wenn > 0 offen.
  const cells: [string, number, Tab?][] = [
    ["adm.ov.flaggedOpen", data.flagged, "flagged"], ["adm.ov.fake", data.fake, "fake"], ["adm.ov.reported", data.reported],
    ["adm.ov.users", data.users], ["adm.ov.blocked", data.users_blocked], ["adm.ov.admins", data.admins],
    ["adm.ov.sessions", data.sessions], ["adm.ov.pumpfoil", data.pumpfoil], ["adm.ov.deleted", data.sessions_deleted],
    ["adm.ov.photos", data.photos], ["adm.ov.photosBlocked", data.photos_blocked], ["adm.ov.likes", data.likes],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cells.map(([labelKey, v, tab]) => {
          const attn = !!tab && v > 0;
          const inner = (
            <>
              <div className={`text-2xl font-bold tabular-nums ${attn ? "text-amber-400" : "text-brand-400"}`}>{v}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-300">{t(labelKey)}</div>
            </>
          );
          return tab ? (
            <Link key={labelKey} to={`/admin?tab=${tab}`}
              className={`block rounded-xl p-3 transition-colors ${attn ? "border border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20" : "border border-slate-800 bg-slate-900/60 hover:border-slate-600"}`}>
              {inner}
            </Link>
          ) : (
            <Card key={labelKey} className="p-3">{inner}</Card>
          );
        })}
      </div>
      <StatsSection />
    </div>
  );
}

// Verlaufsgrafik (Fenster wie Community): neue/aktive Nutzer, neue Sessions, Fotos, Likes.
const STATS_PERIODS: [string, string][] = [
  ["today", "period.today"], ["10d", "period.10d"], ["30d", "period.30d"], ["365d", "period.365d"], ["all", "period.all"],
];
const STATS_METRICS: [keyof AdminStatsSeries["totals"], string, string][] = [
  ["new_users", "adm.stats.newUsers", "#22d3ee"],
  ["active_users", "adm.stats.activeUsers", "#a3e635"],
  ["sessions", "adm.stats.sessions", "#f59e0b"],
  ["photos", "adm.stats.photos", "#c084fc"],
  ["likes", "adm.stats.likes", "#fb7185"],
];

const DAY_MS = 86400000;

function StatsSection() {
  const t = useT();
  const nf = useNumberFormat();
  const [period, setPeriod] = useState("30d");
  // „heute" = Tageszacken-Ansicht: volle Historie laden, tägliche Werte plotten (nicht kumuliert);
  // die Zahl daneben zeigt den heutigen Tageswert. Alle anderen Fenster: kumulierte Kurve.
  const daily = period === "today";
  const fetchPeriod = daily ? "all" : period;
  const { data } = useAsync<AdminStatsSeries>(() => api.adminStatsSeries(fetchPeriod), [fetchPeriod]);
  const times = (data?.buckets ?? []).map((b) => new Date(b.date + "T00:00:00").getTime());
  // Einheitlicher Zeitraum für ALLE Metriken = das gewählte Fenster (cut → jetzt), nicht nur wo Daten sind.
  const now = Date.now();
  const cut: Record<string, number> = {
    "10d": now - 10 * DAY_MS, "30d": now - 30 * DAY_MS, "365d": now - 365 * DAY_MS,
  };
  const start = (period === "all" || daily)
    ? (times.length ? Math.min(...times) : now - 30 * DAY_MS)
    : cut[period];
  const domain: [number, number] = [start, Math.max(now, start + DAY_MS)];
  // ~4 Datums-Ticks gleichmäßig über den Zeitraum (wie /verlauf).
  const spanDays = (domain[1] - domain[0]) / DAY_MS;
  const ticks = Array.from({ length: 5 }, (_, i) => domain[0] + ((domain[1] - domain[0]) * i) / 4);
  const fmtTick = (ms: number) => new Date(ms).toLocaleDateString(undefined,
    spanDays <= 120 ? { day: "2-digit", month: "short" } : { month: "short", year: "2-digit" });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {STATS_PERIODS.map(([k, lk]) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${period === k ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            {t(lk)}
          </button>
        ))}
      </div>
      {!data ? <Spinner /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {STATS_METRICS.map(([key, labelKey, color]) => {
            // „heute": tägliche Werte (24h-Zacken); sonst kumulierte Kurve, bis "jetzt" verlängert.
            let tPlot: number[]; let vPlot: number[]; let headline: number;
            if (daily) {
              tPlot = times;
              vPlot = data.buckets.map((b) => b[key]);
              const todayKey = new Date().toISOString().slice(0, 10);
              headline = data.buckets.find((b) => b.date === todayKey)?.[key] ?? 0;
            } else {
              let acc = 0;
              const cum = data.buckets.map((b) => (acc += b[key]));
              tPlot = [...times, domain[1]];
              vPlot = [...cum, acc];
              headline = data.totals[key];
            }
            // Y-Skala: gleiche min/max-Ableitung wie TimeChart (min..max der geplotteten Werte).
            const vmax = vPlot.length ? Math.max(...vPlot) : 1;
            const vmin = vPlot.length ? Math.min(...vPlot) : 0;
            const fmtY = (v: number) => nf(Math.round(v));
            return (
              <Card key={key} className="p-3">
                <div className="mb-1 flex items-baseline justify-between px-1">
                  <span className="text-xs uppercase tracking-wide text-slate-300">{t(labelKey)}</span>
                  <span className="text-lg font-bold tabular-nums" style={{ color }}>{nf(Math.round(headline))}</span>
                </div>
                <div className="flex gap-1">
                  <div className="flex h-[100px] w-8 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] tabular-nums text-slate-500">
                    <span>{fmtY(vmax)}</span>
                    <span>{fmtY((vmax + vmin) / 2)}</span>
                    <span>{fmtY(vmin)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <TimeChart t={tPlot} values={vPlot} color={color} domainMs={domain} height={100} />
                  </div>
                </div>
                <div className="ml-9 mt-1 flex justify-between px-1 text-[10px] tabular-nums text-slate-500">
                  {ticks.map((tk, i) => <span key={i}>{fmtTick(tk)}</span>)}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Blocks ----
function BlocksTab() {
  const t = useT();
  const { data, error } = useAsync<AdminBlock[]>(() => api.adminBlocks());
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  const nm = (u: { display_name: string | null; email: string | null }) => u.display_name || u.email || "?";
  return (
    <div>
      {data.length === 0 ? (
        <Card className="p-8 text-center text-slate-300">{t("adm.blocks.empty")}</Card>
      ) : (
        <div className="space-y-2">
          {data.map((b) => (
            <Card key={b.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="font-medium text-slate-100">{nm(b.blocker)}</span>
              <span className="text-slate-500">{b.blocker.email}</span>
              <span className="text-red-400">⛔ {t("adm.blocks.blocked")}</span>
              <span className="font-medium text-slate-100">{nm(b.blocked)}</span>
              <span className="text-slate-500">{b.blocked.email}</span>
              <span className="ml-auto text-[11px] text-slate-500">{fmtDate(b.created_at)}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- News-Banner ----
// Sprachliste kommt aus i18n (LANGS) und NICHT mehr aus einer eigenen Kopie. Die alte Kopie
// kannte nur die ersten sieben Sprachen — mit dem Ergebnis, dass ein Banner-Text auf Finnisch
// (gesetzt am 07.07.2026, persoenlich adressiert) hier zwei Monate lang UNSICHTBAR war: nicht
// anzeigbar, nicht loeschbar, und beim Speichern wurde er stumm mit durchgeschleift, weil das
// Formular `texts` als Ganzes zurueckschickt. Aufgefallen erst, als er im Android-Emulator auf
// einem finnisch eingestellten Testkonto auftauchte.
//
// Zwei Konsequenzen daraus, absichtlich beide:
//  1. Liste aus LANGS ableiten -> neue Sprache = automatisch hier drin.
//  2. Was in der DB steht, aber in KEINER bekannten Sprache liegt, wird trotzdem angezeigt
//     (Abschnitt „unbekannt"). Ein Text, den man nicht sieht, kann man nicht zurueckziehen.
// Beschriftungen bewusst deutsch/unuebersetzt — wie der Demo-Modus oben; diese Ansicht sieht
// nur der Betreiber.

function NewsTab() {
  const t = useT();
  const [n, setN] = useState<NewsBanner | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.adminNewsGet().then(setN).catch(() => {}); }, []);
  if (!n) return <Spinner />;
  const setText = (l: string, v: string) => setN({ ...n, texts: { ...n.texts, [l]: v } });
  const save = async () => {
    setSaving(true);
    try { const r = await api.adminNewsSet(n); setN(r); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setSaving(false); }
  };

  const bekannt = LANGS.map((l) => l.code as string);
  const fremd = Object.keys(n.texts).filter((k) => !bekannt.includes(k));
  const belegt = Object.entries(n.texts).filter(([, v]) => (v || "").trim()).map(([k]) => k);
  const feld = (code: string, label: string) => (
    <div key={code}>
      <div className="mb-0.5 flex items-center gap-2 text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-[10px] text-slate-500">{code}</span>
        {(n.texts[code] || "").trim() && <span className="rounded bg-brand-500/20 px-1.5 text-[10px] font-semibold text-brand-300">belegt</span>}
      </div>
      <textarea value={n.texts[code] || ""} onChange={(e) => setText(code, e.target.value)} rows={2}
        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="space-y-3 p-4">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={n.enabled} onChange={(e) => setN({ ...n, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-brand-500 focus:ring-brand-500" />
          {t("adm.news.enabled")}
        </label>
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <span>{t("adm.news.version")}</span>
          <input type="number" value={n.version} onChange={(e) => setN({ ...n, version: Number(e.target.value) })}
            className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100" />
          <button onClick={() => setN({ ...n, version: n.version + 1 })}
            className="rounded-lg bg-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-600">{t("adm.news.bump")}</button>
          <span className="text-xs text-slate-400">{t("adm.news.versionHint")}</span>
        </div>
        {/* Kurzbilanz: WAS steht gerade drin und seit wann. Ohne die Zeile muss man 17 Felder
            durchscrollen, um zu sehen, ob ueberhaupt ein Text aktiv ist. */}
        <div className="border-t border-slate-700 pt-3 text-sm text-slate-300">
          {belegt.length === 0
            ? <span>Aktuell kein Text hinterlegt — es erscheint nur der Standard-Willkommenstext.</span>
            : <span>Text hinterlegt in: <span className="font-semibold text-slate-100">{belegt.join(", ")}</span>
                {" "}({belegt.length === 1 ? "eine Sprache" : `${belegt.length} Sprachen`})</span>}
          {n.updated_at && <span className="text-slate-400"> · zuletzt geändert {fmtDate(n.updated_at)}</span>}
        </div>
      </Card>

      {fremd.length > 0 && (
        <Card className="space-y-3 border-amber-500/40 p-4">
          <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Text in einer Sprache, die die App nicht (mehr) anbietet: {fremd.join(", ")}
          </div>
          <div className="text-sm text-slate-300">
            Zum Zurückziehen Feld leeren und speichern — leere Texte werden serverseitig entfernt.
          </div>
          {fremd.map((k) => feld(k, "unbekannt"))}
        </Card>
      )}

      <div className="space-y-2">
        {LANGS.map((l) => feld(l.code as string, `${l.flag} ${l.native}`))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
          {saving ? "…" : saved ? t("adm.news.saved") : t("adm.news.save")}
        </button>
        <span className="text-xs text-slate-400">{t("adm.news.hint")}</span>
      </div>
      {/* Die harte Regel steht in CLAUDE.md; sie gehoert auch dorthin, wo man tippt. */}
      <div className="text-sm text-slate-300">
        Der Banner ist <span className="font-semibold text-slate-100">global</span> — alle Nutzer, alle Sprachen.
        Nur allgemeine Ankündigungen; nichts Persönliches und nichts an einzelne Nutzer Gerichtetes (dafür 1:1-Chat).
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Sessions ----
function Badge({ tone, children }: { tone: "red" | "amber" | "green" | "slate"; children: React.ReactNode }) {
  // Solide Akzentflächen + dunkler Text -> in BEIDEN Themes lesbar (der Light-Mode
  // remappt nur slate via --s-*, nicht red/amber/emerald).
  const c = { red: "bg-red-400 text-red-950", amber: "bg-amber-400 text-amber-950", green: "bg-emerald-400 text-emerald-950", slate: "bg-slate-700 text-slate-200" }[tone];
  return <span className={`rounded px-1.5 py-0.5 text-xs ${c}`}>{children}</span>;
}

const SCOPE_HINT: Record<string, string> = {
  flagged: "adm.hint.flagged",
  suspect: "adm.hint.suspect",
  fake: "adm.hint.fake",
  all: "adm.hint.all",
  deleted: "adm.hint.deleted",
};

const PAGE = 30;

function SessionsTab({ scope }: { scope: "flagged" | "fake" | "suspect" | "all" | "deleted" }) {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const urlQ = sp.get("q") || "";
  const userId = sp.get("user") ? Number(sp.get("user")) : undefined;
  const [items, setItems] = useState<AdminSession[]>([]);
  const [q, setQ] = useState(urlQ);
  const [loading, setLoading] = useState(false);
  const [filterUser, setFilterUser] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = (reset: boolean) => {
    if (loadingRef.current || (!reset && !hasMoreRef.current)) return;
    loadingRef.current = true; setLoading(true);
    const off = reset ? 0 : offsetRef.current;
    api.adminSessions(scope, { limit: PAGE, offset: off, q: urlQ, userId })
      .then((page) => {
        offsetRef.current = off + page.length;
        hasMoreRef.current = page.length === PAGE;
        setItems((prev) => (reset ? page : [...prev, ...page]));
        if (userId && page[0]) setFilterUser(page[0].email);
      })
      .catch(() => {})
      .finally(() => { loadingRef.current = false; setLoading(false); });
  };

  useEffect(() => { setQ(urlQ); hasMoreRef.current = true; load(true); }, [scope, urlQ, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) load(false); }, { rootMargin: "300px" });
    if (sentinel.current) obs.observe(sentinel.current);
    return () => obs.disconnect();
  }, [scope, urlQ, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (id: number, patch: Partial<AdminSession>) =>
    setItems((prev) => prev.map((s) => (s.session_id === id ? { ...s, ...patch } : s)));
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const n = new URLSearchParams(sp); if (q) n.set("q", q); else n.delete("q"); setSp(n);
  };
  const clearUser = () => { const n = new URLSearchParams(sp); n.delete("user"); setSp(n); };

  return (
    <div>
      <p className="mb-3 text-xs text-slate-300">{t(SCOPE_HINT[scope])}</p>
      <form onSubmit={submitSearch} className="mb-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adm.searchSessions")}
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
        <button className="rounded-xl bg-slate-800 px-4 text-sm text-slate-200">{t("common.search")}</button>
      </form>
      {userId && (
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-300">
          <span>{t("adm.onlyFrom")} <b className="text-brand-300">{filterUser || `#${userId}`}</b></span>
          <button onClick={clearUser} className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">{t("adm.clearFilter")}</button>
        </div>
      )}
      {items.length === 0 && !loading ? <Card className="p-8 text-center text-slate-300">{t("adm.nothingFound")}</Card> : (
        <div className="space-y-2">
          {items.map((s) => (
            <Card key={s.session_id} className="flex flex-wrap items-center gap-3 p-3">
              <Link to={`/sessions/${s.session_id}`} className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-100">
                  {s.name ? <span className="text-brand-300">{s.name}</span> : <span className="text-slate-400">—</span>}
                  {s.spot && <span className="inline-flex items-center gap-1 text-slate-300"> · <LocationIcon className="h-3.5 w-3.5" /> {s.spot}</span>}
                  <span className="text-slate-400"> · {s.sport}</span>
                </div>
                <div className="text-[11px] text-slate-400">{fmtDate(s.started_at)} · <span className="text-slate-300">{s.email}</span></div>
              </Link>
              <div className="flex shrink-0 flex-wrap items-center gap-2 tabular-nums">
                {s.inappropriate > 0 && <Badge tone="red"><FlagIcon className="inline h-3.5 w-3.5" /> {s.inappropriate}</Badge>}
                {s.fake > 0 && <Badge tone="amber"><FakeIcon className="inline h-3.5 w-3.5" /> {t("adm.unecht")} {s.fake}</Badge>}
                {(s.gated_runs ?? 0) > 0 && <Badge tone="amber">{t("adm.gated", { n: s.gated_runs! })}</Badge>}
                {s.likes > 0 && <Badge tone="slate"><HeartIcon className="inline h-3.5 w-3.5" filled /> {s.likes}</Badge>}
                {s.photos > 0 && <Badge tone="slate"><CameraIcon className="inline h-3.5 w-3.5" /> {s.photos}</Badge>}
                {s.flagged && <Badge tone="red">{t("adm.hidden")}</Badge>}
                {s.pumpfoil_override === false && <Badge tone="amber">{t("adm.sortedOutBadge")}</Badge>}
                {s.mod_ok && s.inappropriate > 0 && <Badge tone="green">{t("adm.approved")}</Badge>}
                {s.deleted && <Badge tone="slate">{t("adm.deletedBadge")}</Badge>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {s.deleted ? (
                  <Act tone="green" onClick={() => api.adminRestoreSession(s.session_id).then(() => upd(s.session_id, { deleted: false }))}>{t("adm.restore")}</Act>
                ) : (
                  <>
                    {s.flagged
                      ? <Act tone="green" onClick={() => api.adminApprove(s.session_id).then(() => upd(s.session_id, { flagged: false, mod_ok: true }))}>{t("adm.approve")}</Act>
                      : <Act tone="amber" confirm={t("adm.hideConfirm")} onClick={() => api.adminHideSession(s.session_id).then(() => upd(s.session_id, { flagged: true, mod_ok: false }))}>{t("adm.hide")}</Act>}
                    {s.fake > 0 && <Act tone="slate" onClick={() => api.adminDismiss(s.session_id, "fake").then(() => upd(s.session_id, { fake: 0 }))}>{t("adm.dismissFake")}</Act>}
                    {/* Aussortieren „wie vom Detektor" (sanft, kein Shadow-Ban) bzw. rückgängig. */}
                    {s.pumpfoil_override === false
                      ? <Act tone="green" onClick={() => api.adminSortOut(s.session_id, true).then((r) => upd(s.session_id, { pumpfoil_override: null, is_pumpfoil: r.is_pumpfoil }))}>{t("adm.unsortOut")}</Act>
                      : s.is_pumpfoil && <Act tone="amber" confirm={t("adm.sortOutConfirm")} onClick={() => api.adminSortOut(s.session_id).then(() => upd(s.session_id, { pumpfoil_override: false, is_pumpfoil: false, mod_ok: true }))}>{t("adm.sortOut")}</Act>}
                    <Act tone="red" confirm={t("adm.deleteSessionConfirm")} onClick={() => api.adminDeleteSession(s.session_id).then(() => upd(s.session_id, { deleted: true }))}>{t("adm.delete")}</Act>
                  </>
                )}
              </div>
              {s.reporters && s.reporters.length > 0 && (
                <div className="basis-full border-t border-slate-800 pt-2 text-[11px] text-slate-400">
                  {t("adm.reportedBy")}:{" "}
                  {s.reporters.map((r, i) => (
                    <span key={i} className="mr-3 inline-block">
                      {r.kind === "fake" ? <FakeIcon className="inline h-3 w-3 text-amber-400" /> : <FlagIcon className="inline h-3 w-3 text-red-400" />}{" "}
                      <span className="text-slate-300">{r.name || "—"}</span> <span className="text-slate-500">({fmtDate(r.at)})</span>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <div ref={sentinel} className="h-8" />
      {loading && <Spinner />}
    </div>
  );
}

function Act({ tone, onClick, confirm: confirmMsg, children }: { tone: "red" | "green" | "slate" | "amber"; onClick: () => Promise<unknown>; confirm?: string; children: React.ReactNode }) {
  const t = useT();
  // Solide Akzentfarben + weißer Text -> in beiden Themes lesbar (slate bleibt remappt).
  const c = { red: "bg-red-600 text-white hover:bg-red-700", green: "bg-emerald-600 text-white hover:bg-emerald-700", slate: "bg-slate-700 text-slate-200 hover:bg-slate-600", amber: "bg-amber-600 text-white hover:bg-amber-700" }[tone];
  return (
    <button
      onClick={() => { if (confirmMsg && !confirm(confirmMsg)) return; onClick().catch((e) => alert(t("adm.error") + e)); }}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${c}`}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------- Users ----
const FILTER_KEYS = ["normal", "tester", "admin", "new"] as const;

function UsersTab() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const query = sp.get("q") || "";
  const [q, setQ] = useState(query);
  useEffect(() => { setQ(query); }, [query]);
  const setQuery = (val: string) => {
    const n = new URLSearchParams(sp);
    if (val) n.set("q", val); else n.delete("q");
    setSp(n);
  };
  const [filter, setFilter] = useState<UserFilter>({ normal: true, tester: true, admin: true, new: true });
  const [sort, setSort] = useState<UserSort>("created");
  const [stat, setStat] = useState<StatKey | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [act, setAct] = useState<AdminUserActivity | null>(null);
  const toggle = (k: keyof UserFilter) => setFilter((f) => ({ ...f, [k]: !f[k] }));
  const pickStat = (k: StatKey) => setStat((s) => (s === k ? null : k));  // Einzelauswahl: nochmal = aus
  const { items, setItems, loading, sentinel } = useInfinite<AdminUser>(
    (off) => api.adminUsers(query, 30, off, filter, sort, stat),
    [query, filter.normal, filter.tester, filter.admin, filter.new, sort, stat]);
  useEffect(() => {
    setTotal(null);
    api.adminUsersCount(query, filter, stat).then((r) => setTotal(r.total)).catch(() => {});
  }, [query, filter.normal, filter.tester, filter.admin, filter.new, stat]);
  useEffect(() => { api.adminUsersActivity().then(setAct).catch(() => {}); }, []);
  const upd = (id: number, patch: Partial<AdminUser>) =>
    setItems((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  return (
    <div>
      {([
        [["today", "adm.act.today", "text-brand-400"], ["week", "adm.act.week", "text-brand-400"], ["month", "adm.act.month", "text-brand-400"], ["total", "adm.act.total", "text-brand-400"]],
        [["new_today", "adm.act.newToday", "text-emerald-400"], ["new_week", "adm.act.newWeek", "text-emerald-400"], ["new_month", "adm.act.newMonth", "text-emerald-400"], ["inactive_week", "adm.act.inactive", "text-slate-400"]],
      ] as const).map((row, ri) => (
        <div key={ri} className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${ri === 0 ? "mb-2" : "mb-4"}`}>
          {row.map(([k, lbl, color]) => {
            const on = stat === k;
            return (
              <button key={k} onClick={() => pickStat(k as StatKey)} aria-pressed={on}
                className={`rounded-xl border px-3 py-[3px] text-center transition-colors ${on ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500" : "border-slate-800 bg-slate-900/60 hover:border-slate-600"}`}>
                <div className={`text-base font-bold tabular-nums ${color}`}>{act ? act[k] : "…"}</div>
                <div className="text-[10px] text-slate-400">{t(lbl)}</div>
              </button>
            );
          })}
        </div>
      ))}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <form onSubmit={(e) => { e.preventDefault(); setQuery(q); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adm.searchUsers")}
            className="w-44 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100" />
          <button className="rounded-xl bg-slate-800 px-3 text-sm text-slate-200">{t("common.search")}</button>
        </form>
        {FILTER_KEYS.map((k) => (
          <label key={k} className="flex cursor-pointer select-none items-center gap-1.5 text-sm text-slate-300">
            <input type="checkbox" checked={filter[k]} onChange={() => toggle(k)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-brand-500 focus:ring-brand-500" />
            {t(`adm.filter.${k}`)}
          </label>
        ))}
        <label className="flex items-center gap-1.5 text-sm text-slate-300">
          <span className="text-xs text-slate-400">{t("adm.sortBy")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as UserSort)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">
            <option value="seen">{t("adm.sort.seen")}</option>
            <option value="created">{t("adm.sort.created")}</option>
            <option value="sessions">{t("adm.sort.sessions")}</option>
            <option value="id">{t("adm.sort.id")}</option>
          </select>
        </label>
        <span className="ml-auto text-xs text-slate-400">{total === null ? "…" : t("adm.foundCount", { count: total })}</span>
      </div>
      {items.length === 0 && !loading ? <Card className="p-8 text-center text-slate-300">{t("adm.noUsers")}</Card> : (
        <div className="space-y-2">
          {items.map((u) => (
            <UserRow key={u.id} u={u}
              upd={(patch) => upd(u.id, patch)}
              onRemove={() => setItems((p) => p.filter((x) => x.id !== u.id))} />
          ))}
        </div>
      )}
      <div ref={sentinel} className="h-8" />
      {loading && <Spinner />}
    </div>
  );
}

function UserRow({ u, upd, onRemove }: { u: AdminUser; upd: (p: Partial<AdminUser>) => void; onRemove: () => void }) {
  const t = useT();
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const toggleStats = () => {
    setOpen((v) => !v);
    if (!stats) api.adminUserStats(u.id).then((r) => setStats(r.stats)).catch(() => {});
  };
  return (
    <Card className="p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={u.display_name} url={u.avatar_url} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-100">
            {u.display_name || <span className="text-slate-400">{t("adm.noName")}</span>}
            {u.is_admin && <span className="ml-1"><Badge tone="green">{t("adm.adminBadge")}</Badge></span>}
            {u.blocked && <span className="ml-1"><Badge tone="red">{t("adm.blockedBadge")}</Badge></span>}
            {u.hidden && <span className="ml-1"><Badge tone="amber">{t("adm.testerBadge")}</Badge></span>}
            {u.social_allowed === false && <span className="ml-1"><Badge tone="red">🔞 Age-Gate{u.age_bracket ? ` ${u.age_bracket}` : ""}</Badge></span>}
            {u.social_allowed !== false && u.age_bracket != null && <span className="ml-1"><Badge tone="slate">{u.age_bracket}</Badge></span>}
            {u.new && <span className="ml-1"><NewBadge /></span>}
          </div>
          <div className="truncate text-[11px] text-slate-400">{u.email} · {t("adm.sessionsSince", { sessions: u.sessions, date: fmtDate(u.created_at) })}</div>
          <div className="truncate text-[11px] text-slate-500">
            {t("adm.lastSeen")}: {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : "–"}
          </div>
          {((u.watches?.length ?? 0) + (u.oauth?.length ?? 0) + (u.links?.length ?? 0)) > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {u.watches?.map((w, i) => (
                <span key={"w" + i} title={t("adm.watchTip")} className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-200">
                  ⌚ {w.name}{w.version ? ` ${w.version}` : ""}
                </span>
              ))}
              {u.oauth?.map((p) => (
                <span key={"o" + p} title={t("adm.loginTip")} className="rounded bg-sky-400 px-1.5 py-0.5 text-[10px] capitalize text-sky-950">
                  🔑 {p}
                </span>
              ))}
              {u.links?.map((p) => (
                <span key={"l" + p} title={t("adm.importTip")} className="rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] capitalize text-emerald-950">
                  ↔ {p}
                </span>
              ))}
            </div>
          )}
        </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/admin?tab=sessions&user=${u.id}`} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600">{t("adm.sessionsLink")}</Link>
          <button onClick={toggleStats} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600">{open ? t("adm.statsHide") : t("adm.statsShow")}</button>
          <button onClick={() => setEdit((v) => !v)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${edit ? "bg-brand-600 text-white hover:bg-brand-500" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}>{edit ? t("adm.editClose") : t("adm.edit")}</button>
        </div>
      </div>
      {edit && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
          <Act tone={u.blocked ? "green" : "red"} onClick={() => api.adminBlockUser(u.id, !u.blocked).then((r) => upd({ blocked: r.blocked }))}>{u.blocked ? t("adm.unblock") : t("adm.block")}</Act>
          <Act tone={u.hidden ? "green" : "amber"} onClick={() => api.adminHideUser(u.id, !u.hidden).then((r) => upd({ hidden: r.hidden }))}>{u.hidden ? t("adm.unhideUser") : t("adm.hideUser")}</Act>
          <Act tone="slate" onClick={() => api.adminSetAdmin(u.id, !u.is_admin).then((r) => upd({ is_admin: r.is_admin }))}>{u.is_admin ? t("adm.adminRevoke") : t("adm.adminGrant")}</Act>
          <Act tone="slate" onClick={async () => {
            const pw = prompt(t("adm.pwPrompt", { email: u.email }), "");
            if (!pw) return;
            if (pw.length < 8) { alert(t("adm.pwMin")); return; }
            return api.adminResetPassword(u.id, pw).then(() => alert(t("adm.pwSet", { email: u.email, pw })));
          }}>{t("adm.setPassword")}</Act>
          <Act tone="slate" onClick={async () => {
            const n = prompt(t("adm.namePrompt"), u.display_name || "");
            if (n === null) return;
            return api.adminSetUserName(u.id, n).then((r) => upd({ display_name: r.display_name }));
          }}>{t("adm.name")}</Act>
          {u.avatar_url && <Act tone="slate" onClick={() => api.adminRemoveAvatar(u.id).then(() => upd({ avatar_url: null }))}>{t("adm.removeAvatar")}</Act>}
          <Act tone="red" confirm={t("adm.deleteUserConfirm", { email: u.email })} onClick={() => api.adminDeleteUser(u.id).then(onRemove)}>{t("adm.delete")}</Act>
        </div>
      )}
      {open && stats && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-center sm:grid-cols-6">
          {[
            [t("adm.st.sessions"), String(stats.count)],
            [t("adm.st.foilingKm"), stats.foiling_km.toFixed(1)],
            [t("adm.st.pumps"), String(stats.pumps)],
            [t("adm.st.runs"), String(stats.runs_total)],
            [t("adm.st.farRun"), stats.records.distance.value ? `${Math.round(stats.records.distance.value)} m` : "–"],
            [t("adm.st.topSpeed"), stats.records.speed.value ? `${(stats.records.speed.value * 3.6).toFixed(1)}` : "–"],
          ].map(([l, v]) => (
            <div key={l}><div className="text-sm font-bold tabular-nums text-brand-400">{v}</div><div className="text-[10px] uppercase text-slate-400">{l}</div></div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Fotos ----
function PhotosTab() {
  const t = useT();
  const { items, setItems, loading, sentinel } = useInfinite<AdminPhoto>(
    (off) => api.adminPhotos(30, off), []);
  const upd = (id: number, patch: Partial<AdminPhoto>) =>
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  return (
    <div>
      {items.length === 0 && !loading ? <Card className="p-8 text-center text-slate-300">{t("adm.noPhotos")}</Card> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => (
            <Card key={p.id} className="overflow-hidden p-0">
              <Link to={`/sessions/${p.session_id}`}>
                <img src={p.url} alt="" className={`h-36 w-full object-cover ${p.blocked ? "opacity-30 grayscale" : ""}`} />
              </Link>
              <div className="p-2">
                <div className="truncate text-[11px] text-slate-300">{p.name || "—"}{p.spot ? ` · ${p.spot}` : ""}</div>
                <div className="mt-1.5 flex gap-1.5">
                  <Act tone={p.blocked ? "green" : "amber"} onClick={() => api.adminBlockPhoto(p.id, !p.blocked).then((r) => upd(p.id, { blocked: r.blocked }))}>
                    {p.blocked ? t("adm.unblockPhoto") : t("adm.blockPhoto")}
                  </Act>
                  <Act tone="red" confirm={t("adm.deletePhotoConfirm")} onClick={() => api.adminDeletePhoto(p.id).then(() => setItems((prev) => prev.filter((x) => x.id !== p.id)))}>{t("adm.delete")}</Act>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div ref={sentinel} className="h-8" />
      {loading && <Spinner />}
    </div>
  );
}

// --------------------------------------------------------------- Feedback ----
function FeedbackTab() {
  const t = useT();
  const { data, error, setData } = useAsync<AdminFeedback[]>(() => api.adminFeedback());
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  if (data.length === 0) return <Card className="p-8 text-center text-slate-300">{t("adm.noFeedback")}</Card>;
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Act tone="red" confirm={t("adm.feedbackDelAllConfirm", { n: data.filter((x) => !x.starred).length })}
          onClick={() => api.adminDeleteAllFeedback().then(() => setData((data ?? []).filter((x) => x.starred)))}>
          {t("adm.feedbackDelAll")}
        </Act>
      </div>
      {data.map((f) => (
        <Card key={f.id} className={`flex items-start gap-3 p-3 ${f.starred ? "border-amber-500/50" : ""}`}>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs text-slate-400">
              <span className="font-medium text-brand-300">{f.name}</span>
              <span>{f.at ? new Date(f.at).toLocaleString() : ""}</span>
              {f.url && <a href={f.url} className="truncate text-slate-400 underline hover:text-slate-200">{f.url}</a>}
            </div>
            <div className="whitespace-pre-wrap text-sm text-slate-100">{f.text}</div>
            {/* Anhaenge: Bilder als Vorschau, Logs als Download. Beides laeuft ueber die
                Admin-Route — die Dateien liegen NICHT unter /media. */}
            {(f.attachments?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap items-start gap-2">
                {f.attachments!.map((a) => <Anhang key={a.id} a={a} />)}
              </div>
            )}
          </div>
          {/* ⭐ Testimonial-Archiv: überlebt „Alle löschen"; vor öffentlicher Nutzung Autor fragen. */}
          <button
            onClick={() => api.adminStarFeedback(f.id, !f.starred)
              .then((r) => setData((data ?? []).map((x) => (x.id === f.id ? { ...x, starred: r.starred } : x))))}
            title={t("adm.feedbackStarTitle")}
            className={`rounded-lg px-2 py-1.5 text-base leading-none ${f.starred ? "bg-amber-500/20" : "bg-slate-800 opacity-50 hover:opacity-100"}`}
          >
            {f.starred ? "⭐" : "☆"}
          </button>
          <Act tone="red" confirm={t("adm.feedbackDelConfirm")}
            onClick={() => api.adminDeleteFeedback(f.id).then(() => setData((data ?? []).filter((x) => x.id !== f.id)))}>
            {t("adm.delete")}
          </Act>
        </Card>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- Chat ----
function ChatModTab() {
  const t = useT();
  const [rows, setRows] = useState<(ChatMsg & { scope: string })[] | null>(null);
  const reload = () => api.chatReported().then(setRows).catch(() => setRows([]));
  useEffect(() => { reload(); }, []);
  if (!rows) return <Spinner />;
  if (rows.length === 0) return <Card className="p-8 text-center text-slate-300">{t("adm.chat.none")}</Card>;

  const hide = (id: number, hidden: boolean) =>
    api.chatHide(id, hidden).then(() => setRows((r) => r && r.map((m) => m.id === id ? { ...m, hidden } : m))).catch(() => {});
  const dismiss = (id: number) =>
    api.chatDismissReports(id).then(() => setRows((r) => r && r.filter((m) => m.id !== id))).catch(() => {});
  const readonly = (uid: number, name: string | null) => {
    if (!confirm(t("chat.readonlyConfirm", { name: name || "?" }))) return;
    api.chatSetReadonly(uid, true).then(() => alert(t("adm.chat.readonlyDone"))).catch(() => {});
  };

  return (
    <div className="space-y-2">
      {rows.map((m) => (
        <Card key={m.id} className={`p-3 ${m.hidden ? "opacity-60" : ""}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-medium text-slate-200">{m.name || "—"}</span>
            <span>· {m.scope}</span>
            <span className="inline-flex items-center gap-1 text-amber-400"><FlagIcon className="h-3.5 w-3.5" /> {m.report_count}</span>
            {m.hidden && <span className="rounded bg-slate-700/50 px-1.5 text-slate-300">{t("adm.chat.hidden")}</span>}
            <span className="ml-auto">{m.created_at ? new Date(m.created_at).toLocaleString() : ""}</span>
          </div>
          <p className="mb-2 whitespace-pre-wrap break-words text-sm text-slate-100">{m.text}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {m.hidden ? (
              <button onClick={() => hide(m.id, false)} className="rounded-lg bg-emerald-600/20 px-2.5 py-1 text-emerald-700 hover:bg-emerald-600/30 dark:text-emerald-300">{t("chat.unhide")}</button>
            ) : (
              <button onClick={() => hide(m.id, true)} className="rounded-lg bg-amber-600/20 px-2.5 py-1 text-amber-700 hover:bg-amber-600/30 dark:text-amber-300">{t("chat.hide")}</button>
            )}
            <button onClick={() => readonly(m.user_id, m.name)} className="rounded-lg bg-red-500/10 px-2.5 py-1 text-red-700 hover:bg-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70">{t("chat.readonly")}</button>
            <button onClick={() => dismiss(m.id)} className="rounded-lg bg-slate-500/10 px-2.5 py-1 text-slate-300 hover:bg-slate-500/20">{t("adm.chat.dismiss")}</button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Audit ----
function AuditTab() {
  const t = useT();
  const { data, error } = useAsync<AdminAuditEntry[]>(() => api.adminAudit());
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  if (data.length === 0) return <Card className="p-8 text-center text-slate-300">{t("adm.noActions")}</Card>;
  return (
    <div className="space-y-1">
      {data.map((a) => (
        <div key={a.id} className="flex items-baseline gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs">
          <span className="shrink-0 text-slate-400">{a.at ? new Date(a.at).toLocaleString() : ""}</span>
          <span className="shrink-0 font-medium text-brand-300">{a.admin}</span>
          <span className="text-slate-200">{a.action}</span>
          <span className="text-slate-400">{a.target_type}#{a.target_id}{a.detail ? ` (${a.detail})` : ""}</span>
        </div>
      ))}
    </div>
  );
}

function SpotNotesModeration() {
  const t = useT();
  const [scope, setScope] = useState<"reported" | "all">("reported");
  const { data, error, reload } = useAsync(() => api.adminSpotNotes(scope), [scope]);
  if (error || !data) return null;
  if (scope === "reported" && data.length === 0) {
    return (
      <div className="mb-3 text-xs text-slate-400">
        {t("adm.spotnote.none")}{" "}
        <button onClick={() => setScope("all")} className="underline">{t("adm.spotnote.showAll")}</button>
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-lg border border-slate-700 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
        {t("adm.spotnote.title")}
        <span className="text-xs font-normal text-slate-400">({data.length})</span>
        <button onClick={() => setScope(scope === "all" ? "reported" : "all")}
          className="ml-auto rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">
          {scope === "all" ? t("adm.spotnote.onlyReported") : t("adm.spotnote.showAll")}
        </button>
      </div>
      <div className="space-y-2">
        {data.map((n) => (
          <div key={n.id} className="rounded bg-slate-800 p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="text-slate-200">{n.spot ?? n.spot_id}</span>
              <span>· {n.name ?? n.user_id}</span>
              {n.updated_at && <span>· {new Date(n.updated_at).toLocaleDateString()}</span>}
              {n.reports > 0 && <span className="text-red-600 dark:text-red-300">· {n.reports}× {t("adm.spotnote.reported")}</span>}
              {n.hidden && <span className="text-amber-700 dark:text-amber-300">· {t("adm.spotnote.hidden")}</span>}
              {n.mod_ok && <span className="text-emerald-700 dark:text-emerald-300">· {t("adm.spotnote.checked")}</span>}
              <button onClick={() => api.adminSpotNoteOk(n.id).then(reload)}
                className="ml-auto rounded bg-brand-500 px-2 py-1 font-semibold text-slate-950">{t("adm.approve")}</button>
              <button onClick={() => { if (confirm(t("adm.spotnote.deleteConfirm"))) api.adminSpotNoteDelete(n.id).then(reload); }}
                className="rounded bg-slate-700 px-2 py-1 text-red-600 dark:text-red-300">{t("adm.delete")}</button>
            </div>
            {n.text && <p className="mt-1 whitespace-pre-wrap text-slate-200">{n.text}</p>}
            {n.photos.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {n.photos.map((u) => <img key={u} src={u} alt="" className="h-16 w-16 rounded object-cover" />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SpotsTab() {
  const t = useT();
  const { data, error, reload } = useAsync(() => api.adminSpots(), []);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [into, setInto] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  const selIds = [...sel];
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function merge() {
    if (into == null || selIds.filter((i) => i !== into).length === 0) return;
    setBusy(true);
    try { await api.adminMergeSpots(into, selIds); setSel(new Set()); setInto(null); reload(); }
    finally { setBusy(false); }
  }
  async function rename(id: number, cur: string | null) {
    const name = prompt(t("adm.spot.renamePrompt"), cur ?? "");
    if (name == null || !name.trim()) return;
    await api.adminRenameSpot(id, name.trim()); reload();
  }
  return (
    <div>
      {/* Gemeldete Spot-Beschreibungen zuerst: eine einzige Meldung blendet sie sofort aus,
          also darf die Liste nicht in einem Nebentab versauern. */}
      <SpotNotesModeration />
      {selIds.length >= 2 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-800 p-2 text-sm">
          <span>{t("adm.spot.mergeSel", { n: selIds.length })}</span>
          <select value={into ?? ""} onChange={(e) => setInto(e.target.value ? Number(e.target.value) : null)}
            className="rounded bg-slate-900 px-2 py-1 text-slate-100">
            <option value="">{t("adm.spot.mergeTarget")}</option>
            {selIds.map((id) => <option key={id} value={id}>{data.find((s) => s.id === id)?.name ?? id}</option>)}
          </select>
          <button onClick={merge} disabled={busy || into == null}
            className="rounded bg-brand-500 px-3 py-1 font-semibold text-slate-950 disabled:opacity-50">{t("adm.spot.merge")}</button>
        </div>
      )}
      <div className="space-y-1">
        {data.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm">
            <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} className="accent-brand-500" />
            <span className="min-w-0 truncate font-medium">{s.name ?? "—"}</span>
            <span className="shrink-0 text-xs text-slate-500">#{s.id} · {s.name_source ?? "?"}{s.water ? ` · ${s.water}` : ""}</span>
            <span className="ml-auto shrink-0 tabular-nums text-slate-400">{s.sessions}</span>
            <button onClick={() => rename(s.id, s.name)} className="shrink-0 rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700">{t("adm.spot.rename")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Sportart-Klassifikation: WIDERSPRÜCHE (docs/sport-classification.md) ----
// Hier stehen ausschließlich Fälle, in denen der Besitzer sagt „war doch Pumpfoiling" (Jan: „sonst
// will ich damit nichts zu tun haben"). Sessions, die bloß auf die Zuordnung durch den Besitzer
// warten, tauchen NICHT auf — das klärt er selbst. Anders als der Besitzer sieht der Admin, WER
// gemeldet hat und was sie geschrieben haben; genau dafür ist diese Seite da.
function ClassifyTab() {
  const t = useT();
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = () => api.adminClassificationQueue().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const act = (id: number, fn: () => Promise<unknown>) => {
    setBusy(id);
    fn().then(load).catch(() => {}).finally(() => setBusy(null));
  };
  if (!rows) return <Spinner />;
  if (rows.length === 0) return <Card className="p-6 text-sm text-slate-300">{t("adm.cls.none")}</Card>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.session_id} className="p-4">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Link to={`/sessions/${r.session_id}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
              #{r.session_id}
            </Link>
            <span className="text-sm text-slate-300">{r.name}</span>
            <span className="text-sm text-slate-400">{r.spot ?? "—"}</span>
            {r.appeal_text && (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-sm text-amber-800 dark:text-amber-200">
                {t("adm.cls.appeal")}
              </span>
            )}
          </div>
          {/* Entscheidungshilfe: was sagt der Detektor, was sagen die Melder? */}
          <p className="text-sm text-slate-300">
            {t("adm.cls.detector", { detection: r.detection ?? "—", runs: r.num_runs ?? 0,
              speed: r.max_speed ? (r.max_speed * 3.6).toFixed(1) : "—" })}
          </p>
          {r.appeal_text && <p className="mt-1 text-sm italic text-slate-200">„{r.appeal_text}"</p>}
          <ul className="mt-1 space-y-0.5 text-sm text-slate-400">
            {(r.flags ?? []).map((f: any) => (
              <li key={f.user_id}>{f.name}{f.note ? `: „${f.note}"` : ""}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button disabled={busy === r.session_id}
              onClick={() => act(r.session_id, () => api.adminKeepPumpfoil(r.session_id))}
              className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-sm text-slate-950 hover:bg-brand-400 disabled:opacity-40">
              {t("adm.cls.keep")}
            </button>
            <select value="" disabled={busy === r.session_id}
              onChange={(e) => { const v = e.target.value; if (v) act(r.session_id, () => api.setClassification(r.session_id, { sport: v })); }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100">
              <option value="">{t("adm.cls.setSport")}</option>
              {SPORTS.filter((k) => k !== "pumpfoil").map((k) => <option key={k} value={k}>{t(`cls.sport.${k}`)}</option>)}
            </select>
            <select value="" disabled={busy === r.session_id}
              onChange={(e) => { const v = e.target.value; if (v) act(r.session_id, () => api.setClassification(r.session_id, { data_quality: v })); }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100">
              <option value="">{t("adm.cls.setQuality")}</option>
              {DATA_QUALITY.filter((k) => k !== "ok").map((k) => <option key={k} value={k}>{t(`cls.dq.${k}`)}</option>)}
            </select>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---- Alle „Sieht nicht nach Pumpfoil aus"-Meldungen (Missbrauchs-Blick) ----
// Seit EINE Meldung genügt (Jan, 2026-07-27), ist das der Ausgleich: jede Meldung ist hier mit Melder
// sichtbar, „Meldungen insgesamt" macht Serien-Melder sofort erkennbar, und wer stört, verliert die
// Funktion. Die Meldungen selbst bleiben beim Sperren stehen — sie können ja berechtigt gewesen sein.
function FlagsTab() {
  const t = useT();
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = () => api.adminSessionFlags().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  if (!rows) return null;
  // Erledigte NICHT mehr in der Hauptliste: sobald die Zuordnung entschieden ist, ist die Meldung
  // abgearbeitet und verstopft nur den Blick auf das Offene (Jan, 29.07.). Sie bleibt aber
  // erreichbar -- als Melde-Historie ist sie der Missbrauchs-Blick, und Serien-Melder erkennt man
  // nur, wenn die alten Meldungen nicht verschwinden.
  const open = rows.filter((r) => r.needs_classification);
  const done = rows.filter((r) => !r.needs_classification);
  const flagRow = (r: Record<string, any>) => (
            <Card key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <Link to={`/sessions/${r.session_id}`} className="text-brand-700 hover:underline dark:text-brand-300">
                #{r.session_id}
              </Link>
              <span className="text-slate-400">{r.owner?.name ?? "—"}</span>
              <span className="text-slate-200">
                {t("adm.flags.by", { name: r.by?.name ?? "—", n: r.by?.flags_total ?? 0 })}
              </span>
              {r.note && <span className="italic text-slate-400">„{r.note}"</span>}
              {r.needs_classification && (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-800 dark:text-amber-200">
                  {t("cls.needsBadge")}
                </span>
              )}
              {r.by?.flag_blocked && (
                <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-700 dark:text-red-300">
                  {t("adm.flags.blocked")}
                </span>
              )}
              <button disabled={busy === r.by?.id}
                onClick={() => {
                  setBusy(r.by.id);
                  api.adminFlagBlock(r.by.id, !r.by.flag_blocked).then(load).catch(() => {}).finally(() => setBusy(null));
                }}
                className="ml-auto rounded-lg bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700 disabled:opacity-40">
                {r.by?.flag_blocked ? t("adm.flags.unblock") : t("adm.flags.block")}
              </button>
            </Card>
  );
  return (
    <div className="mt-6">
      <h3 className="mb-2 font-semibold">{t("adm.flags.title")}</h3>
      {open.length === 0 ? (
        <Card className="p-4 text-sm text-slate-300">{t("adm.flags.none")}</Card>
      ) : (
        <div className="space-y-2">{open.map(flagRow)}</div>
      )}
      {done.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-slate-300">
            {t("adm.flags.doneToggle", { n: done.length })}
          </summary>
          <div className="mt-2 space-y-2">{done.map(flagRow)}</div>
        </details>
      )}
    </div>
  );
}

// ---- Sportart JE NUTZER (docs/sport-classification.md) ----
// Für die Nutzer, die auf die Bitte „bitte richtig zuordnen" schlicht nicht reagieren. Bisher musste
// Jan dafür in die Datenbank. DREI GETRENNTE Knöpfe, weil es drei verschiedene Dinge sind:
//   * Profil-Standard -> wirkt nur für KÜNFTIGE Sessions
//   * offene Aufforderungen auflösen -> wirkt nur auf die BESTEHENDEN Sessions mit Aufforderung
//   * alle Sessions setzen -> alle bestehenden Sessions OHNE menschliches Urteil, auch wenn nie
//     jemand gemeldet hat (der Fall, den „Offene auflösen" nicht erreichen konnte)
// Die Anzahl steht VOR dem Klick am Knopf, damit niemand blind eine Massenänderung auslöst.
function UserSportTab() {
  const t = useT();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<AdminUserSport[] | null>(null);
  const load = () => api.adminUserSport(term || undefined).then(setRows).catch(() => setRows([]));
  useEffect(() => { setRows(null); load(); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mt-8">
      <h3 className="mb-2 font-semibold">{t("adm.usport.title")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("adm.usport.hint")}</p>
      <form onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }} className="mb-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adm.usport.search")}
          className="w-56 rounded-xl border border-slate-700 bg-white px-3 py-1.5 text-sm text-slate-100 dark:bg-slate-900" />
        <button className="rounded-xl bg-slate-800 px-3 text-sm text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700">
          {t("common.search")}
        </button>
      </form>
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <Card className="p-4 text-sm text-slate-300">
          {term ? t("adm.usport.noMatch") : t("adm.usport.none")}
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((u) => <UserSportRow key={u.id} u={u} onDone={load} />)}
        </div>
      )}
    </div>
  );
}

function UserSportRow({ u, onDone }: { u: AdminUserSport; onDone: () => void }) {
  const t = useT();
  const [sport, setSport] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, done: (r: any) => string) => {
    setBusy(true); setMsg(null);
    fn().then((r) => { setMsg(done(r)); onDone(); })
      .catch((e) => setMsg(t("adm.error") + e))
      .finally(() => setBusy(false));
  };
  const setDefault = () => {
    if (!sport) return;
    run(() => api.adminSetDefaultSport(u.id, sport), () => t("adm.usport.doneDefault", { sport: t(`cls.sport.${sport}`) }));
  };
  const resolve = () => {
    if (!sport || u.open_classifications === 0) return;
    if (!confirm(t("adm.usport.confirm", { n: u.open_classifications, sport: t(`cls.sport.${sport}`) }))) return;
    run(() => api.adminResolveClassifications(u.id, sport),
        (r) => t("adm.usport.doneResolve", { n: r?.resolved ?? 0 }));
  };
  const setAll = () => {
    if (!sport || u.sessions_unjudged === 0) return;
    if (!confirm(t("adm.usport.setAllConfirm", {
      n: u.sessions_unjudged, k: u.sessions_judged, sport: t(`cls.sport.${sport}`),
    }))) return;
    run(() => api.adminSetAllSport(u.id, sport),
        (r) => t("adm.usport.doneSetAll", { n: r?.changed ?? 0, k: r?.skipped ?? 0 }));
  };
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Avatar url={u.avatar_url} name={u.display_name} size={28} />
        <span className="font-semibold text-slate-100">{u.display_name ?? "—"}</span>
        <span className="text-slate-300">
          {t("adm.usport.default", { sport: t(`cls.sport.${u.default_sport_class}`) })}
        </span>
        <span className="text-slate-400">{t("adm.usport.sessions", { n: u.sessions })}</span>
        {u.open_classifications > 0 && (
          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-800 dark:text-amber-200">
            {t("adm.usport.open", { n: u.open_classifications })}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={sport} onChange={(e) => setSport(e.target.value)} disabled={busy}
          className="rounded-lg border border-slate-700 bg-white px-2 py-1.5 text-sm text-slate-100 dark:bg-slate-900">
          <option value="">{t("adm.usport.pick")}</option>
          {SPORTS.map((k) => <option key={k} value={k}>{t(`cls.sport.${k}`)}</option>)}
        </select>
        <button onClick={setDefault} disabled={busy || !sport}
          className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-sm font-medium text-slate-950 hover:bg-brand-400 disabled:opacity-40">
          {t("adm.usport.setDefault")}
        </button>
        <button onClick={resolve} disabled={busy || !sport || u.open_classifications === 0}
          className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-40">
          {u.open_classifications === 0
            ? t("adm.usport.resolveNone")
            : t("adm.usport.resolve", { n: u.open_classifications })}
        </button>
        <button onClick={setAll} disabled={busy || !sport || u.sessions_unjudged === 0}
          className="rounded-lg bg-red-500 px-2.5 py-1.5 text-sm font-medium text-slate-950 hover:bg-red-400 disabled:opacity-40">
          {u.sessions_unjudged === 0
            ? t("adm.usport.setAllNone")
            : t("adm.usport.setAll", { n: u.sessions_unjudged })}
        </button>
        {msg && <span className="text-sm text-slate-200">{msg}</span>}
      </div>
      {/* Was der Knopf NICHT anfasst — vor dem Klick sichtbar, nicht erst im Ergebnis. */}
      <p className="mt-2 text-sm text-slate-300">
        {t("adm.usport.setAllKeep", { k: u.sessions_judged })}
      </p>
    </Card>
  );
}

// Freigabe der Social-Kanaele (Jan, 30.08.). Drei Listen: was auf Freigabe wartet, was laeuft,
// und was Nutzer gemeldet haben. Freigeben loest den Kanal auf und prueft den RSS-Feed gegen —
// schlaegt das fehl, kommt eine sichtbare Fehlermeldung statt eines stummen Kanals.
function SocialTab() {
  const t = useT();
  const [d, setD] = useState<{ pending: AdminSocialChannel[]; approved: AdminSocialChannel[]; reported: AdminSocialItem[] } | null>(null);
  const [fehler, setFehler] = useState("");
  const laden = () => api.adminSocial().then(setD).catch(() => setD(null));
  useEffect(() => { laden(); }, []);

  const freigeben = async (uid: number) => {
    setFehler("");
    try { await api.adminSocialApprove(uid); await laden(); }
    catch (e: any) { setFehler(e?.message || "Freigabe fehlgeschlagen"); }
  };
  const ablehnen = async (uid: number) => {
    const grund = window.prompt(t("adm.social.rejectReason"), t("adm.social.rejectDefault"));
    if (grund == null) return;
    await api.adminSocialReject(uid, grund); await laden();
  };

  if (!d) return <Card className="p-5 text-slate-300">…</Card>;
  return (
    <div className="space-y-4">
      {fehler && <Card className="border-rose-700 p-3 text-sm text-rose-300">{fehler}</Card>}

      <Card className="p-5">
        <h3 className="mb-2 font-semibold">{t("adm.social.pending")} ({d.pending.length})</h3>
        {d.pending.length === 0 && <p className="text-sm text-slate-400">—</p>}
        {d.pending.map((k) => (
          <div key={k.user_id} className="flex flex-wrap items-center gap-2 border-t border-slate-800 py-2 text-sm">
            <span className="font-semibold">{k.user_name}</span>
            <a href={k.pending_url ?? "#"} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-brand-300 underline">{k.pending_url}</a>
            {k.url && <span className="text-xs text-slate-400">{t("adm.social.replaces")}: {k.url}</span>}
            <button onClick={() => freigeben(k.user_id)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">{t("adm.social.approve")}</button>
            <button onClick={() => ablehnen(k.user_id)} className="rounded-lg bg-slate-700 px-2.5 py-1 text-xs">{t("adm.social.reject")}</button>
          </div>
        ))}
      </Card>

      <Card className="p-5">
        <h3 className="mb-2 font-semibold">{t("adm.social.approved")} ({d.approved.length})</h3>
        {d.approved.map((k) => (
          <div key={k.user_id} className="flex flex-wrap items-center gap-2 border-t border-slate-800 py-2 text-sm">
            <span className="font-semibold">{k.user_name}</span>
            <a href={k.url ?? "#"} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-brand-300 underline">{k.url}</a>
            <span className="text-xs text-slate-400">{k.videos} {t("adm.social.videos")}</span>
            {k.blocked && <span className="rounded bg-rose-900/60 px-1.5 py-0.5 text-xs text-rose-200">{t("adm.social.blocked")}</span>}
            {/* Eindeutig benennen: in diesem Tab gibt es ZWEI Sperren — eines fuer den ganzen
                Kanal, eines fuer ein einzelnes Video. „Sperren" allein war nicht zu unterscheiden
                (Jan suchte den Kanal-Schalter und fand ihn nicht). */}
            <button onClick={async () => { await api.adminSocialBlock(k.user_id, !k.blocked); laden(); }}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${k.blocked ? "bg-emerald-700 text-white" : "bg-rose-800 text-white"}`}>
              {k.blocked ? t("adm.social.unblockChannel") : t("adm.social.blockChannel")}
            </button>
          </div>
        ))}
      </Card>

      <Card className="p-5">
        <h3 className="mb-2 font-semibold">{t("adm.social.reported")} ({d.reported.length})</h3>
        {d.reported.length === 0 && <p className="text-sm text-slate-400">—</p>}
        {d.reported.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-2 border-t border-slate-800 py-2 text-sm">
            <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-xs text-amber-200">{v.reports}×</span>
            <a href={v.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-brand-300 underline">{v.title || v.url}</a>
            {/* Ohne „aufheben" bliebe nur sperren — eine unberechtigte Meldung waere damit ein
                stilles Urteil ueber ein Video, das in Ordnung ist. */}
            <button onClick={async () => { await api.adminSocialDismiss(v.id); laden(); }}
              className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs text-white">
              {t("adm.social.dismiss")}
            </button>
            <button onClick={async () => { await api.adminSocialBlockItem(v.id, !v.blocked); laden(); }}
              className="rounded-lg bg-slate-700 px-2.5 py-1 text-xs">
              {v.blocked ? t("adm.social.unblockVideo") : t("adm.social.blockVideo")}
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}

// Ein Feedback-Anhang. Die Datei liegt hinter einer admin-geschuetzten Route, ein blosses
// <img src> bekaeme deshalb nur „Missing bearer token" — also holen wir sie mit unserem Token
// und zeigen sie aus einer Blob-URL. Die wird beim Verlassen wieder freigegeben.
function Anhang({ a }: { a: { id: number; kind: string; filename: string | null; bytes: number } }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    let tot = false;
    let erzeugt: string | null = null;
    api.adminFeedbackAttachment(a.id)
      .then((b) => {
        if (tot) return;
        erzeugt = URL.createObjectURL(b);
        setUrl(erzeugt);
      })
      .catch(() => { if (!tot) setFehler(true); });
    return () => { tot = true; if (erzeugt) URL.revokeObjectURL(erzeugt); };
  }, [a.id]);

  const groesse = `${Math.max(1, Math.round(a.bytes / 1024))} kB`;
  if (fehler) return <span className="text-xs text-rose-400">{a.filename} (nicht ladbar)</span>;
  if (!url) return <span className="text-xs text-slate-500">{a.filename} …</span>;
  if (a.kind === "image") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" title={`${a.filename ?? ""} · ${groesse}`}>
        <img src={url} alt={a.filename ?? ""}
          className="h-24 w-auto rounded-lg border border-slate-700 object-cover hover:border-slate-500" />
      </a>
    );
  }
  return (
    <a href={url} download={a.filename || "anhang.txt"}
      className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-brand-300 underline hover:bg-slate-700">
      {a.filename || "Datei"} · {groesse}
    </a>
  );
}
