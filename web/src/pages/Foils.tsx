import { useEffect, useMemo, useState } from "react";
import { api, Foil } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { useT } from "../i18n";

// Foil-Katalog: mehrere als „meine" merken, eines als Standard (★).
export default function Foils() {
  const t = useT();
  const [foils, setFoils] = useState<Foil[] | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState<number[]>([]);
  const [def, setDef] = useState<number | null>(null);

  useEffect(() => {
    api.foils().then(setFoils).catch(() => setFoils([]));
    api.foilBrands().then(setBrands).catch(() => {});
    api.getSettings().then((s) => {
      setMine((s.my_foils as number[]) ?? []);
      setDef((s.foil_id as number) ?? null);
    }).catch(() => {});
  }, []);

  function persist(nextMine: number[], nextDef: number | null) {
    setMine(nextMine); setDef(nextDef);
    api.saveSettings({ my_foils: nextMine, foil_id: nextDef }).catch(() => {});
  }
  function toggleMine(id: number) {
    if (mine.includes(id)) {
      const nm = mine.filter((x) => x !== id);
      persist(nm, def === id ? null : def); // war es Default -> Default entfernen
    } else {
      persist([...mine, id], def);
    }
  }
  function setDefault(id: number) {
    persist(mine.includes(id) ? mine : [...mine, id], def === id ? null : id);
  }

  const filtered = useMemo(() => {
    if (!foils) return [];
    const ql = q.trim().toLowerCase();
    return foils.filter((f) =>
      (!brand || f.brand === brand) &&
      (!ql || `${f.brand} ${f.model} ${f.size}`.toLowerCase().includes(ql)));
  }, [foils, brand, q]);

  // „Meine" zuerst (Default ganz oben), dann der Rest.
  const sorted = useMemo(() => {
    const rank = (f: Foil) => (f.id === def ? 0 : mine.includes(f.id) ? 1 : 2);
    return [...filtered].sort((a, b) => rank(a) - rank(b));
  }, [filtered, mine, def]);

  if (!foils) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-1 text-xl font-bold">{t("foils.title")}</h2>
      <p className="mb-4 text-sm text-slate-300">{t("foils.hint")}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("foils.search")}
          className="min-w-[12rem] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
        <select value={brand} onChange={(e) => setBrand(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100">
          <option value="">{t("foils.allBrands")}</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {sorted.map((f) => {
          const isMine = mine.includes(f.id);
          const isDef = f.id === def;
          return (
            <Card key={f.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${isDef ? "border-brand-500" : isMine ? "border-slate-600" : ""}`}>
              <div className="min-w-0">
                <div className="font-semibold">{f.brand} {f.model} <span className="text-slate-400">{f.size}</span></div>
                <div className="text-xs text-slate-400">{f.area_cm2} cm² · {f.span_cm} cm · AR {f.aspect_ratio ?? "–"} · {f.thickness_mm} mm</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => setDefault(f.id)} title={t("foils.setDefault")}
                  className={`rounded-lg px-2 py-1.5 text-sm ${isDef ? "bg-brand-500 text-slate-950" : "text-slate-400 hover:text-amber-300"}`}>
                  {isDef ? "★" : "☆"}
                </button>
                <button onClick={() => toggleMine(f.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${isMine ? "bg-slate-700 text-slate-100" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                  {isMine ? t("foils.remove") : t("foils.add")}
                </button>
              </div>
            </Card>
          );
        })}
        <p className="pt-2 text-xs text-slate-500">{t("foils.count", { n: sorted.length })}</p>
      </div>
    </div>
  );
}
