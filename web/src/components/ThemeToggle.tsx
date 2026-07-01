import { useState } from "react";
import { getTheme, setTheme, effectiveDark, Theme } from "../lib/theme";
import { useT } from "../i18n";

// Kompakter Light/Dark-Umschalter für den Header (public + intern). Schaltet zwischen
// Hell und Dunkel (setzt explizit; „auto" bleibt über die Einstellungen erreichbar).
export function ThemeToggle({ className = "" }: { className?: string }) {
  const t = useT();
  const [theme, setT] = useState<Theme>(getTheme());
  const dark = effectiveDark(theme);
  const toggle = () => { const next: Theme = dark ? "light" : "dark"; setTheme(next); setT(next); };
  return (
    <button
      onClick={toggle}
      aria-label={dark ? t("theme.light") : t("theme.dark")}
      title={dark ? t("theme.light") : t("theme.dark")}
      className={`inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 p-2 text-slate-200 hover:bg-slate-800 ${className}`}
    >
      {dark ? (
        // Sonne (Klick -> hell)
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      ) : (
        // Mond (Klick -> dunkel)
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
