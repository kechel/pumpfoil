import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, useParams, createBrowserRouter, RouterProvider, Outlet, useMatches } from "react-router-dom";
import "leaflet/dist/leaflet.css";
// Muss VOR der ersten Karte laufen: Leaflet soll keine Tasten schlucken, waehrend jemand tippt.
import "./lib/leafletKeyboard";
import "./index.css";

import { api, getToken, setToken } from "./lib/api";
import { APP_BUILD } from "./buildInfo";
import { applyTheme, getTheme, watchSystemTheme } from "./lib/theme";
import { applyFontScale, getFontScale } from "./lib/fontscale";
import { I18nProvider, langAusPfad, ladeSprache, detectInitialLang } from "./i18n";

// Chunk-/Modul-Ladefehler nach einem Deploy (alte Chunk-URL nach PWA-Update) -> einmal pro
// Session frisch neu laden statt Blank-Screen. Ergänzt den Watchdog (public/app-watchdog.js).
window.addEventListener("vite:preloadError", () => {
  try {
    if (sessionStorage.getItem("pf_blank_recover")) return;
    sessionStorage.setItem("pf_blank_recover", "1");
  } catch { /* ignore */ }
  window.location.reload();
});

// Build-Stempel (ändert den Bundle-Hash -> löst SW-Update/Banner aus; auch in den Einstellungen sichtbar).
console.info(`pumpfoil build ${APP_BUILD}`);

// Theme anwenden + bei "auto" auf System-Wechsel reagieren.
applyTheme(getTheme());
watchSystemTheme();
// Schriftgröße (Barrierefreiheit) anwenden (theme-init.js macht es schon früh gegen Flash).
applyFontScale(getFontScale());

