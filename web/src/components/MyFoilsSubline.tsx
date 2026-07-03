import { useEffect, useState } from "react";
import { api, Foil } from "../lib/api";

// Dezente Subzeile für den „Meine Foils"-Menüpunkt: die vom Nutzer gewählten Foils
// (Standard-Foil zuerst und farblich hervorgehoben). Leer -> nichts anzeigen.
export function MyFoilsSubline({ className = "" }: { className?: string }) {
  const [rows, setRows] = useState<{ text: string; def: boolean }[] | null>(null);
  useEffect(() => {
    Promise.all([api.getSettings(), api.foils()])
      .then(([s, foils]) => {
        const mine = (s.my_foils as number[]) ?? [];
        const def = (s.foil_id as number) ?? null;
        const byId = new Map(foils.map((f) => [f.id, f]));
        const out = mine
          .map((id) => byId.get(id))
          .filter((f): f is Foil => !!f)
          .map((f) => ({ text: `${f.brand} ${f.model} ${f.size}`, def: f.id === def }))
          .sort((a, b) => (a.def === b.def ? 0 : a.def ? -1 : 1)); // Standard-Foil nach vorne
        setRows(out);
      })
      .catch(() => setRows([]));
  }, []);
  if (!rows || rows.length === 0) return null;
  return (
    <span className={`block text-xs text-slate-400 ${className}`}>
      {rows.map((r, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <span className={r.def ? "text-brand-300" : ""}>{r.text}</span>
        </span>
      ))}
    </span>
  );
}
