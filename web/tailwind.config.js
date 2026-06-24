/** @type {import('tailwindcss').Config} */

// slate wird über CSS-Variablen (--s-XXX) gesteuert -> Theme-Umschaltung (Dark/Light)
// ohne Änderungen an den Komponenten. Dark = exakte Tailwind-slate-Werte (Live unverändert),
// Light = invertierte Rampe (siehe src/index.css).
const slate = {};
for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
  slate[k] = `rgb(var(--s-${k}) / <alpha-value>)`;
}

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate,
        // "Wasser"-Akzent (Cyan/Teal) — in beiden Themes gleich.
        brand: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
