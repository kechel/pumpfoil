import { flaggeUrl, landName } from "../lib/laender";
import { useI18n } from "../i18n";

/** Kleine Flagge nach dem Profilbild in Bestenlisten (Olek, 02.11.2026) — nur wer seine Nationalitaet im Profil
 *  eingestellt hat (Gaeste bekommen das Land vom Server gar nicht). Ohne Land bleibt der Platz leer, damit die
 *  Namen buendig stehen (Jan, 03.11.2026); dasselbe macht das geteilte Bild (lib/bestenlisteBild.ts). */
export function Flagge({ land }: { land?: string | null }) {
  const { lang } = useI18n();
  if (!land) return <span className="h-3 w-[18px] shrink-0" aria-hidden />;
  const name = landName(land, lang);
  return <img src={flaggeUrl(land)} alt={name} title={name} loading="lazy"
              className="h-3 w-[18px] shrink-0 rounded-[2px] border border-slate-700 object-cover" />;
}
