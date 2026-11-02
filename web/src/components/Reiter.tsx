import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Reiter oben auf einer Seite (Plan docs/UX-IA.md, 02.11.2026): die grossen Seiten zeigten zu viel auf einmal, und in
 * der Leiste unten ist kein Platz mehr. Ueberall DIESELBE Leiste — wischbar, wenn sie nicht in die Breite passt.
 *
 * Zustand:
 * - Der Reiter steht in der Adresse (`?tab=`). Ein Link geht vor allem Gemerkten.
 * - Ein Wechsel ERSETZT den Verlaufseintrag: „Zurueck" fuehrt zur vorigen Seite, nicht durch die Reiter.
 * - Mit `merken` wird die Wahl fuer einen neuen Start im Browser gemerkt (nur Komfort; ohne Speicher gilt `start`).
 * - `param`: eigener Name, wenn Reiter in Reitern stehen (Homespot in Home: `stab`).
 */
export type ReiterDef = { id: string; label: string };

const SPEICHER = (bereich: string) => `foil_reiter_${bereich}`;

export function useReiter(bereich: string, ids: string[], start: string,
                          { merken = false, param = "tab" }: { merken?: boolean; param?: string } = {}): [string, (id: string) => void] {
  const [sp, setSp] = useSearchParams();
  const ausAdresse = sp.get(param);
  let tab = ausAdresse && ids.includes(ausAdresse) ? ausAdresse : null;
  if (!tab && merken) {
    try {
      const g = localStorage.getItem(SPEICHER(bereich));
      if (g && ids.includes(g)) tab = g;
    } catch { /* privates Fenster */ }
  }
  const wahl = (id: string) => {
    if (merken) { try { localStorage.setItem(SPEICHER(bereich), id); } catch { /* egal */ } }
    setSp((alt) => { const n = new URLSearchParams(alt); n.set(param, id); return n; }, { replace: true });
  };
  return [tab ?? start, wahl];
}

export function Reiterleiste({ reiter, aktiv, onWahl, className = "" }:
  { reiter: ReiterDef[]; aktiv: string; onWahl: (id: string) => void; className?: string }) {
  const leiste = useRef<HTMLDivElement>(null);
  // Der gewaehlte Reiter rollt ins Bild, auch wenn die Leiste gewischt werden muss (lange Sprachen, schmale Handys).
  useEffect(() => {
    const el = leiste.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aktiv]);
  return (
    <div ref={leiste} role="tablist"
      className={`-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-slate-800 px-4 [scrollbar-width:none] md:mx-0 md:px-0 ${className}`}>
      {reiter.map((r) => (
        <button key={r.id} role="tab" aria-selected={r.id === aktiv} onClick={() => onWahl(r.id)}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
            r.id === aktiv ? "border-brand-400 font-semibold text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
          {r.label}
        </button>
      ))}
    </div>
  );
}
