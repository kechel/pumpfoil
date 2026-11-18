import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { foilLabel } from "../lib/foilLabel";
import { useT } from "../i18n";

/**
 * Kleiner Filter-Knopf fuer Sessions › Alle/Freunde/Team (Nutzerwunsch 17.11.2026: „all runs with brand XXX wing YYY",
 * Jan 18.11.: „ohne viel platz wegzunehmen einen neuen kleinen filter-icon button … mit einem popup").
 * Erste Einstellung: genau ein Foil. Eigene Foils oben, darunter alle Foils, mit denen in der Community gefahren wird.
 */
type FoilEintrag = { foil_id: number; brand: string; model: string; size: string; aspect_ratio: number | null; sessions: number };

export function SessionFilter({ foil, onFoil }: { foil: number | null; onFoil: (id: number | null) => void }) {
  const t = useT();
  const [offen, setOffen] = useState(false);
  const [foils, setFoils] = useState<FoilEintrag[] | null>(null);
  const [meine, setMeine] = useState<number[]>([]);
  const box = useRef<HTMLDivElement>(null);

  // Liste erst beim ersten Oeffnen laden (oder wenn per Link schon ein Foil gesetzt ist -> Name im Titel).
  useEffect(() => {
    if ((!offen && !foil) || foils) return;
    api.foilStats().then((l) => setFoils([...l].sort((a, b) => b.sessions - a.sessions))).catch(() => setFoils([]));
    api.getSettings().then((s) => setMeine(((s?.my_foils as number[]) ?? []).filter((x) => typeof x === "number"))).catch(() => {});
  }, [offen, foil, foils]);

  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOffen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOffen(false); };
    document.addEventListener("mousedown", zu);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", zu); document.removeEventListener("keydown", esc); };
  }, [offen]);

  const aktiv = foils?.find((f) => f.foil_id === foil);
  const eigene = (foils ?? []).filter((f) => meine.includes(f.foil_id));
  const andere = (foils ?? []).filter((f) => !meine.includes(f.foil_id));
  const titel = foil ? `${t("sfilter.title")}: ${aktiv ? foilLabel(aktiv) : t("sfilter.foil")}` : t("sfilter.title");

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOffen((o) => !o)} title={titel} aria-label={titel} aria-expanded={offen}
        className={`relative flex items-center justify-center rounded-xl border px-2 py-[7px] transition-colors ${
          foil ? "border-brand-500 bg-brand-500/15 text-brand-700 dark:text-brand-300"
               : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"}`}>
        {/* Trichter */}
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
        </svg>
        {foil && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand-500" aria-hidden="true" />}
      </button>
      {offen && (
        <div className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">{t("sfilter.title")}</span>
            {foil && (
              <button type="button" onClick={() => { onFoil(null); setOffen(false); }}
                className="text-xs text-brand-500 hover:underline">{t("sfilter.reset")}</button>
            )}
          </div>
          <label className="block text-xs text-slate-400" htmlFor="sfilter-foil">{t("sfilter.foil")}</label>
          <select id="sfilter-foil" value={foil ?? ""} disabled={!foils}
            onChange={(e) => { onFoil(e.target.value ? Number(e.target.value) : null); setOffen(false); }}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100">
            <option value="">{t("sfilter.allFoils")}</option>
            {eigene.length > 0 && (
              <optgroup label={t("sfilter.myFoils")}>
                {eigene.map((f) => <option key={f.foil_id} value={f.foil_id}>{foilLabel(f)}</option>)}
              </optgroup>
            )}
            <optgroup label={t("sfilter.otherFoils")}>
              {andere.map((f) => <option key={f.foil_id} value={f.foil_id}>{foilLabel(f)} ({f.sessions})</option>)}
            </optgroup>
          </select>
        </div>
      )}
    </div>
  );
}
