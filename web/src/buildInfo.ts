// Build-Stempel: wird beim Build automatisch gesetzt (Datum + Git-Hash, siehe
// vite.config.ts `define.__APP_BUILD__`). Ändert den Bundle-Hash (löst das PWA-SW-Update
// aus) und wird in den Einstellungen angezeigt (Support/Feldtest — welche Version läuft?).
declare const __APP_BUILD__: string;
export const APP_BUILD = typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : "dev";
