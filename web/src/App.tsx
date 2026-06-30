import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration } from "react-router-dom";
import { api, clearToken, Profile } from "./lib/api";
import { Avatar } from "./components/ui";
import { ListIcon, LogoutIcon, ChartIcon, SettingsIcon, ShieldIcon, CommunityIcon, SpotsIcon, HomeIcon, ChatBubbleIcon, NerdIcon } from "./components/Icons";
import { Wordmark } from "./components/Wordmark";
import { useI18n } from "./i18n";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { CompareBar } from "./components/CompareBar";
import { InstallPwa } from "./components/InstallPwa";
import { warmMySessions, warmMedia } from "./lib/pwaCache";

type NavItem = { to: string; labelKey: string; shortKey?: string; icon: (p: { className?: string }) => JSX.Element; end: boolean };
const navItems: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: HomeIcon, end: true },
  { to: "/community", labelKey: "home.community", icon: CommunityIcon, end: false },
  { to: "/sessions", labelKey: "nav.sessions", icon: ListIcon, end: false },
  { to: "/chat", labelKey: "nav.chat", icon: ChatBubbleIcon, end: false },
  { to: "/verlauf", labelKey: "nav.history", icon: ChartIcon, end: false },
  { to: "/spots", labelKey: "nav.spots", icon: SpotsIcon, end: false },
  { to: "/einstellungen", labelKey: "nav.profile", icon: SettingsIcon, end: false },
];
const adminItem: NavItem = { to: "/admin", labelKey: "nav.admin", icon: ShieldIcon, end: false };

export default function App() {
  const { t, setLang } = useI18n();
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Letzte 10 eigene Sessions für Offline vorladen (nur was nicht schon gecacht ist).
  useEffect(() => { warmMySessions(); }, []);
  useEffect(() => {
    api.getProfile().then((p) => {
      setProfile(p);
      setIsAdmin(p.is_admin);
      warmMedia([p.avatar_url]);   // eigenes Profilbild offline-sicher vorladen
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
      <CompareBar />
      {/* Desktop-Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-slate-800/60 p-4 md:flex">
        <Link to="/" className="mb-4 px-2">
          <Wordmark icon="h-6 w-6" text="text-lg" />
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
                isActive ? "bg-slate-800 nav-active" : "text-slate-300 hover:bg-slate-900 hover:text-slate-200"
              }`
            }
          >
            <it.icon /> {t(it.labelKey)}
          </NavLink>
        ))}

        <Link
          to="/import"
          className="mt-3 w-full rounded-xl bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400"
        >
          {t("import.title")}
        </Link>

        <InstallPwa className="mt-3" />

        <button
          onClick={logout}
          className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-slate-900 hover:text-slate-200"
        >
          <LogoutIcon /> {t("nav.logout")}
        </button>
        <Link to="/nerd-analysen" className="mt-2 flex items-center gap-1.5 px-3 text-xs text-slate-400 hover:text-slate-300" title="Dual-Watch-Pumpfoil-Experiment">
          <NerdIcon className="h-4 w-4" /> Nerd-Analysen
        </Link>
        <Link to="/impressum" className="mt-1 px-3 text-xs text-slate-400 hover:text-slate-300">
          {t("nav.imprint")}
        </Link>
      </aside>

      {/* Mobile-Topbar */}
      <header className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3 md:hidden">
        <Link to="/">
          <Wordmark icon="h-6 w-6" text="text-lg" />
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/import" className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-brand-400">
            {t("import.title")}
          </Link>
          <button onClick={logout} className="text-slate-300" aria-label={t("nav.logout")}>
            <LogoutIcon />
          </button>
        </div>
      </header>

      {/* Inhalt */}
      {/* pb groß genug, dass Seiteninhalt über die mobile Tab-Leiste UND den
          schwebenden Vergleichs-Button (CompareBar, bottom-20) gescrollt werden kann. */}
      <main className="min-w-0 flex-1 overflow-x-clip px-4 py-5 pb-32 md:px-8 md:pb-20">
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
                isActive ? "nav-active" : "text-slate-200"
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
