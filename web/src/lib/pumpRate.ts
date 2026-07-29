// Pump-Kadenz-Einheit: Hz oder Pumps pro Minute (ppm = Hz × 60).
//
// REINE DARSTELLUNG — Analyse, Rekorde und gespeicherte Werte bleiben immer in Hz.
// Quelle der Wahrheit ist das Nutzerprofil (`users.pump_unit`, GET/PATCH /api/auth/me);
// localStorage spiegelt die Wahl nur, damit die erste Anzeige nach dem Start (bevor das
// Profil geladen ist) schon stimmt und ausgeloggte Ansichten etwas Sinnvolles zeigen.
//
// Diese Datei ist die EINZIGE Stelle, die über Rundung und Einheit entscheidet —
// Komponenten nutzen `usePumpFmt()` und formatieren nie selbst.
import { useCallback, useSyncExternalStore } from "react";
import { api, getToken } from "./api";
import { useT, type TFunc } from "../i18n";

export type PumpUnit = "hz" | "ppm";

const LS_KEY = "foil_pump_unit";

function readStored(): PumpUnit {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "hz" || v === "ppm") return v;
    // Migration der früheren gerätelokalen Wahl (Kachel-Tap, Werte hz|min).
    if (localStorage.getItem("pumpRateUnit") === "min") return "ppm";
  } catch { /* Privatmodus o. ä. */ }
  return "hz";
}

let current: PumpUnit = readStored();
const listeners = new Set<() => void>();

function store(u: PumpUnit) {
  if (u === current) return;
  current = u;
  try { localStorage.setItem(LS_KEY, u); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

// Aktuelle Einheit (ohne Hook, z. B. für Nicht-React-Code).
export function pumpUnit(): PumpUnit {
  return current;
}

// Einheit aus einem geladenen Profil übernehmen (App-Start, Login, Profil-Update).
export function applyPumpUnit(u: string | null | undefined): void {
  store(u === "ppm" ? "ppm" : "hz");
}

// Nutzer-Wahl: sofort anwenden und im Profil sichern (eingeloggt).
export function setPumpUnit(u: PumpUnit): void {
  store(u);
  if (!getToken()) return;
  api.updatePumpUnit(u)
    .then((p) => window.dispatchEvent(new CustomEvent("foil:profile", { detail: p })))
    .catch(() => { /* Anzeige-Einstellung — stiller Fehlschlag ist ok */ });
}

// Profil-Updates aus anderen Ecken der App (Settings, Avatar, Sprache) mitziehen.
if (typeof window !== "undefined") {
  window.addEventListener("foil:profile", (e) => {
    const p = (e as CustomEvent).detail as { pump_unit?: string } | null;
    if (p && typeof p.pump_unit === "string") applyPumpUnit(p.pump_unit);
  });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Hook: aktuelle Einheit, rendert bei Wechsel neu (wirkt sofort überall).
export function usePumpUnit(): PumpUnit {
  return useSyncExternalStore(subscribe, pumpUnit, pumpUnit);
}

// --- Formatierung (die eine Wahrheit) ------------------------------------------------
// Hz: 2 Dezimalstellen (wie bisher). Pumps/min: ganzzahlig (1.43 Hz -> "86/min").
export function pumpValue(hz: number, unit: PumpUnit): string {
  return unit === "hz" ? hz.toFixed(2) : String(Math.round(hz * 60));
}

// Einheiten-Kürzel. `t` liefert das übersetzte „/min"; ohne t bleibt das neutrale Kürzel.
export function pumpSuffix(unit: PumpUnit, t?: TFunc): string {
  return unit === "hz" ? "Hz" : t ? t("unit.pumpPerMin") : "/min";
}

export function fmtPumpRate(hz: number | null | undefined, unit: PumpUnit, t?: TFunc): string {
  if (hz == null) return "–";
  return `${pumpValue(hz, unit)} ${pumpSuffix(unit, t)}`;
}

// Achsen-/Legenden-Ticks: knapper als der Messwert (Hz 1 Dezimalstelle, /min ganzzahlig).
export function pumpTick(hz: number, unit: PumpUnit): string {
  return unit === "hz" ? hz.toFixed(1) : String(Math.round(hz * 60));
}

export interface PumpFmt {
  unit: PumpUnit;
  suffix: string;                                        // "Hz" | "/min"
  value: (hz: number) => string;                         // nur die Zahl
  fmt: (hz: number | null | undefined) => string;        // Zahl + Einheit, "–" bei null
  tick: (hz: number) => string;                          // kurz für Legenden/Achsen
}

// Der Formatierer für Komponenten: an Profil-Einheit + Sprache gebunden.
export function usePumpFmt(): PumpFmt {
  const unit = usePumpUnit();
  const t = useT();
  const value = useCallback((hz: number) => pumpValue(hz, unit), [unit]);
  const fmt = useCallback((hz: number | null | undefined) => fmtPumpRate(hz, unit, t), [unit, t]);
  const tick = useCallback((hz: number) => pumpTick(hz, unit), [unit]);
  return { unit, suffix: pumpSuffix(unit, t), value, fmt, tick };
}
