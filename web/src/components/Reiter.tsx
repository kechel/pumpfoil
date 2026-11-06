import { useEffect, useRef, useState } from "react";
import { ChevronIcon } from "./Icons";
import { useSearchParams } from "react-router-dom";

/**
 * Reiter oben auf einer Seite (Plan docs/UX-IA.md, 02.11.2026): die grossen Seiten zeigten zu viel auf einmal, und in
 * der Leiste unten ist kein Platz mehr. Ueberall DIESELBE Leiste — wischbar, wenn sie nicht in die Breite passt.
 *
 * Zustand:
 * - Der Reiter steht in der Adresse (`?tab=`). Ein Link geht vor allem Gemerkten.
 * - Ein Wechsel ERSETZT den Verlaufseintrag: „Zurueck" fuehrt zur vorigen Seite, nicht durch die Reiter.
 * - Mit `merken` wird die Wahl fuer einen neuen Start im Browser gemerkt (nur Komfort; ohne Speicher gilt `start`).
 * - `param`: eigener Name, wenn Reiter in Reitern stehen (Spots in Home: `stab`).
 */
export type ReiterDef = { id: string; label: string; badge?: import("react").ReactNode };

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
 * Waagrecht wischbare Leiste: Pfeile am Rand, Mausrad rollt waagrecht, der gewaehlte Eintrag (`aria-selected`) rollt ins
 * Bild. Gemeinsam fuer die Reiterleisten und die Spotzeile auf Home › Spots.
 */
export function useWischleiste(aktiv: string, anzahl: number) {
  const leiste = useRef<HTMLDivElement>(null);
  const [rand, setRand] = useState({ links: false, rechts: false });
  // Der gewaehlte Reiter rollt ins Bild, auch wenn die Leiste gewischt werden muss (lange Sprachen, schmale Handys).
  useEffect(() => {
    const el = leiste.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aktiv]);
  // Passt die Leiste nicht in die Breite, zeigt ein kleiner Pfeil am Rand, dass es weitergeht (Jan, 03.11.2026: schnitt
  // der Rand genau zwischen zwei Reitern ab, sah man gar nicht, dass man wischen kann). Tippen rollt eine Seite weiter.
  useEffect(() => {
    const el = leiste.current;
    if (!el) return;
    const pruefen = () => setRand({ links: el.scrollLeft > 2, rechts: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    pruefen();
    el.addEventListener("scroll", pruefen, { passive: true });
    // Mausrad am PC: senkrecht gedreht rollt die Leiste waagrecht (Jan: „scrollen im browser mit der maus geht garnicht").
    // Nur solange es in die Richtung noch weitergeht — am Ende rollt wieder die Seite.
    const rad = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const vor = e.deltaY > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0;
      if (!vor) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", rad, { passive: false });
    const ro = new ResizeObserver(pruefen);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", pruefen); el.removeEventListener("wheel", rad); ro.disconnect(); };
  }, [anzahl]);
  const rollen = (richtung: 1 | -1) => leiste.current?.scrollBy({ left: richtung * leiste.current.clientWidth * 0.7, behavior: "smooth" });
  const pfeil = (richtung: 1 | -1) => (
    <button type="button" aria-hidden tabIndex={-1} onClick={() => rollen(richtung)}
      className={`absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 shadow-md hover:text-slate-100 ${
        richtung === 1 ? "right-1" : "left-1"}`}>
      <ChevronIcon className={`h-4 w-4 ${richtung === 1 ? "" : "rotate-180"}`} />
    </button>
  );
  return { leiste, rand, pfeil };
}

/**
 * `unter`: der aktive Reiter hat eine zweite Reiterzeile — er wird dann in derselben Farbe hinterlegt wie die Zeile
 * darunter, damit man sieht, was zusammengehoert (Jan, 02.11.2026). `stufe={2}` ist diese zweite Zeile selbst:
 * gleiche Schriftgroesse, als Flaeche direkt unter der ersten. Ueberall identisch.
 */
export function Reiterleiste({ reiter, aktiv, onWahl, className = "", unter = false, stufe = 1 }:
  { reiter: ReiterDef[]; aktiv: string; onWahl: (id: string) => void; className?: string; unter?: boolean; stufe?: 1 | 2 }) {
  const { leiste, rand, pfeil } = useWischleiste(aktiv, reiter.length);
  if (stufe === 2) {
    return (
      <div className={`relative -mt-4 mb-6 ${className}`}>
        <div ref={leiste} role="tablist"
          className="flex gap-1 overflow-x-auto rounded-b-xl bg-slate-800/70 p-1.5 [scrollbar-width:none]">
          {reiter.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.id === aktiv} onClick={() => onWahl(r.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                r.id === aktiv ? "bg-slate-950 font-semibold text-slate-100 shadow-sm" : "text-slate-300 hover:text-slate-100"}`}>
              {r.label}{r.badge}
            </button>
          ))}
        </div>
        {rand.links && pfeil(-1)}
        {rand.rechts && pfeil(1)}
      </div>
    );
  }
  return (
    <div className={`relative -mx-4 mb-4 md:mx-0 ${className}`}>
      <div ref={leiste} role="tablist"
        className="flex gap-1 overflow-x-auto border-b border-slate-800 px-4 [scrollbar-width:none] md:px-0">
        {reiter.map((r) => {
          const an = r.id === aktiv;
          const flaeche = an && unter;
          return (
            <button key={r.id} role="tab" aria-selected={an} onClick={() => onWahl(r.id)}
              className={`-mb-px shrink-0 whitespace-nowrap px-3 py-2 text-sm ${
                flaeche ? "rounded-t-xl border-b-2 border-transparent bg-slate-800/70 font-semibold text-slate-100"
                : an ? "border-b-2 border-brand-400 font-semibold text-slate-100"
                : "border-b-2 border-transparent text-slate-400 hover:text-slate-200"}`}>
              {r.label}{r.badge}
            </button>
          );
        })}
      </div>
      {rand.links && pfeil(-1)}
      {rand.rechts && pfeil(1)}
    </div>
  );
}
