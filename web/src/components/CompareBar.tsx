import { Link } from "react-router-dom";
import { CompareIcon } from "./Icons";
import { useCompare } from "../lib/compare";
import { useT } from "../i18n";

// Schwebender Button: erscheint, sobald etwas im Vergleichskorb liegt, und führt
// zur Vergleichsansicht. Über der Mobile-Bottom-Nav positioniert.
export function CompareBar() {
  const t = useT();
  const refs = useCompare();
  if (refs.length < 1) return null;
  return (
    <Link
      to="/vergleich"
      title={t("compare.open")}
      className="fixed bottom-20 right-4 z-[1100] flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-brand-500/30 transition-colors hover:bg-brand-400 md:bottom-6"
    >
      <CompareIcon className="h-5 w-5" />
      {t("compare.bar", { n: refs.length })}
    </Link>
  );
}
