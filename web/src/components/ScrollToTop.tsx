import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getLastSession } from "../lib/lastSession";

// Bei jedem Routenwechsel nach oben scrollen. React Router behält sonst die alte
// Scroll-Position (z. B. lange Sidebar unten -> neue Seite startet mittendrin).
// Ausnahme: /sessions scrollt selbst zur zuletzt geöffneten Session — aber nur, wenn es die
// überhaupt gibt. Der Menü-Klick auf „Sessions" löscht den Marker (App.tsx), also greift hier
// wieder das normale Verhalten und die Liste beginnt oben statt mitten im Verlauf.
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === "/sessions" && getLastSession() != null) { return; }
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
