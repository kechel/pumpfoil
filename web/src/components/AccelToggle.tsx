import { useT } from "../i18n";

// Umschalter „nur Accel" / „alle" (inkl. GPS-only-Läufe mit erkanntem On-Foil).
// Wiederverwendet in Community, Sessions und Spots.
/**
 * „nur Accel" / „alle" — und auf der Sessions-Seite als dritte Taste „Handy am Brett" (Jan,
 * 08.10.2026). Die dritte erscheint nur, wenn `onBrett` gesetzt ist; ist `brett` an, leuchtet nur sie.
 */
export function AccelToggle({ value, onChange, className = "", brett = false, onBrett }: {
  value: boolean; onChange: (v: boolean) => void; className?: string;
  brett?: boolean; onBrett?: () => void;
}) {
  const t = useT();
  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-slate-700 text-[11px] font-medium ${className}`} title={t("side.recordsHint")}>
      <button onClick={() => onChange(true)}
        className={`px-2.5 py-0.5 ${value && !brett ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
        {t("side.onlyAccel")}
      </button>
      <button onClick={() => onChange(false)}
        className={`px-2.5 py-0.5 ${!value && !brett ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
        {t("side.all")}
      </button>
      {onBrett && (
        <button onClick={onBrett}
          className={`px-2.5 py-0.5 ${brett ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
          {t("side.phoneOnBoard")}
        </button>
      )}
    </div>
  );
}
