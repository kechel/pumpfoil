import { useT } from "../i18n";

// Umschalter „nur Accel" / „alle" (inkl. GPS-only-Läufe mit erkanntem On-Foil).
// Wiederverwendet in Community, Sessions und Spots.
export function AccelToggle({ value, onChange, className = "" }: {
  value: boolean; onChange: (v: boolean) => void; className?: string;
}) {
  const t = useT();
  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-slate-700 text-[11px] font-medium ${className}`} title={t("side.recordsHint")}>
      <button onClick={() => onChange(true)}
        className={`px-2.5 py-0.5 ${value ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
        {t("side.onlyAccel")}
      </button>
      <button onClick={() => onChange(false)}
        className={`px-2.5 py-0.5 ${!value ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
        {t("side.all")}
      </button>
    </div>
  );
}
