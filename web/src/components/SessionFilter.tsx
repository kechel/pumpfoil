import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { foilLabel } from "../lib/foilLabel";
import { useT } from "../i18n";

/**
 * Kleiner Filter-Knopf fuer Sessions (Nutzerwunsch 17.11.2026: „all runs with brand XXX wing YYY",
 * Jan 18.11.: „ohne viel platz wegzunehmen einen neuen kleinen filter-icon button … mit einem popup",
 * dann „etwas komfortabler, mit suchfunktion und brand-filter").
 * Erste Einstellung: genau ein Foil. Suche ueber Marke/Modell/Groesse, Marken-Auswahl, eigene Foils oben,
 * darunter alle Foils, mit denen in der Community gefahren wird (nach Anzahl Sessions).
 */
type FoilEintrag = { foil_id: number; brand: string; model: string; size: string; aspect_ratio: number | null; sessions: number };

export function SessionFilter({ foil, onFoil }: { foil: number | null; onFoil: (id: number | null) => void }) {
  const t = useT();
  const [offen, setOffen] = useState(false);
  const [foils, setFoils] = useState<FoilEintrag[] | null>(null);
  const [meine, setMeine] = useState<number[]>([]);
  const [suche, setSuche] = useState("");
  const [marke, setMarke] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const suchFeld = useRef<HTMLInputElement>(null);

  // Liste erst beim ersten Oeffnen laden (oder wenn per Link schon ein Foil gesetzt ist -> Name im Titel).
  useEffect(() => {
    if ((!offen && !foil) || foils) return;
    // Mit Scooter-Sessions: der Filter gilt fuer alle Sportarten, auch reine Scooter-Foils gehoeren in die Liste.
    api.foilStats(false, 0, true).then((l) => setFoils(l.map((f) => ({ ...f, sessions: f.sessions + (f.scoot?.sessions ?? 0) }))
      .sort((a, b) => b.sessions - a.sessions))).catch(() => setFoils([]));
    api.getSettings().then((s) => setMeine(((s?.my_foils as number[]) ?? []).filter((x) => typeof x === "number"))).catch(() => {});
  }, [offen, foil, foils]);

  useEffect(() => {
    if (!offen) return;
    requestAnimationFrame(() => suchFeld.current?.focus());
    const zu = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOffen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOffen(false); };
    document.addEventListener("mousedown", zu);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", zu); document.removeEventListener("keydown", esc); };
  }, [offen]);

  const marken = useMemo(() => [...new Set((foils ?? []).map((f) => f.brand.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b)), [foils]);
  const treffer = useMemo(() => {
    const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
    return (foils ?? []).filter((f) => {
      if (marke && f.brand.trim() !== marke) return false;
      const text = `${f.brand} ${f.model} ${f.size}`.toLowerCase();
      return woerter.every((w) => text.includes(w));
    });
  }, [foils, suche, marke]);
  const eigene = treffer.filter((f) => meine.includes(f.foil_id));
  const andere = treffer.filter((f) => !meine.includes(f.foil_id));
  const aktiv = foils?.find((f) => f.foil_id === foil);
  const titel = foil ? `${t("sfilter.title")}: ${aktiv ? foilLabel(aktiv) : t("sfilter.foil")}` : t("sfilter.title");

  const waehle = (id: number | null) => { onFoil(id); setOffen(false); };
  const zeile = (f: FoilEintrag, mitZahl: boolean) => (
    <li key={f.foil_id}>
      <button type="button" onClick={() => waehle(f.foil_id)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
          f.foil_id === foil ? "bg-brand-500/20 font-semibold text-brand-700 dark:text-brand-300" : "text-slate-200 hover:bg-slate-800"}`}>
        <span className="min-w-0 truncate">{foilLabel(f)}</span>
        {mitZahl && <span className="shrink-0 text-xs tabular-nums text-slate-400">{f.sessions}</span>}
      </button>
    </li>
  );

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
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">{t("sfilter.title")} · {t("sfilter.foil")}</span>
            {foil && (
              <button type="button" onClick={() => waehle(null)} className="text-xs text-brand-500 hover:underline">
                {t("sfilter.reset")}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <input ref={suchFeld} type="search" value={suche} onChange={(e) => setSuche(e.target.value)}
              placeholder={t("sfilter.search")} aria-label={t("sfilter.search")}
              onKeyDown={(e) => { if (e.key === "Enter" && treffer.length === 1) waehle(treffer[0].foil_id); }}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500" />
            <select value={marke} onChange={(e) => setMarke(e.target.value)} aria-label={t("sfilter.brand")}
              className="w-28 shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-1.5 py-1.5 text-sm text-slate-100">
              <option value="">{t("sfilter.allBrands")}</option>
              {marken.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="mt-2 max-h-72 overflow-y-auto pr-1">
            {!foils ? (
              <p className="px-2 py-3 text-sm text-slate-400">…</p>
            ) : (
              <ul className="space-y-0.5">
                {!suche && !marke && (
                  <li>
                    <button type="button" onClick={() => waehle(null)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${!foil ? "bg-brand-500/20 font-semibold text-brand-700 dark:text-brand-300" : "text-slate-200 hover:bg-slate-800"}`}>
                      {t("sfilter.allFoils")}
                    </button>
                  </li>
                )}
                {eigene.length > 0 && <li className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("sfilter.myFoils")}</li>}
                {eigene.map((f) => zeile(f, false))}
                {andere.length > 0 && <li className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("sfilter.otherFoils")}</li>}
                {andere.map((f) => zeile(f, true))}
                {treffer.length === 0 && <li className="px-2 py-3 text-sm text-slate-400">{t("sfilter.noHits")}</li>}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
