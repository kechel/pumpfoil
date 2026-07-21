// Pump-Kadenz-Einheit: gerätelokale Wahl (localStorage "pumpRateUnit"), gilt app-weit.
// Umschaltbar über die Kadenz-Kachel in der Session-Detail; andere Ansichten (FoilStats,
// Compare, …) RESPEKTIEREN die Wahl. Default: Hz (bisheriges Verhalten). Pumps/min = Hz×60.
export type PumpUnit = "hz" | "min";

export function pumpUnit(): PumpUnit {
  try { return localStorage.getItem("pumpRateUnit") === "min" ? "min" : "hz"; } catch { return "hz"; }
}

export function setPumpUnit(u: PumpUnit): void {
  try { localStorage.setItem("pumpRateUnit", u); } catch { /* ignore */ }
}

// Nur das Einheiten-Suffix ("Hz" | "/min") gemäß aktueller Wahl.
export function pumpSuffix(unit: PumpUnit = pumpUnit()): string {
  return unit === "hz" ? "Hz" : "/min";
}

// Nur der Zahlenwert (ohne Einheit) einer Kadenz in Hz, gemäß aktueller Wahl.
export function pumpValue(hz: number, unit: PumpUnit = pumpUnit()): string {
  return unit === "hz" ? hz.toFixed(2) : String(Math.round(hz * 60));
}

// Vollständig formatiert inkl. Einheit ("1.20 Hz" | "72 /min"), "–" bei null.
export function fmtPumpRate(hz: number | null | undefined, unit: PumpUnit = pumpUnit()): string {
  if (hz == null) return "–";
  return `${pumpValue(hz, unit)} ${pumpSuffix(unit)}`;
}
