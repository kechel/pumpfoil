import { setPumpUnit, usePumpUnit, type PumpUnit } from "../lib/pumpRate";
import { useT } from "../i18n";

// Umschalter für die Anzeige der Pump-Kadenz: Hz oder Pumps pro Minute.
// Wirkt sofort in allen Ansichten und wird im Profil gesichert (nur Darstellung —
// Analyse, Rekorde und gespeicherte Werte bleiben unverändert).
export function PumpUnitSelect() {
  const t = useT();
  const unit = usePumpUnit();
  const opts: { v: PumpUnit; label: string }[] = [
    { v: "hz", label: t("pumpunit.hz") },
    { v: "ppm", label: t("pumpunit.ppm") },
  ];
  return (
    <div className="inline-flex gap-1 rounded-xl border border-slate-700 bg-slate-900/60 p-1">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => setPumpUnit(o.v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            unit === o.v ? "bg-brand-500 text-slate-950" : "text-slate-200 hover:bg-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
