import { WaveIcon } from "./Icons";

// Pumpfoil-Wortmarke als horizontale Sperrung: Wellen-Glyph LINKS neben „pumpfoil.org".
// Entspricht dem Marken-Lockup (store-assets/logo, docs/BRAND.md). Wellen + „.org" in
// Brand-Cyan; „pumpfoil" erbt die Textfarbe (passt sich Header-Kontext & Light/Dark an).
// tagline=true blendet „TRACK EVERY PUMP" darunter ein (Login/Marketing-Kontexte).
//
// Für den großen Marketing-Titel (Landing-Hero) bleibt bewusst das PNG
// (pumpfoil-wordmark-tagline.png) — dort zählt die exakte Schrift. In-App nutzen wir
// diese Vektor-Variante (scharf, theme-/größenflexibel, kein Schrift-Mismatch).
export function Wordmark({
  className = "",
  icon = "h-7 w-7",
  text = "text-xl",
  tagline = false,
}: {
  className?: string;
  icon?: string;   // Tailwind-Größe des Wellen-Glyphs
  text?: string;   // Tailwind-Schriftgröße der Wortmarke
  tagline?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <WaveIcon className={`${icon} shrink-0 text-brand-400`} />
      <span className="flex flex-col leading-none">
        <span className={`font-extrabold tracking-tight ${text}`}>
          pumpfoil<span className="text-brand-400">.org</span>
        </span>
        {tagline && (
          <span className="mt-1.5 text-[0.5em] font-semibold uppercase tracking-[0.3em] text-slate-400">
            track every pump
          </span>
        )}
      </span>
    </span>
  );
}
