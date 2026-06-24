import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, Foil } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { ChevronIcon } from "../components/Icons";
import {
  calculateAR, calculateMeanChord, calculateThicknessRatio, calculateCLmax,
  calculateStallSpeed, calculateMinViableSpeed, calculateOptimalSpeed,
  computeFoilPowerAtSpeed, DEFAULT_RIDER, DEFAULT_MAST, DEFAULT_PUMP,
  RiderParams, MastParams, PumpParams,
} from "../lib/foilPhysics";
import { useT } from "../i18n";

const SPEEDS = [10, 12, 14, 16, 18, 20];

// Nativer Foil-Rechner: Vergleich mehrerer Foils (Basis-Kennwerte + theoretische
// Leistung über Geschwindigkeiten) auf Basis des geporteten Physik-Moduls.
export default function FoilCalculator() {
  const t = useT();
  const [foils, setFoils] = useState<Foil[] | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number[]>([]);

  const [rider, setRider] = useState<RiderParams>(DEFAULT_RIDER);
  const [mast, setMast] = useState<MastParams>(DEFAULT_MAST);
  const [withPump, setWithPump] = useState(false);
  const [pump, setPump] = useState<PumpParams>(DEFAULT_PUMP);

  useEffect(() => {
    api.foils().then(setFoils).catch(() => setFoils([]));
    api.foilBrands().then(setBrands).catch(() => {});
    api.getSettings().then((s) => {
      const my = (s.my_foils as number[]) ?? [];
      setSel(my);
      const w = Number(s.weight_kg);
      if (Number.isFinite(w) && w > 0) setRider((r) => ({ ...r, riderWeight: w }));
    }).catch(() => {});
  }, []);

  const byId = useMemo(() => new Map((foils ?? []).map((f) => [f.id, f])), [foils]);
  const selected = useMemo(() => sel.map((id) => byId.get(id)).filter(Boolean) as Foil[], [sel, byId]);

  const filtered = useMemo(() => {
    if (!foils) return [];
    const ql = q.trim().toLowerCase();
    return foils.filter((f) =>
      (!brand || f.brand === brand) &&
      (!ql || `${f.brand} ${f.model} ${f.size}`.toLowerCase().includes(ql)));
  }, [foils, brand, q]);

  function toggle(id: number) {
    setSel((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  const pumpOpt = withPump ? pump : undefined;

  if (!foils) return <Spinner />;

  return (
    <div className="w-full">
      <Link to="/einstellungen" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("nav.profile")}
      </Link>
      <h2 className="mb-1 flex items-center gap-2 text-2xl font-bold"><span>🧮</span> {t("calc.title")}</h2>
      <p className="mb-5 text-sm text-slate-400">{t("calc.intro")}</p>

      {/* Parameter */}
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label={t("calc.riderWeight")}>
            <NumInput value={rider.riderWeight} min={30} max={200} onChange={(v) => setRider({ ...rider, riderWeight: v })} unit="kg" />
          </Field>
          <Field label={t("calc.equipWeight")}>
            <NumInput value={rider.equipmentWeight} min={0} max={40} onChange={(v) => setRider({ ...rider, equipmentWeight: v })} unit="kg" />
          </Field>
          <Field label={t("calc.mastDiameter")}>
            <select value={mast.mastDiameter_mm} onChange={(e) => setMast({ ...mast, mastDiameter_mm: Number(e.target.value) })} className={selCls}>
              <option value={19}>19 mm</option>
              <option value={17}>17 mm</option>
            </select>
          </Field>
          <Field label={t("calc.mastDepth")}>
            <select value={mast.mastDepth_m} onChange={(e) => setMast({ ...mast, mastDepth_m: Number(e.target.value) })} className={selCls}>
              {[0.2, 0.3, 0.4, 0.5].map((d) => <option key={d} value={d}>{d * 100} cm</option>)}
            </select>
          </Field>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={withPump} onChange={(e) => setWithPump(e.target.checked)} />
          {t("calc.withPump")}
        </label>
        {withPump && (
          <div className="mt-3 grid grid-cols-3 gap-4">
            <Field label={t("calc.pumpFreq")}>
              <NumInput value={pump.pumpFreq_hz} min={0.3} max={3} step={0.1} onChange={(v) => setPump({ ...pump, pumpFreq_hz: v })} unit="Hz" />
            </Field>
            <Field label={t("calc.heaveAmp")}>
              <NumInput value={pump.heaveAmp_cm} min={1} max={40} onChange={(v) => setPump({ ...pump, heaveAmp_cm: v })} unit="cm" />
            </Field>
            <Field label={t("calc.recoveryLoss")}>
              <NumInput value={pump.recoveryLoss_pct} min={0} max={100} onChange={(v) => setPump({ ...pump, recoveryLoss_pct: v })} unit="%" />
            </Field>
          </div>
        )}
      </Card>

      {/* Foil-Auswahl */}
      <Card className="mb-5 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("foils.search")} className={selCls + " flex-1 min-w-[140px]"} />
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className={selCls}>
            <option value="">{t("foils.allBrands")}</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800">
          {filtered.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-800/60 px-3 py-1.5 text-sm last:border-0 hover:bg-slate-800/40">
              <input type="checkbox" checked={sel.includes(f.id)} onChange={() => toggle(f.id)} />
              <span className="text-slate-200">{f.brand} {f.model} {f.size}</span>
              <span className="ml-auto text-xs text-slate-500">{f.area_cm2} cm² · AR {f.aspect_ratio ?? "–"}</span>
            </label>
          ))}
          {filtered.length === 0 && <p className="p-3 text-sm text-slate-400">{t("foils.none")}</p>}
        </div>
      </Card>

      {selected.length === 0 ? (
        <Card className="p-8 text-center text-slate-300">{t("calc.pickHint")}</Card>
      ) : (
        <>
          <BasicsTable foils={selected} rider={rider} t={t} />
          <PowerTable foils={selected} rider={rider} mast={mast} pump={pumpOpt} t={t} />
          <p className="mt-3 text-xs text-slate-500">{t("calc.disclaimer")}</p>
        </>
      )}
    </div>
  );
}