// OAuth-Rücksprung: Token kommt als #token=… zurück -> speichern + Hash entfernen.
(() => {
  const m = window.location.hash.match(/[#&]token=([^&]+)/);
  if (m) {
    setToken(decodeURIComponent(m[1]));
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
})();

// PWA-Install-Prompt SEHR früh abfangen (feuert oft vor dem React-Mount) und global
// merken, damit der "App installieren"-Button es nutzen kann.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  (window as any).__bip = e;
  window.dispatchEvent(new Event("bip-ready"));
});
window.addEventListener("appinstalled", () => { (window as any).__bip = null; });
import App from "./App";

// Seiten als eigene Dateien, geladen beim ersten Aufruf (Code-Splitting, 23.10.2026). Vorher steckte die ganze
// App in EINER index.js (5,26 MB), das riss die Precache-Grenze des Service Workers. Der Service Worker
// cacht die Teile weiterhin alle (globPatterns js), offline aendert sich also nichts — nur der erste
// Seitenaufruf laedt weniger. Ladefehler nach einem Deploy faengt `vite:preloadError` oben ab.
function seite(laden: () => Promise<{ default: React.ComponentType }>) {
  const Teil = React.lazy(laden);
  return function Seite() {
    return (
      <React.Suspense fallback={<div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" /></div>}>
        <Teil />
      </React.Suspense>
    );
  };
}
const Login = seite(() => import("./pages/Login"));
const Account = seite(() => import("./pages/Account"));
const Onboarding = seite(() => import("./pages/Onboarding"));
const Home = seite(() => import("./pages/Home"));
const History = seite(() => import("./pages/History"));
const Settings = seite(() => import("./pages/Settings"));
const LinkedAccounts = seite(() => import("./pages/LinkedAccounts"));
const OAuthConsent = seite(() => import("./pages/OAuthConsent"));
const Sessions = seite(() => import("./pages/Sessions"));
const CurrentFeedbackRequest = seite(() => import("./pages/CurrentFeedbackRequest"));
const AllSessionsRedirect = seite(() => import("./pages/AllSessionsRedirect"));
const SessionDetail = seite(() => import("./pages/SessionDetail"));
const PublicSession = seite(() => import("./pages/PublicSession"));
const Compare = seite(() => import("./pages/Compare"));
const Labeling = seite(() => import("./pages/Labeling"));
const Impressum = seite(() => import("./pages/Impressum"));
const Datenloeschung = seite(() => import("./pages/Datenloeschung"));
const Changelog = seite(() => import("./pages/Changelog"));
const Import = seite(() => import("./pages/Import"));
const Foiler = seite(() => import("./pages/Foiler"));
const LaengsteLaeufe = seite(() => import("./pages/LaengsteLaeufe"));
const Spots = seite(() => import("./pages/Spots"));
const Foils = seite(() => import("./pages/Foils"));
const Setup = seite(() => import("./pages/Setup"));
const Layouts = seite(() => import("./pages/Layouts"));
const LayoutEditor = seite(() => import("./pages/LayoutEditor"));
const LayoutGallery = seite(() => import("./pages/LayoutGallery"));
const FoilStats = seite(() => import("./pages/FoilStats"));
const FoilDetail = seite(() => import("./pages/FoilDetail"));
const WatchStats = seite(() => import("./pages/WatchStats"));
const Friends = seite(() => import("./pages/Friends"));
const FoilCalculator = seite(() => import("./pages/FoilCalculator"));
const PersonalHome = seite(() => import("./pages/PersonalHome"));
const Admin = seite(() => import("./pages/Admin"));
const NerdAnalysen = seite(() => import("./pages/NerdAnalysen"));
const NerdAnalysen2 = seite(() => import("./pages/NerdAnalysen2"));
const NerdAnalysen3 = seite(() => import("./pages/NerdAnalysen3"));
const NerdAnalysen4 = seite(() => import("./pages/NerdAnalysen4"));
const NerdAnalysen5 = seite(() => import("./pages/NerdAnalysen5"));
const Systemarchitektur = seite(() => import("./pages/Systemarchitektur"));
const Reset = seite(() => import("./pages/Reset"));

import Landing from "./pages/Landing";
import { PwaStatus } from "./components/PwaStatus";

// "/" -> eingeloggt: App-Shell; Gast: öffentliche Landing-Page (statt Login-Redirect),
// damit der App-Zweck ohne Anmeldung sichtbar ist (Google-OAuth-Anforderung).
/**
 * Startseite unter einem Sprachpraefix. Rendert dieselbe Landing-Page; die Sprache stellt
 * `detectInitialLang` schon beim Start aus der Adresse ein. Ist das Segment keine bekannte
 * Sprache, geht es auf `/` — sonst waere jede Tippfehler-Adresse eine Kopie der Startseite,
 * und genau das meldet Google als „Duplikat ohne Canonical".
 */
function SprachStartseite() {
  const { lang } = useParams();
  if (!langAusPfad("/" + (lang ?? ""))) return <Navigate to="/" replace />;
  return <Landing />;
}

/**
 * EIN Rahmen fuer die ganze angemeldete App — auch fuer die Text-Seiten (Changelog, Nerd-Analysen,
 * Impressum …). Bis 10.10.2026 rendeten die Text-Seiten je ein EIGENES `<App>`; der Wechsel
 * dorthin baute den ganzen Rahmen neu auf, und das offene Chat-Fenster samt getipptem Text war
 * weg (Jan). Jetzt haengen alle Seiten unter derselben Route, `App` bleibt beim Wechsel stehen.
 *
 * Text-Seiten muss es in zwei Welten geben: oeffentlich (fuer Google und Gaeste, ohne Login)
 * und drinnen im App-Rahmen (fuer Angemeldete, mit Menue). Dieselbe Adresse, damit ein geteilter
 * Link fuer beide funktioniert. Markiert sind sie mit `handle: { text: true }`.
 */
function Rahmen() {
  const textSeite = useMatches().some((m) => (m.handle as { text?: boolean } | undefined)?.text);
  if (getToken()) return <App />;
  if (!textSeite) return <Landing />;
  // Fuer Gaeste fehlt der App-Rahmen — und damit auch dessen Innenabstand und Breite. Ohne
  // eigenen Rahmen liefen die Nerd-Analysen randlos ueber die ganze Bildschirmbreite, waehrend
  // `Systemarchitektur` einen eigenen `max-w-3xl` mitbringt und richtig aussah (Jan, 07.09.).
  // Dieselben Werte wie im App-Rahmen (`<main>` dort: px-4 py-5 md:px-8), damit eine Seite in
  // beiden Welten gleich wirkt. Der doppelte max-w in `Systemarchitektur` schadet nicht.
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8"><Outlet /></main>
  );
}

const TEXT = { text: true };

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/reset", element: <Reset /> },
  // Eine eigene Adresse je Sprache fuer die oeffentliche Startseite: /en/, /fr/, /ja/ …
  // Statische Pfade wie /login und die Text-Seiten gewinnen in React Router gegen dieses
  // dynamische Segment, die bestehenden Routen bleiben also unberuehrt. Unbekannte Segmente
  // landen auf /.
  { path: "/:lang", element: <SprachStartseite /> },
  { path: "/s/:token", element: <PublicSession /> },   // öffentlicher Teilen-Link (read-only, ohne Login)
  {
    element: <Rahmen />,
    children: [
      // Text-Seiten: oeffentlich fuer Gaeste, im App-Rahmen fuer Angemeldete (s. `Rahmen`).
      // - Oeffentlich OHNE Login ist eine SEO-Entscheidung (Jan, 06.09.2026): fuer Gaeste rendert
      //   der Rahmen sonst die Landing-Page, Google saehe unter mehreren Adressen denselben Inhalt
      //   („Duplikat ohne Canonical"). Sie rufen keine API auf, es geht kein Zugriffsschutz verloren.
      // - IM App-Rahmen fuer Angemeldete, sonst steht der Text nackt da, ohne Menue und ohne Weg
      //   zurueck (Jan, 07.09.), und der Feedback-Knopf im Changelog tat nichts, weil das
      //   Feedback-Fenster im App-Rahmen haengt (Jan, 24.09.).
      // - /datenloeschung: Statusseite fuer Facebook-Loeschanfragen, Meta prueft sie vor der Freigabe.
      { path: "/impressum", element: <Impressum />, handle: TEXT },
      { path: "/datenloeschung", element: <Datenloeschung />, handle: TEXT },
      { path: "/changelog", element: <Changelog />, handle: TEXT },
      { path: "/nerd-analysen", element: <NerdAnalysen />, handle: TEXT },
      { path: "/nerd-analysen-2", element: <NerdAnalysen2 />, handle: TEXT },
      { path: "/nerd-analysen-3", element: <NerdAnalysen3 />, handle: TEXT },
      { path: "/nerd-analysen-4", element: <NerdAnalysen4 />, handle: TEXT },
      { path: "/nerd-analysen-5", element: <NerdAnalysen5 />, handle: TEXT },
      { path: "/systemarchitektur", element: <Systemarchitektur />, handle: TEXT },
      {
        path: "/",
        children: [
          { index: true, element: <PersonalHome /> },
          { path: "home", element: <PersonalHome /> },   // Alias (Alt-Links/Bookmarks)
          { path: "community", element: <Home /> },
          { path: "verlauf", element: <History /> },
          { path: "sessions", element: <Sessions /> },
          { path: "current-feedback-request", element: <CurrentFeedbackRequest /> },
          { path: "import", element: <Import /> },
          // Oeffentliche Foiler-Seite. NOCH NICHT VERLINKT (Jan, 08.09.2026: erst ansehen,
          // dann entscheiden, wo sie erscheint) — nur direkt ueber /foiler/<id> erreichbar.
          { path: "foiler/:id", element: <Foiler /> },
          // Laengste eigene Laeufe im Vergleich (Jan, 02.10.2026) — seit 02.10. fuer alle, Knopf ganz unten auf Home.
          { path: "laeufe", element: <LaengsteLaeufe /> },
          { path: "alle-sessions", element: <AllSessionsRedirect /> },
          { path: "spots", element: <Spots /> },
          { path: "foils", element: <Foils /> },
          { path: "setup", element: <Setup /> },
          { path: "layouts", element: <Layouts /> },
          { path: "layouts/community", element: <LayoutGallery /> },
          { path: "layouts/:id", element: <LayoutEditor /> },
          { path: "foil-stats", element: <FoilStats /> },
          { path: "foil-stats/:foilId", element: <FoilDetail /> },
          { path: "watch-stats", element: <WatchStats /> },
          { path: "foil-rechner", element: <FoilCalculator /> },
          { path: "account", element: <Account /> },
          // Einrichtungs-Assistent fuer neue Konten. NOCH NICHT VERLINKT (Jan, 11.09.2026:
          // „noch nirgendwo verlinken, aber ich komme ja dann ueber die url da schon drauf") —
          // nur direkt ueber /onboarding erreichbar, wie /foiler/:id am 08.09. Die Weiche, die
          // neue Konten einmalig hierher leitet, kommt erst, wenn der Ablauf steht.
          { path: "onboarding", element: <Onboarding /> },
          { path: "einstellungen", element: <Settings /> },
          // Freunde verwalten (15.10.2026), Einstieg ueber den Knopf auf der Profilseite.
          { path: "friends", element: <Friends /> },
          { path: "konten", element: <LinkedAccounts /> },
          // Zustimmungsseite des eigenen OAuth-Servers. IM App-Rahmen, damit sie aussieht wie der
          // Rest und der Nutzer sieht, wo er ist — wer aus einem fremden Programm hierher springt,
          // soll Pumpfoil erkennen und nicht ein nacktes Formular.
          { path: "/oauth/consent", element: <OAuthConsent /> },
          { path: "vergleich", element: <Compare /> },
          { path: "sessions/:id", element: <SessionDetail /> },
          { path: "sessions/:id/label", element: <Labeling /> },
          { path: "admin", element: <Admin /> },
        ],
      },
    ],
  },
]);

