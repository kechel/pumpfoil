import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, AdminSession, AdminUser, AdminPhoto, AdminOverview, AdminAuditEntry, AdminFeedback, OverallStats, ChatMsg, UserFilter, UserSort, AdminUserActivity, StatKey, NewsBanner } from "../lib/api";
import { Card, Spinner, ErrorBox, Avatar, NewBadge } from "../components/ui";
import { FlagIcon, FakeIcon, HeartIcon, CameraIcon, LocationIcon } from "../components/Icons";
import { useT } from "../i18n";

type Tab = "overview" | "flagged" | "fake" | "sessions" | "deleted" | "users" | "photos" | "chat" | "spots" | "audit" | "feedback" | "news";
const TABS: [Tab, string][] = [
  ["overview", "adm.tab.overview"],
  ["flagged", "adm.tab.flagged"],
  ["fake", "adm.tab.fake"],
  ["users", "adm.tab.users"],
  ["photos", "adm.tab.photos"],
  ["chat", "adm.tab.chat"],
  ["spots", "adm.tab.spots"],
  ["sessions", "adm.tab.sessions"],
  ["deleted", "adm.tab.deleted"],
  ["feedback", "adm.tab.feedback"],
  ["news", "adm.tab.news"],
  ["audit", "adm.tab.audit"],
];

export default function Admin() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.find(([k]) => k === sp.get("tab"))?.[0] ?? "overview") as Tab;
  const setTab = (tb: Tab) => setSp(new URLSearchParams({ tab: tb }));  // frischer Tab (Suche/Filter weg)
  return (
    <div>
      <nav className="mb-5 flex flex-wrap gap-0.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        {TABS.map(([k, labelKey]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${tab === k ? "bg-brand-500 font-semibold text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"}`}
          >
            {t(labelKey)}
          </button>
        ))}
      </nav>
      {tab === "overview" && <OverviewTab />}
      {tab === "flagged" && <SessionsTab scope="flagged" />}
      {tab === "fake" && <SessionsTab scope="fake" />}
      {tab === "sessions" && <SessionsTab scope="all" />}
      {tab === "deleted" && <SessionsTab scope="deleted" />}
      {tab === "users" && <UsersTab />}
      {tab === "photos" && <PhotosTab />}
      {tab === "chat" && <ChatModTab />}
      {tab === "spots" && <SpotsTab />}
      {tab === "feedback" && <FeedbackTab />}
      {tab === "news" && <NewsTab />}
      {tab === "audit" && <AuditTab />}
    </div>
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
  );
}

// ---------------------------------------------------------------- News-Banner ----
const NEWS_LANGS: [string, string][] = [
  ["de", "Deutsch"], ["gsw", "Schwiizerdütsch"], ["de-AT", "Österreichisch"],
  ["en", "English"], ["fr", "Français"], ["it", "Italiano"], ["es", "Español"],
];

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
      </Card>
      <div className="space-y-2">
        {NEWS_LANGS.map(([l, label]) => (
          <div key={l}>
            <div className="mb-0.5 text-xs text-slate-400">{label}</div>
            <textarea value={n.texts[l] || ""} onChange={(e) => setText(l, e.target.value)} rows={2}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
          {saving ? "…" : saved ? t("adm.news.saved") : t("adm.news.save")}
        </button>
        <span className="text-xs text-slate-400">{t("adm.news.hint")}</span>
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
  fake: "adm.hint.fake",
  all: "adm.hint.all",
  deleted: "adm.hint.deleted",
};

const PAGE = 30;

function SessionsTab({ scope }: { scope: "flagged" | "fake" | "all" | "deleted" }) {
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
                {s.likes > 0 && <Badge tone="slate"><HeartIcon className="inline h-3.5 w-3.5" filled /> {s.likes}</Badge>}
                {s.photos > 0 && <Badge tone="slate"><CameraIcon className="inline h-3.5 w-3.5" /> {s.photos}</Badge>}
                {s.flagged && <Badge tone="red">{t("adm.hidden")}</Badge>}
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
                    <Act tone="red" confirm={t("adm.deleteSessionConfirm")} onClick={() => api.adminDeleteSession(s.session_id).then(() => upd(s.session_id, { deleted: true }))}>{t("adm.delete")}</Act>
                  </>
                )}
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
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={u.display_name} url={u.avatar_url} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-100">
            {u.display_name || <span className="text-slate-400">{t("adm.noName")}</span>}
            {u.is_admin && <span className="ml-1"><Badge tone="green">{t("adm.adminBadge")}</Badge></span>}
            {u.blocked && <span className="ml-1"><Badge tone="red">{t("adm.blockedBadge")}</Badge></span>}
            {u.hidden && <span className="ml-1"><Badge tone="amber">{t("adm.testerBadge")}</Badge></span>}
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
      {data.map((f) => (
        <Card key={f.id} className="flex items-start gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs text-slate-400">
              <span className="font-medium text-brand-300">{f.name}</span>
              <span>{f.at ? new Date(f.at).toLocaleString() : ""}</span>
              {f.url && <a href={f.url} className="truncate text-slate-400 underline hover:text-slate-200">{f.url}</a>}
            </div>
            <div className="whitespace-pre-wrap text-sm text-slate-100">{f.text}</div>
          </div>
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
