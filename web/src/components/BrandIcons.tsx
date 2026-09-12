// Offizielle Provider-Logos für die OAuth-Buttons (Inline-SVG, keine externe Lib).
type P = { className?: string };

// Google "G" in den Markenfarben — gemäß Google-Branding-Guidelines auf Sign-in-Buttons.
export const GoogleIcon = ({ className = "h-4 w-4" }: P) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
    <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
    <path fill="#FBBC05" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/>
    <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
  </svg>
);

// Apple-Logo (einfarbig) — laut „Sign in with Apple"-Guidelines auf dem Button Pflicht.
// currentColor -> passt sich der Button-Schriftfarbe an (hell auf dunklem Button).
export const AppleIcon = ({ className = "h-4 w-4" }: P) => (
  <svg className={className} viewBox="0 0 814 1000" aria-hidden="true" fill="currentColor">
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zM554.1 159.4c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
  </svg>
);

// Facebook-"f" in der Markenfarbe (#1877F2) — das offizielle Zeichen aus den Meta-Brand-Resources.
// Wie beim Google-"G" farbig und nicht `currentColor`: die Marke ist Teil des Logos, und Meta
// verlangt fuer „Continue with Facebook" entweder das blaue Zeichen oder eine vollflaechig blaue
// Schaltflaeche. Unsere Knoepfe sind einheitlich neutral, also das farbige Zeichen darauf.
export const FacebookIcon = ({ className = "h-4 w-4" }: P) => (
  <svg className={className} viewBox="0 0 36 36" aria-hidden="true">
    <path fill="#1877F2" d="M36 18C36 8.06 27.94 0 18 0S0 8.06 0 18c0 8.98 6.58 16.43 15.19 17.78V23.2h-4.57V18h4.57v-3.97c0-4.51 2.69-7 6.8-7 1.97 0 4.03.35 4.03.35v4.43h-2.27c-2.24 0-2.94 1.39-2.94 2.81V18h5l-.8 5.2h-4.2v12.58C29.42 34.43 36 26.98 36 18z"/>
    <path fill="#fff" d="M25.01 23.2l.8-5.2h-5v-3.38c0-1.42.7-2.81 2.94-2.81h2.27V7.38s-2.06-.35-4.03-.35c-4.11 0-6.8 2.49-6.8 7V18h-4.57v5.2h4.57v12.58a18.2 18.2 0 0 0 5.62 0V23.2h4.2z"/>
  </svg>
);

export const PROVIDER_ICONS: Record<string, (p: P) => JSX.Element> = {
  google: GoogleIcon,
  apple: AppleIcon,
  facebook: FacebookIcon,
};

// Marken-Zeichen der Recorder-Plattformen und Konto-Verknuepfungen, fuer die Auswahl-Kacheln im
// Einrichtungs-Assistenten (Vorgabe Jan, 11.09.2026: „bitte die brand icons bei all diesen mit in
// den buttons anzeigen").
//
// Was hier ECHT ist und was nicht — bitte nicht stillschweigend „vervollstaendigen":
//   · Polar, COROS, Suunto: die Herstellerlogos, die schon auf /konten stehen (web/public).
//   · Apple Watch: das Apple-Logo von oben (einfarbig, nimmt die Schriftfarbe).
//   · Wear OS: das Google-„G" — Wear OS ist ein Google-Produkt, ein eigenes Wear-OS-Logo liegt
//     nicht im Repo. Naeherung, bewusst gewaehlt statt nichts.
//   · Garmin und Amazfit: hier sind die Pfade schon EINGETRAGEN, die Dateien liegen aber noch
//     nicht im Repo. Ein Markenzeichen nachzeichnen wir nicht, und solange die Datei fehlt,
//     faellt die Kachel auf unser neutrales Uhr-Symbol zurueck (`onError`, s. Onboarding).
//     Zum Nachliefern also NUR die Datei unter genau diesem Namen nach `web/public/` legen —
//     kein Code, kein Deploy: `npm run build` kopiert sie, und die Kachel nimmt sie beim
//     naechsten Laden von selbst.
export const PLATTFORM_LOGOS: Record<string, string> = {
  polar: "/polar-logo.jpg",
  coros: "/coros-logo.png",
  suunto: "/suunto-logo.png",
  garmin: "/garmin-logo.png",
  amazfit: "/amazfit-logo.png",
};
