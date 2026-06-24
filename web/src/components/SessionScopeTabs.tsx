import { NavLink } from "react-router-dom";
import { useT } from "../i18n";

// Umschalter Meine / Alle Sessions (oben auf beiden Listenseiten).
export function SessionScopeTabs() {
  const t = useT();
  const cls = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive ? "bg-brand-500 text-slate-950" : "text-slate-200 hover:bg-slate-800"
    }`;
  return (
    <div className="mb-4 inline-flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
      <NavLink end to="/sessions" className={cls}>{t("nav.mySessions.short")}</NavLink>
      <NavLink to="/alle-sessions" className={cls}>{t("nav.allSessions.short")}</NavLink>
    </div>
  );
}
