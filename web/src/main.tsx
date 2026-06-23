import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./index.css";

import { getToken, setToken } from "./lib/api";
import { I18nProvider } from "./i18n";

// OAuth-Rücksprung: Token kommt als #token=… zurück -> speichern + Hash entfernen.
(() => {
  const m = window.location.hash.match(/[#&]token=([^&]+)/);
  if (m) {
    setToken(decodeURIComponent(m[1]));
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
})();
import Login from "./pages/Login";
import Account from "./pages/Account";
import Home from "./pages/Home";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Sessions from "./pages/Sessions";
import AllSessions from "./pages/AllSessions";
import SessionDetail from "./pages/SessionDetail";
import Labeling from "./pages/Labeling";
import Impressum from "./pages/Impressum";
import Admin from "./pages/Admin";
import Reset from "./pages/Reset";
import App from "./App";
import Landing from "./pages/Landing";

// "/" -> eingeloggt: App-Shell; Gast: öffentliche Landing-Page (statt Login-Redirect),
// damit der App-Zweck ohne Anmeldung sichtbar ist (Google-OAuth-Anforderung).
function RootRoute() {
  return getToken() ? <App /> : <Landing />;
}

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/reset", element: <Reset /> },
  { path: "/impressum", element: <Impressum /> },
  {
    path: "/",
    element: <RootRoute />,
    children: [
      { index: true, element: <Home /> },
      { path: "verlauf", element: <History /> },
      { path: "sessions", element: <Sessions /> },
      { path: "alle-sessions", element: <AllSessions /> },
      { path: "account", element: <Account /> },
      { path: "einstellungen", element: <Settings /> },
      { path: "sessions/:id", element: <SessionDetail /> },
      { path: "sessions/:id/label", element: <Labeling /> },
      { path: "admin", element: <Admin /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  </React.StrictMode>
);

// PWA: Service Worker registrieren (nötig für "Zum Startbildschirm" auf Android).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
