import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useT } from "../i18n";
import { Card } from "./ui";

/**
 * Windfenster des Spots (19.10.2026, Stand-Buch: windfenster): aus welcher Richtung der Wind bei den
 * Wing-/Kite-/Parawing-Sessions hier kam. 8 Sektoren, Laenge = Zahl der Sessions. Erst ab drei
 * Sessions mit Winddaten — darunter waere es Zufall.
 */
export default function SpotWindfenster({ spotId }: { spotId: number }) {
  const t = useT();
  const [d, setD] = useState<Awaited<ReturnType<typeof api.spotWindfenster>> | null>(null);
  useEffect(() => { api.spotWindfenster(spotId).then(setD).catch(() => setD(null)); }, [spotId]);
  if (!d || d.sessions < 3) return null;
  const max = Math.max(...d.sektoren.map((s) => s.sessions), 1);
  const R = 46;
  const keil = (richtung: number, anteil: number) => {
    // Keil zeigt in die Richtung, AUS der der Wind kommt (Norden oben), 40 Grad breit
    const r = 6 + (R - 6) * anteil;
    const a1 = ((richtung - 20) * Math.PI) / 180, a2 = ((richtung + 20) * Math.PI) / 180;
    const p = (a: number, rr: number) => `${50 + rr * Math.sin(a)},${50 - rr * Math.cos(a)}`;
    return `M50,50 L${p(a1, r)} A${r},${r} 0 0,1 ${p(a2, r)} Z`;
  };
  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" aria-hidden="true">
          <circle cx="50" cy="50" r={R} className="fill-none stroke-slate-700" strokeWidth="0.8" />
          <circle cx="50" cy="50" r={R / 2} className="fill-none stroke-slate-800" strokeWidth="0.6" />
          {d.sektoren.filter((s) => s.sessions > 0).map((s) => (
            <path key={s.richtung} d={keil(s.richtung, s.sessions / max)} className="fill-brand-500/70 stroke-brand-400" strokeWidth="0.6" />
          ))}
          <text x="50" y="9" textAnchor="middle" className="fill-slate-400" fontSize="8">N</text>
        </svg>
        <div className="min-w-0">
          <div className="font-semibold">{t("spot.windTitle")}</div>
          {d.kmh_p25 != null && d.kmh_p75 != null && (
            <div className="text-sm text-slate-300">
              {t("spot.windText", { n: String(d.sessions), a: String(Math.round(d.kmh_p25)), b: String(Math.round(d.kmh_p75)) })}
            </div>
          )}
          <div className="mt-1 text-xs text-slate-400">{t("spot.windNote")}</div>
        </div>
      </div>
    </Card>
  );
}
