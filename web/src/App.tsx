import { useEffect, useState } from "react";
import type React from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { FeedbackRequestBanner } from "./components/FeedbackRequestBanner";
import { api, clearToken, Profile } from "./lib/api";
import { applyPumpUnit } from "./lib/pumpRate";
import { clearLastSession } from "./lib/lastSession";
import { Avatar } from "./components/ui";
import { SessionsIcon, LogoutIcon, ChartIcon, SettingsIcon, ShieldIcon, CommunityIcon, SpotsIcon, HomeIcon, FoilIcon, ServerIcon, UploadIcon, ChevronIcon } from "./components/Icons";
import { ThemeToggle } from "./components/ThemeToggle";
import { useI18n, useT } from "./i18n";
import { CHANGELOG_SEEN_KEY, abonnieren, neuestesDatum } from "./lib/changelogLatest";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { DmWidget } from "./components/DmWidget";
import { CompareBar } from "./components/CompareBar";
import { InstallPwa } from "./components/InstallPwa";
import { warmMySessions, warmMedia, raeumeAlteCaches } from "./lib/pwaCache";
import { demoStart } from "./lib/demoNames";
import { istOffen } from "./pages/Onboarding";

type NavItem = { to: string; labelKey: string; shortKey?: string; icon: (p: { className?: string }) => JSX.Element; end: boolean };
const navItems: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: HomeIcon, end: true },
  { to: "/community", labelKey: "home.community", icon: CommunityIcon, end: false },
  { to: "/sessions?scope=all", labelKey: "nav.sessions", icon: SessionsIcon, end: false },
  { to: "/verlauf", labelKey: "nav.history", icon: ChartIcon, end: false },
  { to: "/spots", labelKey: "nav.spots", icon: SpotsIcon, end: false },
  { to: "/einstellungen", labelKey: "nav.profile", icon: SettingsIcon, end: false },
];
const adminItem: NavItem = { to: "/admin", labelKey: "nav.admin", icon: ShieldIcon, end: false };

// Englisches Changelog-Datum ("July 21, 2026") -> kurzes Datum im Locale des Nutzers
// fürs Menü-Badge (die Changelog-Seite selbst bleibt englisch). Fällt bei Fehler auf EN zurück.
function shortDate(d: string, lang: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  try {
    return new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" }).format(dt);
  } catch {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(dt);
  }
}

