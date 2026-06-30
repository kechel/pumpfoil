import { WaveIcon } from "./Icons";

// Pumpfoil-Wortmarke als Vektor-Lockup (theme-fähig). Entspricht dem Marken-Lockup
// (store-assets/logo, docs/BRAND.md).
//
// Layout:
//   stacked=false (default) -> horizontal: Wellen LINKS neben „pumpfoil.org" (Header).
//   stacked=true            -> Wellen OBEN, darunter „pumpfoil.org" (+ Tagline) zentriert
//                              — wie das große PNG-Lockup, z. B. in der App-Sidebar.
//
// Light/Dark: „.org" + Wellen nutzen text-brand-400 (in `html.theme-light` auf ein
// dunkleres Cyan überschrieben -> lesbar). „pumpfoil" erbt die Textfarbe des Kontexts
// (kippt mit dem Theme). Tagline = slate-400 (kippt automatisch via CSS-Variablen).
// Für den großen Marketing-Hero bleibt das PNG (exakte Avenir-Next-Schrift).
export function Wordmark({
  className = "",
  icon = "h-7 w-7",
  text = "text-xl",
  tagline = false,
  stacked = false,
}: {
  className?: string;
  icon?: string;
  text?: string;
  tagline?: boolean;
  stacked?: boolean;
}) {
  const mark = (
    <span className={`flex flex-col leading-none ${stacked ? "items-center text-center" : ""}`}>
      <span className={`font-extrabold tracking-tight ${text}`}>
        pumpfoil<span className="text-brand-400">.org</span>
      </span>
      {tagline && (
        <span className="mt-1.5 text-[0.5em] font-semibold uppercase tracking-[0.3em] text-slate-400">
          track every pump
        </span>
      )}
    </span>
  );

  if (stacked) {
    return (
      <span className={`inline-flex flex-col items-center gap-2 ${className}`}>
        <WaveIcon className={`${icon} shrink-0 text-brand-400`} />
        {mark}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <WaveIcon className={`${icon} shrink-0 text-brand-400`} />
      {mark}
    </span>
  );
}
