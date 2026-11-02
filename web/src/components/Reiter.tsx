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

/**
 * `unter`: der aktive Reiter hat eine zweite Reiterzeile — er wird dann in derselben Farbe hinterlegt wie die Zeile
 * darunter, damit man sieht, was zusammengehoert (Jan, 02.11.2026). `stufe={2}` ist diese zweite Zeile selbst:
 * gleiche Schriftgroesse, als Flaeche direkt unter der ersten. Ueberall identisch.
 */
export function Reiterleiste({ reiter, aktiv, onWahl, className = "", unter = false, stufe = 1 }:
  { reiter: ReiterDef[]; aktiv: string; onWahl: (id: string) => void; className?: string; unter?: boolean; stufe?: 1 | 2 }) {
  const leiste = useRef<HTMLDivElement>(null);
  // Der gewaehlte Reiter rollt ins Bild, auch wenn die Leiste gewischt werden muss (lange Sprachen, schmale Handys).
  useEffect(() => {
    const el = leiste.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aktiv]);
  if (stufe === 2) {
    return (
      <div ref={leiste} role="tablist"
        className={`-mt-4 mb-6 flex gap-1 overflow-x-auto rounded-b-xl bg-slate-800/70 p-1.5 [scrollbar-width:none] ${className}`}>
        {reiter.map((r) => (
          <button key={r.id} role="tab" aria-selected={r.id === aktiv} onClick={() => onWahl(r.id)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
              r.id === aktiv ? "bg-slate-950 font-semibold text-slate-100 shadow-sm" : "text-slate-300 hover:text-slate-100"}`}>
            {r.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div ref={leiste} role="tablist"
      className={`-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-slate-800 px-4 [scrollbar-width:none] md:mx-0 md:px-0 ${className}`}>
      {reiter.map((r) => {
        const an = r.id === aktiv;
        const flaeche = an && unter;
        return (
          <button key={r.id} role="tab" aria-selected={an} onClick={() => onWahl(r.id)}
            className={`-mb-px shrink-0 whitespace-nowrap px-3 py-2 text-sm ${
              flaeche ? "rounded-t-xl border-b-2 border-transparent bg-slate-800/70 font-semibold text-slate-100"
              : an ? "border-b-2 border-brand-400 font-semibold text-slate-100"
              : "border-b-2 border-transparent text-slate-400 hover:text-slate-200"}`}>
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
