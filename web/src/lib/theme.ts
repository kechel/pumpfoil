// Theme-Verwaltung: Dark / Light / Auto. Persistenz in localStorage.
// Default = "auto" (folgt der System-Einstellung; inkl. öffentlicher Startseite).
export type Theme = "dark" | "light" | "auto";
const KEY = "theme";

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "auto";
}

export function effectiveDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme): void {
  const dark = effectiveDark(theme);
  document.documentElement.classList.toggle("theme-light", !dark);
  // Browser-Chrome (Mobile): immer unser Brand-Cyan (wie das Update-Banner),
  // unabhaengig vom Theme.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", "#22d3ee");
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

// Bei "auto" auf System-Wechsel reagieren.
export function watchSystemTheme(): void {
  if (!window.matchMedia) return;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getTheme() === "auto") applyTheme("auto");
  });
}
