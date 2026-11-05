import { KONTINENT_PFADE } from "../lib/kontinente";
import { LAENDER, flaggeUrl, landName } from "../lib/laender";
import { useI18n, type TFunc } from "../i18n";

/** Team-Herkunft (Jan, 03.11.2026): Land als Flagge, Kontinent oder die ganze Erde als Umriss im Flaggen-Kaestchen
 *  plus Kuerzel (EU, AF, AS, NA, SA, OC, EARTH — in jeder Sprache gleich). Der Name steht im Tooltip. Gespeichert als
 *  ISO-Code ("PL") bzw. "k:<kuerzel>" (server/app/teams.py KONTINENTE). */
export const KONTINENTE = ["k:earth", "k:eu", "k:af", "k:as", "k:na", "k:sa", "k:oc"] as const;

// Kontinent-Namen als eigene Texte (region.*): Safari kennt die UN-M49-Regionen in Intl.DisplayNames nicht und zeigt
// dort nur „150" (03.11.2026).
export function herkunftName(land: string, lang: string, t: TFunc): string {
  return land.startsWith("k:") ? t(`region.${land.slice(2)}`) : landName(land, lang);
}

// `kuerzel={false}`: nur der Umriss, ohne „EU" daneben — wo der Name ohnehin dabeisteht (Regionsauswahl, 05.11.2026).
export function TeamHerkunft({ land, gross = false, kuerzel = true }: { land?: string | null; gross?: boolean; kuerzel?: boolean }) {
  const { lang, t } = useI18n();
  if (!land) return null;
  const name = herkunftName(land, lang, t);
  const box = gross ? "h-4 w-6" : "h-3 w-[18px]";
  if (!land.startsWith("k:")) {
    if (!LAENDER.includes(land)) return null;
    return <img src={flaggeUrl(land)} alt={name} title={name} loading="lazy"
                className={`${box} shrink-0 rounded-[2px] border border-slate-700 object-cover`} />;
  }
  const k = land.slice(2);
  const pfad = KONTINENT_PFADE[k];
  if (!pfad) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={name}>
      <svg viewBox="0 0 48 36" role="img" aria-label={name}
        className={`${box} shrink-0 rounded-[2px] border border-slate-700 bg-slate-900 text-brand-400`}>
        <path d={pfad} fill="currentColor" />
      </svg>
      {kuerzel && <span className={`${gross ? "text-xs" : "text-[10px]"} font-semibold uppercase leading-none tracking-wide text-slate-400`}>{k}</span>}
    </span>
  );
}
