import { useEffect, useMemo, useState } from "react";
import { api, Foil } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { useT } from "../i18n";

// Foil-Katalog browsen + eigenes Standard-Foil wählen (gespeichert in Settings.foil_id).
export default function Foils() {
  const t = useT();
  const [foils, setFoils] = useState<Foil[] | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");
  const [myFoilId, setMyFoilId] = useState<number | null>(null);

  useEffect(() => {
    api.foils().then(setFoils).catch(() => setFoils([]));
    api.foilBrands().then(setBrands).catch(() => {});
    api.getSettings().then((s) => setMyFoilId((s.foil_id as number) ?? null)).catch(() => {});
  }, []);

  const shown = useMemo(() => {
    if (!foils) return [];
    const ql = q.trim().toLowerCase();
    return foils.filter((f) =>
      (!brand || f.brand === brand) &&
      (!ql || `${f.brand} ${f.model} ${f.size}`.toLowerCase().includes(ql)));
  }, [foils, brand, q]);

  function choose(id: number) {
    const next = myFoilId === id ? null : id; // nochmal tippen = abwählen
    setMyFoilId(next);
    api.saveSettings({ foil_id: next }).catch(() => {});
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-xl font-bold">{t("foils.title")}</h2>
      <p className="mb-4 text-sm text-slate-300">{t("foils.hint")}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("foils.search")}
          className="min-w-[12rem] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        <select value={brand} onChange={(e) => setBrand(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100">
          <option value="">{t("foils.allBrands")}</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {!foils ? <Spinner /> : (
        <div className="space-y-2">
          {shown.map((f) => {
            const mine = f.id === myFoilId;
            return (
              <Card key={f.id} onClick={() => choose(f.id)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-800/60 ${mine ? "border-brand-500" : ""}`}>
                <div className="min-w-0">
                  <div className="font-semibold">{f.brand} {f.model} <span className="text-slate-400">{f.size}</span></div>
                  <div className="text-xs text-slate-400">
                    {f.area_cm2} cm² · {f.span_cm} cm · AR {f.aspect_ratio ?? "–"} · {f.thickness_mm} mm
                  </div>
                </div>
                <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${mine ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}>
                  {mine ? t("foils.mine") : t("foils.choose")}
                </span>
              </Card>
            );
          })}
          <p className="pt-2 text-xs text-slate-500">{t("foils.count", { n: shown.length })}</p>
        </div>
      )}
    </div>
  );
}
