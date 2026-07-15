import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./index.css";

import { getToken, setToken } from "./lib/api";
import { APP_BUILD } from "./buildInfo";
import { applyTheme, getTheme, watchSystemTheme } from "./lib/theme";
import { applyFontScale, getFontScale } from "./lib/fontscale";
import { I18nProvider } from "./i18n";

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
import Login from "./pages/Login";
import Account from "./pages/Account";
import Home from "./pages/Home";
import History from "./pages/History";
import Settings from "./pages/Settings";
import LinkedAccounts from "./pages/LinkedAccounts";
import Sessions from "./pages/Sessions";
import AllSessionsRedirect from "./pages/AllSessionsRedirect";
import SessionDetail from "./pages/SessionDetail";
import PublicSession from "./pages/PublicSession";
import Compare from "./pages/Compare";
import Labeling from "./pages/Labeling";
import Impressum from "./pages/Impressum";
import Import from "./pages/Import";
import Spots from "./pages/Spots";
import Foils from "./pages/Foils";
import FoilStats from "./pages/FoilStats";
import WatchStats from "./pages/WatchStats";
import FoilCalculator from "./pages/FoilCalculator";
import PersonalHome from "./pages/PersonalHome";
import Admin from "./pages/Admin";
import NerdAnalysen from "./pages/NerdAnalysen";
import NerdAnalysen2 from "./pages/NerdAnalysen2";
import NerdAnalysen3 from "./pages/NerdAnalysen3";
import Systemarchitektur from "./pages/Systemarchitektur";
import Reset from "./pages/Reset";
import App from "./App";
import Landing from "./pages/Landing";
import { PwaStatus } from "./components/PwaStatus";

// "/" -> eingeloggt: App-Shell; Gast: öffentliche Landing-Page (statt Login-Redirect),
// damit der App-Zweck ohne Anmeldung sichtbar ist (Google-OAuth-Anforderung).
function RootRoute() {
  return getToken() ? <App /> : <Landing />;
}

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/reset", element: <Reset /> },
  { path: "/impressum", element: <Impressum /> },
  { path: "/s/:token", element: <PublicSession /> },   // öffentlicher Teilen-Link (read-only, ohne Login)
  {
    path: "/",
    element: <RootRoute />,
    children: [
      { index: true, element: <PersonalHome /> },
      { path: "home", element: <PersonalHome /> },   // Alias (Alt-Links/Bookmarks)
      { path: "community", element: <Home /> },
      { path: "verlauf", element: <History /> },
      { path: "sessions", element: <Sessions /> },
      { path: "import", element: <Import /> },
      { path: "alle-sessions", element: <AllSessionsRedirect /> },
      { path: "spots", element: <Spots /> },
      { path: "foils", element: <Foils /> },
      { path: "foil-stats", element: <FoilStats /> },
      { path: "watch-stats", element: <WatchStats /> },
      { path: "foil-rechner", element: <FoilCalculator /> },
      { path: "account", element: <Account /> },
      { path: "einstellungen", element: <Settings /> },
      { path: "konten", element: <LinkedAccounts /> },
      { path: "vergleich", element: <Compare /> },
      { path: "sessions/:id", element: <SessionDetail /> },
      { path: "sessions/:id/label", element: <Labeling /> },
      { path: "admin", element: <Admin /> },
      { path: "nerd-analysen", element: <NerdAnalysen /> },
      { path: "nerd-analysen-2", element: <NerdAnalysen2 /> },
      { path: "nerd-analysen-3", element: <NerdAnalysen3 /> },
      { path: "systemarchitektur", element: <Systemarchitektur /> },
    ],
  },
]);

// Bei jedem Routen-Wechsel ein Event feuern — der PWA-Updater nutzt das als sicheren
// Moment, ein wartendes Update anzuwenden (die alte Ansicht wird ohnehin verlassen).
router.subscribe(() => window.dispatchEvent(new Event("foil:navigate")));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <PwaStatus />
      <RouterProvider router={router} />
    </I18nProvider>
  </React.StrictMode>
);

// Service Worker wird via vite-plugin-pwa (useRegisterSW in PwaStatus) registriert.
