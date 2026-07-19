import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Bei jedem Routenwechsel nach oben scrollen. React Router behält sonst die alte
// Scroll-Position (z. B. lange Sidebar unten -> neue Seite startet mittendrin).
// Ausnahme: /sessions scrollt selbst zur zuletzt geöffneten Session.
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === "/sessions") { return; }
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
