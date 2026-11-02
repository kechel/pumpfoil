import { useEffect, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronIcon } from "./Icons";
import { useT } from "../i18n";

/**
 * Zurueck — ueberall derselbe Pfeil, ganz links in der Titelzeile (Jan, 02.11.2026: „einfach immer ueberall exakt gleich,
 * auf allen seiten, zurueck ist zurueck … dann koennen wir auch von ueberall ueberall hinlinken ohne darueber
 * nachzudenken"). Ersetzt die festen Links wie „‹ Sessions" oder „‹ Profil". Geht einen Schritt im Verlauf zurueck;
 * ohne Verlauf in der App (direkt geoeffneter Link) auf `fallback`.
 */
// Wie viele Seiten-Pfeile gerade stehen. Der App-Rahmen zeigt seinen allgemeinen Pfeil nur, wenn die Seite keinen
// eigenen hat — so stehen nie zwei untereinander, und Seiten ohne eigene Titelzeile haben trotzdem einen.
let anzahl = 0;
const hoerer = new Set<() => void>();
const melden = () => hoerer.forEach((h) => h());
export function useSeitenPfeil(): boolean {
  return useSyncExternalStore((h) => { hoerer.add(h); return () => { hoerer.delete(h); }; }, () => anzahl > 0);
}

export function ZurueckPfeil({ fallback = "/", className = "" }: { fallback?: string; className?: string }) {
  const nav = useNavigate();
  useEffect(() => { anzahl += 1; melden(); return () => { anzahl -= 1; melden(); }; }, []);
  const t = useT();
  const text = t("common.back").replace(/^←\s*/, "");
  return (
    <button onClick={() => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav(fallback))}
      aria-label={text} title={text}
      // Mindestens 44 px Trefferflaeche (Jan: „den soll man auch treffen koennen mit der maus oder dem finger").
      className={`-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 hover:text-slate-100 ${className}`}>
      <ChevronIcon className="h-7 w-7 rotate-180" />
    </button>
  );
}
