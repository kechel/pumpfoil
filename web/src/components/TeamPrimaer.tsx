// Primaeres Team (10.11.2026) als Marke in den Team-Listen („Meine Teams" und Home › Team). Jan, 11.11.2026: der Stern
// soll auch dann am zaehlenden Team stehen, wenn es nur EIN solches gibt (das offizielle Team zaehlt nicht) — vorher war
// er dann unsichtbar und man suchte die Einstellung vergeblich. Waehlen kann man nur, wenn es mehrere gibt.
import { api, type TeamKurz } from "../lib/api";
import { useT } from "../i18n";

export function TeamPrimaer({ m, mehrere, onGeaendert }: { m: TeamKurz; mehrere: boolean; onGeaendert: () => void }) {
  const t = useT();
  if (m.primaer) {
    return (
      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300"
        title={t("team.primaerHinweis")}>★ {t("team.primaer")}</span>
    );
  }
  if (mehrere && m.wertbar) {
    return (
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); api.teamPrimaer(m.slug).then(onGeaendert).catch(() => {}); }}
        className="mt-0.5 rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:border-slate-500"
        title={t("team.primaerHinweis")}>☆ {t("team.primaerSetzen")}</button>
    );
  }
  return null;
}
