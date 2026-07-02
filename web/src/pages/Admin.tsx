import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, AdminSession, AdminUser, AdminPhoto, AdminOverview, AdminAuditEntry, AdminFeedback, OverallStats, ChatMsg, UserFilter } from "../lib/api";
import { Card, Spinner, ErrorBox, Avatar, NewBadge } from "../components/ui";
import { FlagIcon, FakeIcon, HeartIcon, CameraIcon, LocationIcon } from "../components/Icons";
import { useT } from "../i18n";

type Tab = "overview" | "flagged" | "fake" | "sessions" | "deleted" | "users" | "photos" | "chat" | "audit" | "feedback";
const TABS: [Tab, string][] = [
  ["overview", "adm.tab.overview"],
  ["flagged", "adm.tab.flagged"],
  ["fake", "adm.tab.fake"],
  ["users", "adm.tab.users"],
  ["photos", "adm.tab.photos"],
  ["chat", "adm.tab.chat"],
  ["sessions", "adm.tab.sessions"],
  ["deleted", "adm.tab.deleted"],
  ["feedback", "adm.tab.feedback"],
  ["audit", "adm.tab.audit"],
];

export default function Admin() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.find(([k]) => k === sp.get("tab"))?.[0] ?? "overview") as Tab;
  const setTab = (tb: Tab) => setSp(new URLSearchParams({ tab: tb }));  // frischer Tab (Suche/Filter weg)
  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold">{t("adm.title")}</h2>
      <p className="mb-4 text-sm text-slate-300">{t("adm.subtitle")}</p>
      <div className="mb-5 flex flex-wrap gap-1">
        {TABS.map(([k, labelKey]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-xs ${tab === k ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab />}
      {tab === "flagged" && <SessionsTab scope="flagged" />}
      {tab === "fake" && <SessionsTab scope="fake" />}
      {tab === "sessions" && <SessionsTab scope="all" />}
      {tab === "deleted" && <SessionsTab scope="deleted" />}
      {tab === "users" && <UsersTab />}
      {tab === "photos" && <PhotosTab />}
      {tab === "chat" && <ChatModTab />}
      {tab === "feedback" && <FeedbackTab />}
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
  const cells: [string, number][] = [
    ["adm.ov.users", data.users], ["adm.ov.blocked", data.users_blocked], ["adm.ov.admins", data.admins],
    ["adm.ov.sessions", data.sessions], ["adm.ov.pumpfoil", data.pumpfoil], ["adm.ov.deleted", data.sessions_deleted],
    ["adm.ov.flaggedOpen", data.flagged], ["adm.ov.reported", data.reported],
    ["adm.ov.photos", data.photos], ["adm.ov.photosBlocked", data.photos_blocked], ["adm.ov.likes", data.likes],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {cells.map(([labelKey, v]) => (
        <Card key={labelKey} className="p-3">
          <div className="text-2xl font-bold tabular-nums text-brand-400">{v}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-300">{t(labelKey)}</div>
        </Card>
      ))}
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
  const [total, setTotal] = useState<number | null>(null);
  const toggle = (k: keyof UserFilter) => setFilter((f) => ({ ...f, [k]: !f[k] }));
  const { items, setItems, loading, sentinel } = useInfinite<AdminUser>(
    (off) => api.adminUsers(query, 30, off, filter),
    [query, filter.normal, filter.tester, filter.admin, filter.new]);
  useEffect(() => {
    setTotal(null);
    api.adminUsersCount(query, filter).then((r) => setTotal(r.total)).catch(() => {});
  }, [query, filter.normal, filter.tester, filter.admin, filter.new]);
  const upd = (id: number, patch: Partial<AdminUser>) =>
    setItems((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); setQuery(q); }} className="mb-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adm.searchUsers")}
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
        <button className="rounded-xl bg-slate-800 px-4 text-sm text-slate-200">{t("common.search")}</button>
      </form>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {FILTER_KEYS.map((k) => (
          <label key={k} className="flex cursor-pointer select-none items-center gap-1.5 text-sm text-slate-300">
            <input type="checkbox" checked={filter[k]} onChange={() => toggle(k)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-brand-500 focus:ring-brand-500" />
            {t(`adm.filter.${k}`)}
          </label>
        ))}
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
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/admin?tab=sessions&user=${u.id}`} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600">{t("adm.sessionsLink")}</Link>
          <button onClick={toggleStats} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600">{open ? t("adm.statsHide") : t("adm.statsShow")}</button>
          <button onClick={() => setEdit((v) => !v)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${edit ? "bg-brand-600 text-white hover:bg-brand-500" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}>{edit ? t("adm.editClose") : t("adm.edit")}</button>
          {edit && <>
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
          </>}
        </div>
      </div>
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