// Menü-Link "Neuerungen" mit Datums-Badge des neuesten Eintrags. Gelb hervorgehoben,
// solange der neueste Eintrag ungesehen ist (localStorage); klärt sich beim Öffnen.
function ChangelogLink() {
  const { t, lang } = useI18n();
  const loc = useLocation();
  const [seen, setSeen] = useState<string | null>(() => {
    try { return localStorage.getItem(CHANGELOG_SEEN_KEY); } catch { return null; }
  });
  // Das Datum kommt seit 07.09.2026 vom Server (der Changelog liegt in der DB), nicht mehr aus
  // einer Konstante. `abonnieren` holt es hoechstens einmal je Seitenaufruf.
  const [neuestes, setNeuestes] = useState(neuestesDatum());
  useEffect(() => abonnieren(setNeuestes), []);
  useEffect(() => {
    if (loc.pathname === "/changelog" && neuestes) {
      try { localStorage.setItem(CHANGELOG_SEEN_KEY, neuestes); } catch { /* ignore */ }
      setSeen(neuestes);
    }
  }, [loc.pathname, neuestes]);
  // Ohne Datum (erster Start, Abruf noch offen) NICHT hervorheben — sonst leuchtet das Badge
  // bei jedem Kaltstart kurz auf, als gaebe es Neues.
  const unseen = !!neuestes && seen !== neuestes;
  // Label bleibt neutral (wie die anderen Menü-Links); nur das Badge wird hervorgehoben.
  // Beide Modi setzen (light-mode-contrast-pattern): Base = dunkler Text, dark: = hell.
  // Halbtransparenter BG (Alpha) statt dark:-BG-Swap -> in keinem Modus ein dunkler Kasten,
  // nur dezentes Grau/Amber. Text: Light-Base + dark:-Variante (light-mode-contrast-pattern).
  const badge = unseen
    ? "bg-amber-400/25 text-amber-700 dark:text-amber-300"
    : "bg-slate-400/20 text-slate-600 dark:text-slate-400";
  return (
    <Link to="/changelog"
      className="mt-2 flex items-center gap-1.5 px-3 text-xs text-slate-400 hover:text-slate-400 dark:hover:text-slate-300">
      {t("nav.changelog")}
      {neuestes && (
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge}`}>
          {shortDate(neuestes, lang)}
        </span>
      )}
    </Link>
  );
}

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

/**
 * Der App-Rahmen. Nimmt optional `children` statt der Route-`Outlet`.
 *
 * Warum (Jan, 07.09.2026): die vier Textseiten (Nerd-Analysen 1-3, Systemarchitektur) liegen
 * seit dem SEO-Umbau AUSSERHALB dieses Rahmens, damit Google sie ohne Login sieht. Fuer
 * Angemeldete sah das dann nackt aus — kein Menue, kein Zurueck, „sehr doof, wenn man da
 * reingeht". Mit `children` kann dieselbe Seite in beiden Welten leben: fuer Gaeste blank,
 * fuer Angemeldete im gewohnten Rahmen.
 */
export default function App({ children }: { children?: React.ReactNode } = {}) {
  const { t, setLang } = useI18n();
  // Import-Button (Sidebar + Mobile-Topbar) nur auf der Sessions-Seite zeigen —
  // dort gehört der FIT-Upload hin; im Profil gibt es einen eigenen Einstieg.
  const ort = useLocation();
  const nav = useNavigate();
  const onSessions = ort.pathname.startsWith("/sessions");
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pending, setPending] = useState(0);   // offene Moderation (gemeldet + unecht) fürs Admin-Badge

  // Letzte 10 eigene Sessions für Offline vorladen (nur was nicht schon gecacht ist).
  // Erst die alten Cache-Versionen wegräumen, dann vorwärmen — sonst bliebe eine veraltete
  // Antwort liegen und die Detailseite zeigte ein neues Feld nicht (s. pwaCache.ts).
  useEffect(() => { raeumeAlteCaches().finally(() => { warmMySessions(); }); }, []);
  useEffect(() => {
    api.getProfile().then((p) => {
      setProfile(p);
      setIsAdmin(p.is_admin);
      // Demo-Modus fuer Screen-Recordings wiederherstellen bzw. hart abschalten: nur Admins
      // duerfen ihn haben, und er braucht die Nutzerliste, um Namen zu erkennen (lib/demoNames.ts).
      demoStart(!!p.is_admin);
      warmMedia([p.avatar_url]);   // eigenes Profilbild offline-sicher vorladen
      // Serverseitig gespeicherte Sprachpräferenz anwenden (ohne erneut zu sichern).
      if (p.language) setLang(p.language as any, { persist: false });
      // Anzeige-Einheit der Pump-Kadenz aus dem Profil übernehmen (gilt app-weit).
      applyPumpUnit(p.pump_unit);
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

  // Weiche zum Einrichtungs-Assistenten. Die BEDINGUNG kommt komplett vom Server
  // (`onboarding_due` = Stichtag gesetzt + Konto danach angelegt + Assistent nie beendet) —
  // hier wird sie nicht nachgebaut, sonst gaebe es zwei Fassungen davon.
  //
  // Drei Riegel gegen die Unfaelle, die so eine Weiche typischerweise baut:
  //   1. Nur von der Startseite. Wer einen geteilten Session-Link oeffnet, soll nicht
  //      stattdessen in einem Assistenten landen.
  //   2. Einmal je Browser-Sitzung (sessionStorage). „Spaeter fortsetzen" setzt den
  //      Server-Merker absichtlich NICHT — ohne diesen Riegel schickte die Weiche den Nutzer
  //      sofort wieder hinein, und er kaeme nie auf die Startseite. Beim naechsten Login ist
  //      die Sitzung neu und der Assistent wird wieder angeboten, genau wie beschriftet.
  //   3. Laesst sich sessionStorage nicht lesen (privates Fenster), wird NICHT geleitet: ohne
  //      Gedaechtnis waere die Schleife aus 2. nicht zu verhindern.
  useEffect(() => {
    if (!profile?.onboarding_due) return;
    if (ort.pathname !== "/" && ort.pathname !== "/home") return;
    try {
      if (sessionStorage.getItem("foil_onb_angeboten") === "1") return;
      sessionStorage.setItem("foil_onb_angeboten", "1");
    } catch { return; }
    nav("/onboarding", { replace: true });
  }, [profile, ort.pathname, nav]);

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
      <ScrollToTop />
      <FeedbackWidget />
      {social && <DmWidget />}
      <CompareBar />
      {/* Desktop-Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-slate-800/60 px-4 pb-4 pt-2 md:flex">
        <Link to="/" className="mb-3 block px-1"><BrandLogo className="w-full h-auto" /></Link>
        {/* Bild/Name/Mail fuehren auf die EIGENE Profilseite (Jan, 08.09.2026) — vorher lag
            hier ein zweiter Link auf die Startseite, die daneben schon als „Home" steht. */}
        {profile && (
          <Link to={profile.id ? `/foiler/${profile.id}` : "/"}
                className="mb-2 flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-900">
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
            onClick={it.to.startsWith("/sessions") ? clearLastSession : undefined}
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

        {onSessions && (
          <Link
            to="/import"
            className="mt-3 w-full rounded-xl bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400"
          >
            {t("import.title")}
          </Link>
        )}

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
        {/* Social-Kanäle (Icons wie auf der öffentlichen Startseite) */}
        <a href="https://www.youtube.com/@pumpfoil-org/shorts" target="_blank" rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1.5 px-3 text-xs text-slate-400 hover:text-slate-300">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M23 12s0-3.5-.4-5.1a2.6 2.6 0 0 0-1.8-1.8C19.2 4.7 12 4.7 12 4.7s-7.2 0-8.8.4A2.6 2.6 0 0 0 1.4 6.9C1 8.5 1 12 1 12s0 3.5.4 5.1a2.6 2.6 0 0 0 1.8 1.8c1.6.4 8.8.4 8.8.4s7.2 0 8.8-.4a2.6 2.6 0 0 0 1.8-1.8C23 15.5 23 12 23 12ZM9.8 15.3V8.7l6 3.3-6 3.3Z" />
          </svg>
          YouTube
        </a>
        <a href="https://www.instagram.com/pumpfoil_org/" target="_blank" rel="noopener noreferrer"
          className="mt-1 flex items-center gap-1.5 px-3 text-xs text-slate-400 hover:text-slate-300">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          Instagram
        </a>
        <a href="https://www.tiktok.com/@pumpfoil.org" target="_blank" rel="noopener noreferrer"
          className="mt-1 flex items-center gap-1.5 px-3 text-xs text-slate-400 hover:text-slate-300">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M16.5 3c.3 2.2 1.5 3.7 3.6 4v2.5c-1.3.1-2.5-.2-3.6-.9v5.9c0 3.3-2.4 5.5-5.4 5.5A5.2 5.2 0 0 1 6 14.9c0-3.2 3-5.6 6.3-4.8v2.7a2.3 2.3 0 0 0-1-.2 2.5 2.5 0 0 0 .1 5c1.4 0 2.5-1.1 2.5-2.7V3h2.6Z" />
          </svg>
          TikTok
        </a>
        <a href="https://www.facebook.com/pumpfoil" target="_blank" rel="noopener noreferrer"
          className="mt-1 flex items-center gap-1.5 px-3 text-xs text-slate-400 hover:text-slate-300">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.8 3.7-3.8 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z" />
          </svg>
          Facebook
        </a>
        <a href="https://www.xiaohongshu.com/user/profile/6a9ef5d1000000000301c6a6"
          target="_blank" rel="noopener noreferrer"
          className="mt-1 flex items-center gap-1.5 px-3 text-xs text-slate-400 hover:text-slate-300">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <path d="M7 8.6c1.7-.7 3.3-.7 5 0 1.7-.7 3.3-.7 5 0v6.8c-1.7-.7-3.3-.7-5 0-1.7-.7-3.3-.7-5 0V8.6Z" />
            <path d="M12 8.6v6.8" />
          </svg>
          RedNote
        </a>
        <ChangelogLink />
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
          {/* Import/Upload nur auf der Sessions-Seite (nur Icon); im Profil gibt es einen eigenen Einstieg. */}
          {onSessions && (
            <Link
              to="/import"
              aria-label={t("import.short")}
              title={t("import.short")}
              className="inline-flex items-center rounded-lg bg-brand-500 p-1.5 font-semibold text-slate-950 hover:bg-brand-400"
            >
              <UploadIcon className="h-4 w-4" />
            </Link>
          )}
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
        <AssistentBand />
        <FeedbackRequestBanner />
        {children ?? <Outlet />}
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
            onClick={it.to.startsWith("/sessions") ? clearLastSession : undefined}
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

/**
 * „Zurueck zum Einrichtungs-Assistenten" — Band ueber dem Inhalt, solange der Assistent laeuft
 * (Vorgabe Jan, 11.09.2026). Es gibt Wege aus dem Assistenten heraus, die wir nicht abschaffen
 * wollen: die ausfuehrliche Uhren-Anleitung, und der OAuth-Sprung zum Hersteller geht gar nicht
 * anders (dessen Rueckweg liegt serverseitig fest auf /konten). Statt die Links zu entfernen,
 * fuehrt von jeder Seite EIN Weg zurueck.
 *
 * Der Merker ist `localStorage`, nicht der Server-Merker `settings.onboarding`: dieser hier sagt
 * „gerade mitten drin", jener „einmal durch" — zwei verschiedene Fragen. Geloescht wird er von
 * den drei Ausgaengen des Assistenten („Spaeter fortsetzen", „Nicht mehr zeigen", „Fertig"), also
 * gibt es keinen Weg, auf dem das Band haengen bleibt, ohne dass man es ueber den Assistenten
 * wieder loswird. Auf /onboarding selbst zeigt es sich nicht — dort steht man ja schon.
 */
function AssistentBand() {
  const t = useT();
  const ort = useLocation();
  // Bei jedem Seitenwechsel neu lesen: der Merker aendert sich ausserhalb von React (im
  // Assistenten), ein einmaliges Lesen beim Aufbau wuerde das Band nicht wieder verschwinden
  // lassen.
  const offen = istOffen();
  if (!offen || ort.pathname.startsWith("/onboarding")) return null;
  return (
    <Link to="/onboarding"
      className="mb-4 flex items-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 py-2.5 font-medium text-slate-100 hover:border-brand-400">
      <ChevronIcon className="h-4 w-4 rotate-180 shrink-0 text-brand-400" />
      {t("onb.resume")}
    </Link>
  );
}
