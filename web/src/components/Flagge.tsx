import { flaggeUrl, landName } from "../lib/laender";
import { useI18n } from "../i18n";

/** Kleine Flagge vor dem Profilbild in Bestenlisten (Olek, 02.11.2026) — nur wer seine Nationalitaet im Profil
 *  eingestellt hat (Gaeste bekommen das Land vom Server gar nicht). Ohne Land bleibt nichts stehen. */
export function Flagge({ land }: { land?: string | null }) {
  const { lang } = useI18n();
  if (!land) return null;
  const name = landName(land, lang);
  return <img src={flaggeUrl(land)} alt={name} title={name} loading="lazy"
              className="h-3 w-[18px] shrink-0 rounded-[2px] border border-slate-700 object-cover" />;
}
