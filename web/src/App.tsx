import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration } from "react-router-dom";
import { api, clearToken, Profile } from "./lib/api";
import { Avatar } from "./components/ui";
import { ListIcon, LogoutIcon, ChartIcon, SettingsIcon, ShieldIcon, CommunityIcon, SpotsIcon, HomeIcon, FoilIcon, ServerIcon, UploadIcon } from "./components/Icons";
import { ThemeToggle } from "./components/ThemeToggle";
import { useI18n } from "./i18n";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { DmWidget } from "./components/DmWidget";
import { CompareBar } from "./components/CompareBar";
import { InstallPwa } from "./components/InstallPwa";
import { warmMySessions, warmMedia } from "./lib/pwaCache";

type NavItem = { to: string; labelKey: string; shortKey?: string; icon: (p: { className?: string }) => JSX.Element; end: boolean };
const navItems: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: HomeIcon, end: true },
  { to: "/community", labelKey: "home.community", icon: CommunityIcon, end: false },
  { to: "/sessions?scope=all", labelKey: "nav.sessions", icon: ListIcon, end: false },
  { to: "/verlauf", labelKey: "nav.history", icon: ChartIcon, end: false },
  { to: "/spots", labelKey: "nav.spots", icon: SpotsIcon, end: false },
  { to: "/einstellungen", labelKey: "nav.profile", icon: SettingsIcon, end: false },
];
const adminItem: NavItem = { to: "/admin", labelKey: "nav.admin", icon: ShieldIcon, end: false };

// Brand-Logo = horizontales Lockup (assets-master, 3 versetzte Wellen). dark-Bild
// (weisser Text) auf dunklem UI, light-Bild (navy Text) im Light-Mode — CSS-Swap
// via .logo-dark/.logo-light (index.css). Ersetzt das alte 2-Wellen-<Wordmark>.
function BrandLogo({ className = "h-9" }: { className?: string }) {
  const alt = "pumpfoil.org — track every pump";
  return (
    <>
      <img src="/wordmark-h-dark.png" alt={alt} className={`logo-dark ${className} max-w-none`} />
      <img src="/wordmark-h-light.png" alt={alt} className={`logo-light ${className} max-w-none`} />
    </>
  );
}

export default function App() {
  const { t, setLang } = useI18n();
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pending, setPending] = useState(0);   // offene Moderation (gemeldet + unecht) fürs Admin-Badge

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

  // Nur für Admins: offene Moderationsaufgaben zählen (leichtes Endpoint) — Badge im Menü.
  useEffect(() => {
    if (!isAdmin) return;
    api.adminPending().then((r) => setPending(r.total)).catch(() => {});
  }, [isAdmin]);

  // Social-Freigabe — für unter 13 gesperrt (Apple-Vorgabe). Age-Gate blendet NUR Chat/DM aus;
  // Foilers/Community ANSEHEN ist erlaubt (Server erlaubt Lesen, sperrt Chat/Schreiben per 403).
  const social = profile?.social_allowed !== false;
  const items = isAdmin ? [...navItems, adminItem] : navItems;

  function logout() {
    clearToken();
    // Harte Navigation: Auth-Token ist kein reaktiver State, sonst bliebe die
    // App-Shell bis zum Reload gemountet -> Landing wird so garantiert frisch geladen.
    window.location.assign("/");
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-950 md:flex-row">
      <ScrollRestoration />
      <FeedbackWidget />
      {social && <DmWidget />}
      <CompareBar />
      {/* Desktop-Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-slate-800/60 px-4 pb-4 pt-2 md:flex">
        <Link to="/" className="mb-3 block px-1"><BrandLogo className="w-full h-auto" /></Link>
        {profile && (
          <Link to="/" className="mb-2 flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-900">
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
            <it.icon /> <span className="flex-1">{t(it.labelKey)}</span>
            {it.to === "/admin" && pending > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-950" title={t("nav.adminPending")}>{pending}</span>
            )}
          </NavLink>
        ))}

        <Link
          to="/import"
          className="mt-3 w-full rounded-xl bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400"
        >
          {t("import.title")}
        </Link>

        <InstallPwa className="mt-3" />

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={logout}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-slate-900 hover:text-slate-200"
          >
            <LogoutIcon /> {t("nav.logout")}
          </button>
          <ThemeToggle className="shrink-0" />
        </div>
        <NavLink to="/nerd-analysen" end title="On-Foil-/Pump-Erkennung: Dual-Watch-Experiment + wie es funktioniert"
          className={({ isActive }) => `mt-2 flex items-center gap-1.5 px-3 text-xs ${isActive ? "font-semibold text-brand-400" : "text-slate-400 hover:text-slate-300"}`}>
          <FoilIcon className="h-4 w-4" /> On-Foil / Pump Detection
        </NavLink>
        <NavLink to="/nerd-analysen-2" end title="Wie die Erkennung funktioniert (Signalverarbeitung, ML, Labeling)"
          className={({ isActive }) => `mt-1 flex items-center gap-1.5 px-3 pl-[26px] text-xs ${isActive ? "font-semibold text-brand-400" : "text-slate-400 hover:text-slate-300"}`}>
          ↳ Teil 2: Wie es funktioniert
        </NavLink>
        <NavLink to="/nerd-analysen-3" end title="Doppeluhr-Messung: aktuelle Ergebnisse (Pump-/Glide-Wahrheit)"
          className={({ isActive }) => `mt-1 flex items-center gap-1.5 px-3 pl-[26px] text-xs ${isActive ? "font-semibold text-brand-400" : "text-slate-400 hover:text-slate-300"}`}>
          ↳ Teil 3: Doppeluhr-Messung
        </NavLink>
        <NavLink to="/systemarchitektur" end title="Systemarchitektur: Stack, Datenbank, Sicherheit, Datenschutz"
          className={({ isActive }) => `mt-2 flex items-center gap-1.5 px-3 text-xs ${isActive ? "font-semibold text-brand-400" : "text-slate-400 hover:text-slate-300"}`}>
          <ServerIcon className="h-4 w-4" /> Systemarchitektur
        </NavLink>
        <Link to="/impressum" className="mt-1 px-3 text-xs text-slate-400 hover:text-slate-300">
          {t("nav.imprint")}
        </Link>
      </aside>

      {/* Mobile-Topbar (Safe-Area oben fuer iPhone-Notch/Statusleiste) */}
      <header
        className="flex items-center justify-between border-b border-slate-800/60 px-4 pb-3 md:hidden"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <Link to="/">
          <BrandLogo className="h-7" />
        </Link>
        <div className="flex items-center gap-2">
          {/* Import/Upload auch mobil erreichbar (Konten-Verknüpfung + FIT-Upload liegen dort). */}
          <Link
            to="/import"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-brand-400"
          >
            <UploadIcon className="h-4 w-4" /> {t("import.short")}
          </Link>
          <ThemeToggle />
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

      {/* Mobile-Bottom-Nav (Safe-Area unten fuer iPhone-Home-Indicator) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-[1000] flex border-t border-slate-800 bg-slate-950/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
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
