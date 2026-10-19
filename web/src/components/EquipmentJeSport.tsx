import { useEffect, useMemo, useState } from "react";
import { api, Board, Foil, Stab } from "../lib/api";
import { SPORTS } from "../lib/sportClass";
import { Card } from "./ui";
import { CloseIcon } from "./Icons";
import { useT } from "../i18n";

// Ausruestung je Sportart (19.10.2026, server/app/equipment_sport.py): je Sportart ein eigener
// Standard fuer Foil, Board, Stab und Mast. „—" = kein eigener Wert, es gilt der allgemeine
// Standard (Stern). Anlass Oerni: beim Umstellen einer Session auf Wingfoil blieb das
// Pumpfoil-Foil stehen.
type Eintrag = { foil_id?: number; board_id?: number; stab_id?: number; mast_len_cm?: number };
type Feld = keyof Eintrag;

export function EquipmentJeSport({ stabs, boards, myStabs, myMasts }: {
  stabs: Stab[] | null; boards: Board[]; myStabs: number[]; myMasts: number[];
}) {
  const t = useT();
  const [je, setJe] = useState<Record<string, Eintrag>>({});
  const [myFoils, setMyFoils] = useState<number[]>([]);
  const [foils, setFoils] = useState<Foil[]>([]);
  const [neu, setNeu] = useState("");
  useEffect(() => {
    api.getSettings().then((s) => {
      setJe((s.equipment_je_sport as Record<string, Eintrag>) ?? {});
      setMyFoils((s.my_foils as number[]) ?? []);
    }).catch(() => {});
    api.foils().then(setFoils).catch(() => {});
  }, []);
  const foilName = useMemo(() => new Map(foils.map((f) => [f.id, `${f.brand} ${f.model} ${f.size}`.trim()])), [foils]);
  const stabName = useMemo(() => new Map((stabs ?? []).map((s) => [s.id, `${s.brand} ${s.model} ${s.size}`.trim()])), [stabs]);

  function speichern(next: Record<string, Eintrag>) {
    api.saveSettings({ equipment_je_sport: next })
      .then((res) => setJe((res.equipment_je_sport as Record<string, Eintrag>) ?? {}))
      .catch(() => {});
  }
  function setze(sp: string, f: Feld, v: string) {
    const e: Eintrag = { ...(je[sp] ?? {}) };
    if (v === "") delete e[f]; else e[f] = Number(v);
    speichern({ ...je, [sp]: e });
  }
  const sportarten = Object.keys(je);
  const frei = SPORTS.filter((sp) => sp !== "other" && !sportarten.includes(sp));
  const sel = "min-w-0 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100";
  const auswahl = (sp: string, f: Feld, opts: [number, string][]) => (
    <label className="block min-w-0">
      <span className="text-xs text-slate-400">{t(f === "foil_id" ? "setup.colFoil" : f === "board_id" ? "setup.colBoard" : f === "stab_id" ? "setup.colStab" : "setup.colMast")}</span>
      <select className={sel} value={je[sp]?.[f] ?? ""} onChange={(e) => setze(sp, f, e.target.value)}>
        <option value="">— {t("setup.perSportGeneral")}</option>
        {opts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
  return (
    <Card className="mb-4 p-4">
      <h3 className="mb-1 font-semibold">{t("setup.perSportTitle")}</h3>
      <p className="mb-3 text-sm text-slate-400">{t("setup.perSportHint")}</p>
      <div className="space-y-3">
        {sportarten.map((sp) => (
          <div key={sp} className="rounded-xl border border-slate-800 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-slate-200">{t(`cls.sport.${sp}`)}</span>
              <button type="button" className="text-slate-400 hover:text-slate-200" aria-label="remove"
                onClick={() => { const n = { ...je }; delete n[sp]; speichern(n); }}><CloseIcon className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {auswahl(sp, "foil_id", myFoils.map((id) => [id, foilName.get(id) ?? `#${id}`]))}
              {auswahl(sp, "board_id", boards.map((b) => [b.id, b.name]))}
              {auswahl(sp, "stab_id", myStabs.map((id) => [id, stabName.get(id) ?? `#${id}`]))}
              {auswahl(sp, "mast_len_cm", myMasts.map((m) => [m, `${m} cm`]))}
            </div>
          </div>
        ))}
      </div>
      {frei.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            value={neu} onChange={(e) => setNeu(e.target.value)}>
            <option value="">{t("setup.perSportAdd")} …</option>
            {frei.map((sp) => <option key={sp} value={sp}>{t(`cls.sport.${sp}`)}</option>)}
          </select>
          {neu && (
            <button type="button" className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950"
              onClick={() => { setJe({ ...je, [neu]: {} }); setNeu(""); }}>+</button>
          )}
        </div>
      )}
    </Card>
  );
}
