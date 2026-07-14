// Schriftgröße (Barrierefreiheit): 100 / 120 / 150 %. Persistenz in localStorage.
// Skaliert die Root-font-size -> alle rem-basierten Größen (Tailwind: Text + Abstände) wachsen
// proportional mit (wie ein Text-Zoom). Default 100 % = kein Inline-Style (CSS/Browser-Standard).
export type FontScale = "100" | "120" | "150";
const KEY = "foil_fontscale";
const BASE_PX = 16;

export function getFontScale(): FontScale {
  const v = localStorage.getItem(KEY);
  return v === "120" || v === "150" ? v : "100";
}

export function applyFontScale(fs: FontScale): void {
  const pct = fs === "150" ? 1.5 : fs === "120" ? 1.2 : 1;
  document.documentElement.style.fontSize = fs === "100" ? "" : `${BASE_PX * pct}px`;
}

export function setFontScale(fs: FontScale): void {
  localStorage.setItem(KEY, fs);
  applyFontScale(fs);
}
