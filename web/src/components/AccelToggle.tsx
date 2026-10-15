import { useT } from "../i18n";

// Umschalter „nur Accel" / „alle" (inkl. GPS-only-Läufe mit erkanntem On-Foil).
// Wiederverwendet in Community, Sessions und Spots.
/**
 * „nur Accel" / „alle" — und auf der Sessions-Seite als dritte Taste „Handy am Brett" (Jan,
 * 08.10.2026). Die dritte erscheint nur, wenn `onBrett` gesetzt ist; ist `brett` an, leuchtet nur sie.
 */
export function AccelToggle({ value, onChange, className = "", brett = false, onBrett, freunde = false, onFreunde }: {
  value: boolean; onChange: (v: boolean) => void; className?: string;
  brett?: boolean; onBrett?: () => void;
  // Community-Seite (15.10.2026): dritte Taste „Freunde" — wie „alle", nur auf mich + Freunde.
  freunde?: boolean; onFreunde?: () => void;
}) {
  const t = useT();
  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-slate-700 text-[11px] font-medium ${className}`} title={t("side.recordsHint")}>
      {/* Kurz „accel" in allen Sprachen (Jan, 13.10.2026: passt so auch auf schmalen Displays in
          eine Zeile); die volle Bezeichnung im Tooltip. */}
      <button onClick={() => onChange(true)} title={t("side.onlyAccel")}
        className={`px-2.5 py-0.5 ${value && !brett && !freunde ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
        accel
      </button>
      <button onClick={() => onChange(false)}
        className={`px-2.5 py-0.5 ${!value && !brett && !freunde ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
        {t("side.all")}
      </button>
      {onBrett && (
        // „POB" (phone on board) in allen Sprachen, Jan 13.10.2026 — kurz, die Zeile bricht sonst um;
        // die volle Bezeichnung steht im Tooltip.
        <button onClick={onBrett} title={t("side.phoneOnBoard")}
          className={`px-2.5 py-0.5 ${brett ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
          POB
        </button>
      )}
      {onFreunde && (
        <button onClick={onFreunde}
          className={`px-2.5 py-0.5 ${freunde ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
          {t("friends.title")}
        </button>
      )}
    </div>
  );
}
