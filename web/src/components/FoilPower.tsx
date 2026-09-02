import { useState } from "react";
import { computeFoilPowerAtSpeed, DEFAULT_RIDER, FoilDims, PumpParams } from "../lib/foilPhysics";
import { Card, InfoDialog, InfoKnopf } from "./ui";
import { useT } from "../i18n";

// Ohne erkannte Pump-Frequenz (z. B. TCX/GPX/FIT-Import, kein Roh-Accel) wird die
// Pump-Trägheit pauschal angesetzt — sie ist in der Praxis recht konstant.
const FALLBACK_INERTIA_W = 50;

// Kompakte Stat-Kachel: theoretische Leistung bei Ø-Speed (+ (i)-Tooltip).
export function FoilPowerStat({ foil, avgKmh, pumpHz, estimated, weightKg }: {
  foil: FoilDims & { brand: string; model: string; size: string };
  avgKmh: number | null;
  pumpHz: number | null;
  estimated?: boolean;
  /** Gewicht des FAHRERS dieser Session in kg — PFLICHT. Die Kachel holte es sich frueher selbst
   *  aus dem Profil des Betrachters; auf dem oeffentlichen Teilen-Link scheiterte das (401) und
   *  sie fiel auf 95 kg zurueck, bei fremden Sessions rechnete sie mit dem falschen Gewicht.
   *  Wer die Kachel einsetzt, entscheidet das bewusst — `riderWeightFor()` in lib/foilPhysics.ts
   *  ist die gemeinsame Regel dafuer. */
  weightKg: number;
}) {
  const t = useT();
  // Erklärung im selben Popup wie bei „Läufe/Starts" (Jan, 02.09.). Vorher hing sie in einem
  // `title`-Tooltip — auf dem Handy also unsichtbar, wo die meisten die Seite ansehen.
  const [offen, setOffen] = useState(false);

  if (!foil.span_cm || !foil.area_cm2 || !foil.thickness_mm || !avgKmh || avgKmh <= 0) return null;

  const rider = { riderWeight: weightKg, equipmentWeight: DEFAULT_RIDER.equipmentWeight };
  const pump: PumpParams | undefined = pumpHz && pumpHz > 0
    ? { heaveAmp_cm: 12, pumpFreq_hz: pumpHz, recoveryLoss_pct: 35 } : undefined;
  const r = computeFoilPowerAtSpeed(foil, avgKmh, { rider, pump });
  const inertia = pump ? r.inertiaPower : FALLBACK_INERTIA_W;
  const total = Math.round(r.dragPower + inertia);

  const tip = t("power.tip", {
    foil: `${foil.brand} ${foil.model} ${foil.size}`,
    weight: String(rider.riderWeight + rider.equipmentWeight),
    speed: avgKmh.toFixed(1),
    drag: String(Math.round(r.dragPower)),
    inertia: String(Math.round(inertia)),
    note: pump ? "" : ` (${t("power.estPump")})`,
  }) + (estimated ? ` · ${t("power.estimated")}` : "");

  return (
    <>
    <Card className="relative overflow-hidden p-1.5">
      <InfoKnopf label={t("power.title")} onClick={() => setOffen(true)} />
      <div className="flex items-baseline gap-1 leading-none">
        <span className="text-base font-bold tabular-nums text-brand-400 sm:text-lg">{total}</span>
        <span className="text-[11px] text-slate-400">W{pump ? "" : "*"}</span>
      </div>
      <div className="mt-1 text-[10px] uppercase leading-tight tracking-wide text-slate-300">{t("power.title")}</div>
    </Card>
    {offen && <InfoDialog title={t("power.title")} text={tip} onClose={() => setOffen(false)} />}
    </>
  );
}
