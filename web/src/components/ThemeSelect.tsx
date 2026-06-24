import { useState } from "react";
import { getTheme, setTheme, Theme } from "../lib/theme";
import { useT } from "../i18n";

// Dark / Light / Auto-Umschalter. Wirkt sofort (CSS-Variablen), Persistenz via localStorage.
export function ThemeSelect() {
  const t = useT();
  const [theme, setT] = useState<Theme>(getTheme());
  const opts: { v: Theme; label: string }[] = [
    { v: "dark", label: t("theme.dark") },
    { v: "light", label: t("theme.light") },
    { v: "auto", label: t("theme.auto") },
  ];
  const choose = (v: Theme) => { setTheme(v); setT(v); };
  return (
    <div className="inline-flex gap-1 rounded-xl border border-slate-700 bg-slate-900/60 p-1">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => choose(o.v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            theme === o.v ? "bg-brand-500 text-slate-950" : "text-slate-200 hover:bg-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
