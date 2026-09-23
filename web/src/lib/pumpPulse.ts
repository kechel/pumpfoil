import { useEffect, useState } from "react";
import { api } from "./api";

/**
 * Wann die Pump-Zahl in der Community-Leiste pulsiert.
 *
 * Jan, 23.09.2026: „die anzahl pumps 'pulsiert' oder so, sobald die 1.000.000 erreicht ist" —
 * und gleich danach: „mach das pulsieren mal immer an auch schon bei weniger pumps fuer admins,
 * dann kann ich den effekt kontrollieren vorher". Beides steckt hier drin, an EINER Stelle, weil
 * der Satz an zwei Orten gerendert wird (Willkommens-Banner und Community-Leiste) und der
 * Meilenstein nicht an einem davon ausbleiben soll.
 *
 * Stand am 23.09.2026: 972.235 Pumps. Es sind also keine 28.000 mehr — die Schwelle faellt
 * voraussichtlich in wenigen Wochen, und dann soll es ohne Deploy passieren.
 */
export const PUMP_MEILENSTEIN = 1_000_000;

/** true, sobald die Schwelle erreicht ist — oder immer, wenn der Betrachter Admin ist. */
export function usePumpPuls(pumps: number | null | undefined): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let lebt = true;
    // Nur fragen, wenn es ueberhaupt etwas aendern kann: ist die Schwelle erreicht, pulsiert es
    // fuer alle, und ein Profil-Abruf waere ein Request fuer nichts.
    if (pumps != null && pumps >= PUMP_MEILENSTEIN) return;
    api.getProfile().then((p) => { if (lebt) setAdmin(!!p.is_admin); }).catch(() => {});
    return () => { lebt = false; };
  }, [pumps]);
  return (pumps != null && pumps >= PUMP_MEILENSTEIN) || admin;
}