// Bei jedem Routen-Wechsel ein Event feuern — der PWA-Updater nutzt das als sicheren
// Moment, ein wartendes Update anzuwenden (die alte Ansicht wird ohnehin verlassen).
router.subscribe(() => window.dispatchEvent(new Event("foil:navigate")));

// Erst die Sprache des Besuchers laden (eigene Datei, s. i18n/index.tsx), dann rendern — sonst stuende
// die Seite einen Moment auf Englisch. Scheitert das Laden, rendert sie trotzdem (Rueckfall en/de).
ladeSprache(detectInitialLang()).finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <I18nProvider>
        <PwaStatus />
        <RouterProvider router={router} />
      </I18nProvider>
    </React.StrictMode>
  );
});

// Einen Seitenaufruf melden — EINMAL je Laden der Seite, fuer JEDEN Besucher. Bewusst HIER und
// nicht in `App`: die App-Huelle rendert nur fuer Angemeldete, Gaeste bekommen `Landing` — ein
// Zaehler in App haette also ausgerechnet die oeffentliche Website nicht gezaehlt.
//
// Warum ueberhaupt aus der laufenden Seite und nicht aus dem Zugriffs-Log: dort sind 87 % der
// Aufrufe von `GET /` unsere EIGENEN Pruefungen (localhost + Proxy-Sonde, gemessen 12.09.2026
// ueber zwei Tage: 2310 von 2641), und wer wiederkommt, bekommt die Huelle aus dem
// Service-Worker-Cache und fragt den Server gar nicht erst. Der Server fuehrt daraus nur eine
// Tageszahl (models.PageHit): keine Kennung, keine Adresse, nichts im Browser gespeichert.
api.seitenAufruf().catch(() => {});

// Service Worker wird via vite-plugin-pwa (useRegisterSW in PwaStatus) registriert.
