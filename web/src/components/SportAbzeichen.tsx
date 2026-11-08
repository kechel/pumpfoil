// Abzeichen der Sportart in gemischten Ranglisten (Jan, 08.11.2026: „bei jedem Fahrer ein Badge … um welche Sportart es
// sich handelt, und bei Teams halt auch beide Badges"). Nur dort, wo der Server `sportarten` mitschickt — das tut er
// ausschliesslich in gemischten Ansichten (server/app/sportmix.py).
import { useT } from "../i18n";
import { SPORTS } from "../lib/sportClass";

// Feste Farbe je Sportart, damit man die Zeilen auf einen Blick trennt; unbekannte grau.
const FARBE: Record<string, string> = {
  pumpfoil: "bg-brand-500/15 text-brand-700 dark:text-brand-300",
  foil_scoot: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export function SportAbzeichen({ sportarten, klein = false }: { sportarten?: string[] | null; klein?: boolean }) {
  const t = useT();
  if (!sportarten?.length) return null;
  return (
    <span className="inline-flex shrink-0 flex-wrap gap-1">
      {[...sportarten].sort((a, b) => (SPORTS as readonly string[]).indexOf(a) - (SPORTS as readonly string[]).indexOf(b)).map((sp) => (
        <span key={sp} className={`rounded px-1.5 py-0.5 font-medium leading-none ${klein ? "text-[10px]" : "text-xs"} ${FARBE[sp] ?? "bg-slate-800 text-slate-300"}`}>
          {t(`cls.sport.${sp}`)}
        </span>
      ))}
    </span>
  );
}