const selCls = "rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function NumInput({ value, onChange, min, max, step = 1, unit }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }}
        className={selCls + " w-full"} />
      {unit && <span className="text-xs text-slate-400">{unit}</span>}
    </span>
  );
}

const th = "px-2 py-1.5 text-left font-medium text-slate-400 whitespace-nowrap";
const td = "px-2 py-1.5 whitespace-nowrap";

function BasicsTable({ foils, rider, t }: { foils: Foil[]; rider: RiderParams; t: (k: string) => string }) {
  return (
    <Card className="mb-5 overflow-x-auto p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-200">{t("calc.basics")}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            <th className={th}>Foil</th>
            <th className={th}>AR</th>
            <th className={th}>{t("calc.chord")}</th>
            <th className={th}>t/c</th>
            <th className={th}>CLmax</th>
            <th className={th}>{t("calc.stall")}</th>
            <th className={th}>{t("calc.minViable")}</th>
            <th className={th}>{t("calc.optimal")}</th>
          </tr>
        </thead>
        <tbody>
          {foils.map((f) => {
            const ar = calculateAR(f.span_cm, f.area_cm2);
            const chord = calculateMeanChord(f.area_cm2, ar) * 100;
            const tc = calculateThicknessRatio(f.thickness_mm, f.area_cm2, ar);
            const clmax = calculateCLmax(ar, f.thickness_mm, f.area_cm2, 15);
            const stall = calculateStallSpeed(f.area_cm2, clmax, rider);
            const minV = Math.max(stall, calculateMinViableSpeed(f.area_cm2, clmax, rider));
            const opt = calculateOptimalSpeed(stall);
            return (
              <tr key={f.id} className="border-b border-slate-800/50">
                <td className={td + " text-slate-200"}>{f.brand} {f.model} {f.size}</td>
                <td className={td}>{ar.toFixed(1)}</td>
                <td className={td}>{chord.toFixed(1)} cm</td>
                <td className={td}>{f.thickness_estimated ? "≈ " : ""}{(tc * 100).toFixed(1)}%</td>
                <td className={td}>{clmax.toFixed(2)}</td>
                <td className={td}>{stall.toFixed(1)}</td>
                <td className={td}>{minV.toFixed(1)}</td>
                <td className={td}>{opt} km/h</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function PowerTable({ foils, rider, mast, pump, t }: {
  foils: Foil[]; rider: RiderParams; mast: MastParams; pump: PumpParams | undefined; t: (k: string) => string;
}) {
  // Pro Foil: Leistung je Speed (oder null, wenn unter Stall/Min-Viable -> kein Foilen).
  const rows = foils.map((f) => {
    const ar = calculateAR(f.span_cm, f.area_cm2);
    const clmax = calculateCLmax(ar, f.thickness_mm, f.area_cm2, 15);
    const stall = calculateStallSpeed(f.area_cm2, clmax, rider);
    const minV = Math.max(stall, calculateMinViableSpeed(f.area_cm2, clmax, rider));
    const cells = SPEEDS.map((s) => s + 0.001 < minV ? null
      : Math.round(computeFoilPowerAtSpeed(f, s, { rider, mast, pump }).power));
    return { f, cells };
  });
  // Niedrigste (beste) Leistung je Spalte hervorheben.
  const best = SPEEDS.map((_, ci) => {
    const vals = rows.map((r) => r.cells[ci]).filter((v): v is number => v != null);
    return vals.length ? Math.min(...vals) : null;
  });

  return (
    <Card className="overflow-x-auto p-4">
      <h3 className="mb-1 text-sm font-semibold text-slate-200">{t("calc.power")}</h3>
      <p className="mb-3 text-xs text-slate-500">{t("calc.powerNote")}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            <th className={th}>Foil</th>
            {SPEEDS.map((s) => <th key={s} className={th + " text-right"}>{s}<br /><span className="text-[10px]">km/h</span></th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ f, cells }) => (
            <tr key={f.id} className="border-b border-slate-800/50">
              <td className={td + " text-slate-200"}>{f.brand} {f.model} {f.size}</td>
              {cells.map((v, ci) => (
                <td key={ci} className={td + " text-right tabular-nums " + (v == null ? "text-slate-600" : v === best[ci] ? "font-semibold text-brand-400" : "text-slate-200")}>
                  {v == null ? "–" : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
