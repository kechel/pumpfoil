import { useEffect, useState } from "react";
import { api, Foil, SessionSummary } from "../lib/api";
import { FoilIcon } from "./Icons";
import { useT } from "../i18n";

// Foil einer Session anzeigen / (Owner) ändern. Eigene Foils zuerst, Default vorgewählt.
export function FoilSelect({ session, owned, onMeta }: {
  session: SessionSummary; owned: boolean; onMeta: (s: SessionSummary) => void;
}) {
  const t = useT();
  const [foils, setFoils] = useState<Foil[] | null>(null);
  const [mine, setMine] = useState<number[]>([]);

  useEffect(() => {
    if (!owned) return;
    api.foils().then(setFoils).catch(() => setFoils([]));
    api.getSettings().then((s) => setMine((s.my_foils as number[]) ?? [])).catch(() => {});
  }, [owned]);

  const foil = session.foil;
  const chip = (text: string) =>
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200"><FoilIcon className="h-3.5 w-3.5" /> {text}</span>;

  // Nicht-Owner: nur Anzeige (falls gesetzt).
  if (!owned) return foil ? chip(`${foil.brand} ${foil.model} ${foil.size}`) : null;

  if (!foils) return foil ? chip(`${foil.brand} ${foil.model} ${foil.size}`) : null;

  const mineFoils = foils.filter((f) => mine.includes(f.id));
  const others = foils.filter((f) => !mine.includes(f.id));

  function change(v: string) {
    const foil_id = v === "" ? null : Number(v);
    api.updateSessionMeta(session.id, { foil_id }).then(onMeta).catch(() => {});
  }

  return (
    <select
      value={session.foil_id ?? ""}
      onChange={(e) => change(e.target.value)}
      className="ml-2 max-w-[14rem] rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200"
      title={t("foil.label")}
    >
      <option value="">{t("foil.useDefault")}</option>
      {mineFoils.length > 0 && (
        <optgroup label={t("foils.title")}>
          {mineFoils.map((f) => <option key={f.id} value={f.id}>{f.brand} {f.model} {f.size}</option>)}
        </optgroup>
      )}
      <optgroup label={t("foils.allBrands")}>
        {others.map((f) => <option key={f.id} value={f.id}>{f.brand} {f.model} {f.size}</option>)}
      </optgroup>
    </select>
  );
}
