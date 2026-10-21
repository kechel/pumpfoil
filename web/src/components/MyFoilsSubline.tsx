import { useEffect, useState } from "react";
import { api, Foil } from "../lib/api";
import { foilLabel } from "../lib/foilLabel";
import { SPORTS } from "../lib/sportClass";
import { useT } from "../i18n";

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
          .map((f) => ({ text: foilLabel(f), def: f.id === def }))
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

// Eigene Sportarten unter der Profil-Karte „Meine Foils & Sportarten" (Jan, 21.10.2026): Standard-
// Sportart vorn und hervorgehoben (wie das Standard-Foil), dann die an der Uhr waehlbaren (`my_sports`).
export function MySportsSubline({ className = "" }: { className?: string }) {
  const t = useT();
  const [rows, setRows] = useState<{ key: string; def: boolean }[] | null>(null);
  useEffect(() => {
    api.getSettings()
      .then((s) => {
        const def = (s.default_sport_class as string) || "pumpfoil";
        const alle = SPORTS as readonly string[];
        const mine = ((s.my_sports as string[]) ?? []).filter((k) => k !== def && alle.includes(k));
        const sortiert = alle.filter((k) => mine.includes(k));
        setRows([{ key: def, def: true }, ...sortiert.map((k) => ({ key: k, def: false }))]);
      })
      .catch(() => setRows([]));
  }, []);
  if (!rows || rows.length === 0) return null;
  return (
    <span className={`block text-xs text-slate-400 ${className}`}>
      {rows.map((r, i) => (
        <span key={r.key}>
          {i > 0 && " · "}
          <span className={r.def ? "text-brand-300" : ""}>{t(`cls.sport.${r.key}`)}</span>
        </span>
      ))}
    </span>
  );
}
