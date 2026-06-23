import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration } from "react-router-dom";
import { api, clearToken, OverallStats, StatRecord, Profile } from "./lib/api";
import { Avatar } from "./components/ui";
import { WaveIcon, ListIcon, WatchIcon, LogoutIcon, ChartIcon, SettingsIcon, ShieldIcon, CommunityIcon } from "./components/Icons";
import { useI18n } from "./i18n";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { UploadFitButton } from "./components/UploadFitButton";

type NavItem = { to: string; labelKey: string; shortKey?: string; icon: (p: { className?: string }) => JSX.Element; end: boolean };
const navItems: NavItem[] = [
  { to: "/", labelKey: "home.community", icon: CommunityIcon, end: true },
  { to: "/sessions", labelKey: "nav.mySessions", shortKey: "nav.mySessions.short", icon: ListIcon, end: false },
  { to: "/alle-sessions", labelKey: "nav.allSessions", shortKey: "nav.allSessions.short", icon: WaveIcon, end: false },
  { to: "/verlauf", labelKey: "nav.history", icon: ChartIcon, end: false },
  { to: "/account", labelKey: "nav.watch", icon: WatchIcon, end: false },
  { to: "/einstellungen", labelKey: "nav.profile", icon: SettingsIcon, end: false },
];
const adminItem: NavItem = { to: "/admin", labelKey: "nav.admin", icon: ShieldIcon, end: false };

export default function App() {
  const { t, setLang } = useI18n();
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [accelOnly, setAccelOnly] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    api.stats(accelOnly).then(setStats).catch(() => {});
  }, [accelOnly]);
  useEffect(() => {
    api.getProfile().then((p) => {
      setProfile(p);
      setIsAdmin(p.is_admin);
      // Serverseitig gespeicherte Sprachpräferenz anwenden (ohne erneut zu sichern).
      if (p.language) setLang(p.language as any, { persist: false });
    }).catch(() => {});
    // Profil-Änderungen (Avatar/Name in den Einstellungen) sofort übernehmen.
    const h = (e: Event) => setProfile((e as CustomEvent).detail);
    window.addEventListener("foil:profile", h);
    return () => window.removeEventListener("foil:profile", h);
  }, [setLang]);

  const items = isAdmin ? [...navItems, adminItem] : navItems;

  function logout() {
    clearToken();
    // Harte Navigation: Auth-Token ist kein reaktiver State, sonst bliebe die
    // App-Shell bis zum Reload gemountet -> Landing wird so garantiert frisch geladen.
    window.location.assign("/");
  }

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <ScrollRestoration />
      <FeedbackWidget />
      {/* Desktop-Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-slate-800/60 p-4 md:flex">
        <Link to="/" className="mb-4 flex items-center gap-2 px-2 text-lg font-bold">
          <WaveIcon className="h-6 w-6 text-brand-400" /> Pumpfoil
        </Link>
        {profile && (
          <Link to="/" className="mb-4 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-900">
            <Avatar name={profile.display_name} url={profile.avatar_url} size={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">{profile.display_name || "—"}</div>
              <div className="truncate text-[11px] text-slate-400">{profile.email}</div>
            </div>
          </Link>
        )}
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900 hover:text-slate-200"
              }`
            }
          >
            <it.icon /> {t(it.labelKey)}
          </NavLink>
        ))}

        <UploadFitButton className="mt-3 w-full text-sm" />

        {stats && stats.count > 0 && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("side.total")}
            </div>
            <SideStat label={t("side.sessions")} value={String(stats.count)} />
            <SideStat label={t("stat.runs")} value={String(stats.runs_total)} />
            <SideStat label={t("side.foiling")} value={`${stats.foiling_km.toFixed(1)} km`} />
            <SideStat label={t("side.foilingTime")} value={fmtDuration(stats.foiling_min)} />
            <SideStat label={t("side.pumps")} value={stats.pumps.toLocaleString("de")} />
            <div className="my-3 border-t border-slate-800" />
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("side.records")}</span>
              <button
                onClick={() => setAccelOnly((v) => !v)}
                title={t("side.recordsHint")}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${accelOnly ? "bg-brand-500/20 text-brand-300" : "bg-slate-800 text-slate-300"}`}
              >
                {accelOnly ? t("side.onlyAccel") : t("side.all")}
              </button>
            </div>
            <RecordStat label={t("rec.farthestRun")} rec={stats.records.distance} fmt={(v) => `${Math.round(v)} m`} />
            <RecordStat label={t("rec.longestRun")} rec={stats.records.duration} fmt={(v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`} />
            <RecordStat label={t("rec.topSpeed")} rec={stats.records.speed} fmt={(v) => `${(v * 3.6).toFixed(1)} km/h`} />
            <RecordStat label={t("rec.longestGlide")} rec={stats.records.glide} fmt={(v) => `${v.toFixed(1)} s`} />
            <RecordStat label={t("rec.mostRuns")} rec={stats.records.runs} fmt={(v) => `${Math.round(v)}`} />
          </div>
        )}

        <button
          onClick={logout}
          className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-slate-900 hover:text-slate-200"
        >
          <LogoutIcon /> {t("nav.logout")}
        </button>
        <Link to="/impressum" className="mt-2 px-3 text-xs text-slate-400 hover:text-slate-300">
          {t("nav.imprint")}
        </Link>
      </aside>

      {/* Mobile-Topbar */}
      <header className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3 md:hidden">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <WaveIcon className="h-6 w-6 text-brand-400" /> Pumpfoil
        </Link>
        <div className="flex items-center gap-3">
          <UploadFitButton className="px-3 py-1.5 text-xs" />
          <button onClick={logout} className="text-slate-300" aria-label={t("nav.logout")}>
            <LogoutIcon />
          </button>
        </div>
      </header>

      {/* Inhalt */}
      <main className="min-w-0 flex-1 overflow-x-clip px-4 py-5 pb-24 md:px-8 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile-Bottom-Nav */}
      <nav className="fixed inset-x-0 bottom-0 z-[1000] flex border-t border-slate-800 bg-slate-950/95 backdrop-blur md:hidden">
        {navItems.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-3 text-xs ${
                isActive ? "text-brand-400" : "text-slate-400"
              }`
            }
          >
            <it.icon /> {it.shortKey ? t(it.shortKey) : t(it.labelKey)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function SideStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-sm text-slate-300">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function RecordStat({ label, rec, fmt }: { label: string; rec: StatRecord; fmt: (v: number) => string }) {
  const row = (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-sm text-slate-300">{label}</span>
      <span className="font-semibold tabular-nums text-slate-200">{rec.value ? fmt(rec.value) : "–"}</span>
    </div>
  );
  return rec.session_id ? (
    <Link
      to={`/sessions/${rec.session_id}${rec.run_idx != null ? `?run=${rec.run_idx}` : ""}`}
      className="-mx-1 block rounded-lg px-1 hover:bg-slate-800/60"
    >
      {row}
    </Link>
  ) : (
    row
  );
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min.toFixed(0)} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${Math.round(min - h * 60)} min`;
}
