import { useEffect, useState } from "react";
import { computeFoilPowerAtSpeed, DEFAULT_RIDER, FoilDims, PumpParams } from "../lib/foilPhysics";
import { api } from "../lib/api";
import { Card } from "./ui";
import { InfoIcon } from "./Icons";
import { useT } from "../i18n";

// Ohne erkannte Pump-Frequenz (z. B. TCX/GPX/FIT-Import, kein Roh-Accel) wird die
// Pump-Trägheit pauschal angesetzt — sie ist in der Praxis recht konstant.
const FALLBACK_INERTIA_W = 50;

// Kompakte Stat-Kachel: theoretische Leistung bei Ø-Speed (+ (i)-Tooltip).
export function FoilPowerStat({ foil, avgKmh, pumpHz, estimated }: {
  foil: FoilDims & { brand: string; model: string; size: string };
  avgKmh: number | null;
  pumpHz: number | null;
  estimated?: boolean;
}) {
  const t = useT();
  const [weight, setWeight] = useState<number | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      const w = Number(s.weight_kg);
      setWeight(Number.isFinite(w) && w > 0 ? w : DEFAULT_RIDER.riderWeight);
    }).catch(() => setWeight(DEFAULT_RIDER.riderWeight));
  }, []);

  if (!foil.span_cm || !foil.area_cm2 || !foil.thickness_mm || !avgKmh || avgKmh <= 0) return null;

  const rider = { riderWeight: weight ?? DEFAULT_RIDER.riderWeight, equipmentWeight: DEFAULT_RIDER.equipmentWeight };
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
    <Card className="relative overflow-hidden p-1.5">
      <button type="button" title={tip} aria-label={tip}
        className="absolute right-1 top-1 text-slate-400 hover:text-slate-200">
        <InfoIcon className="h-3 w-3" />
      </button>
      <div className="flex items-baseline gap-1 leading-none">
        <span className="text-base font-bold tabular-nums text-brand-400 sm:text-lg">{total}</span>
        <span className="text-[11px] text-slate-400">W{pump ? "" : "*"}</span>
      </div>
      <div className="mt-1 text-[10px] uppercase leading-tight tracking-wide text-slate-300">{t("power.title")}</div>
    </Card>
  );
}
