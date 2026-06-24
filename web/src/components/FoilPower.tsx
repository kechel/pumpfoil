import { useEffect, useState } from "react";
import { computeFoilPowerAtSpeed, DEFAULT_RIDER, FoilDims, PumpParams } from "../lib/foilPhysics";
import { api } from "../lib/api";
import { Card } from "./ui";
import { useT } from "../i18n";

// Theoretische Leistung für das gewählte Foil bei den real gemessenen Geschwindigkeiten.
// Nutzt das geportete Physik-Modul (foilPhysics) + Fahrergewicht aus den Einstellungen.
export function FoilPower({ foil, avgKmh, maxKmh, pumpHz }: {
  foil: FoilDims & { brand: string; model: string; size: string };
  avgKmh: number | null;
  maxKmh: number | null;
  pumpHz: number | null;
}) {
  const t = useT();
  const [weight, setWeight] = useState<number | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      const w = Number(s.weight_kg);
      setWeight(Number.isFinite(w) && w > 0 ? w : DEFAULT_RIDER.riderWeight);
    }).catch(() => setWeight(DEFAULT_RIDER.riderWeight));
  }, []);

  if (!foil.span_cm || !foil.area_cm2 || !foil.thickness_mm) return null;
  const rider = { riderWeight: weight ?? DEFAULT_RIDER.riderWeight, equipmentWeight: DEFAULT_RIDER.equipmentWeight };
  // Reale Pump-Frequenz (falls erkannt) für den Trägheitsanteil; sonst nur Vortrieb.
  const pump: PumpParams | undefined = pumpHz && pumpHz > 0
    ? { heaveAmp_cm: 12, pumpFreq_hz: pumpHz, recoveryLoss_pct: 35 } : undefined;

  const rows = ([
    [t("power.avg"), avgKmh],
    [t("power.max"), maxKmh],
  ] as [string, number | null][]).filter(([, v]) => v && v > 0);
  if (rows.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{t("power.title")}</h3>
        <span className="text-xs text-slate-400">{foil.brand} {foil.model} {foil.size}</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        {t("power.basis", { weight: String(rider.riderWeight + rider.equipmentWeight) })}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {rows.map(([label, kmh]) => {
          const r = computeFoilPowerAtSpeed(foil, kmh as number, { rider, pump });
          return (
            <div key={label} className="rounded-xl bg-slate-900/60 p-3">
              <div className="text-xs text-slate-400">{label} · {(kmh as number).toFixed(1)} km/h</div>
              <div className="text-2xl font-bold text-brand-400">{Math.round(r.power)} <span className="text-base font-normal text-slate-400">W</span></div>
              <div className="mt-1 text-[11px] text-slate-500">
                {t("power.drag")} {Math.round(r.dragPower)} W
                {pump ? ` · ${t("power.pump")} ${Math.round(r.inertiaPower)} W` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
