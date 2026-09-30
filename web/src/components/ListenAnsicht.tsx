import { useT } from "../i18n";
import { KachelnIcon, ListIcon } from "./Icons";
import { setKompakteListe, useKompakteListe } from "../lib/kompakteListe";

// Umschalter Kacheln / Zeilen fuer die Session-Listen (s. lib/kompakteListe.ts). Zwei Symbole statt
// eines Wortes: passt in jede Werkzeugzeile, ohne umzubrechen; was sie tun, sagen Titel und
// aria-label in der Sprache des Nutzers.
export function ListenAnsicht({ className = "" }: { className?: string }) {
  const t = useT();
  const kompakt = useKompakteListe();
  const knopf = (an: boolean, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => setKompakteListe(an)} title={label} aria-label={label}
      aria-pressed={kompakt === an}
      className={`flex items-center justify-center rounded-lg px-2 py-1.5 transition-colors ${
        kompakt === an ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
      {icon}
    </button>
  );
  return (
    <div className={`inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-slate-700 bg-slate-900 p-0.5 ${className}`}>
      {knopf(false, t("list.cards"), <KachelnIcon className="h-4 w-4" />)}
      {knopf(true, t("list.compact"), <ListIcon className="h-4 w-4" />)}
    </div>
  );
}
