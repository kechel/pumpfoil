import { useMemo, useState } from "react";

// Kleiner, wiederverwendbarer Tabellen-Sortierer: Header-Zellen sind anklickbar,
// erneuter Klick auf dieselbe Spalte dreht die Richtung. Leere Werte (null/undefined)
// landen immer unten, unabhängig von der Richtung.

export type SortDir = "asc" | "desc";
type Accessor<T> = (row: T) => string | number | null | undefined;

export function useSort<T>(
  rows: T[] | null,
  initialKey: string,
  initialDir: SortDir = "desc",
  accessors: Record<string, Accessor<T>> = {},
) {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    if (!rows) return rows;
    const get = accessors[key] ?? ((r: T) => (r as Record<string, unknown>)[key] as string | number | null);
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const an = av == null || av === "";
      const bn = bv == null || bv === "";
      if (an && bn) return 0;
      if (an) return 1; // leere immer nach unten
      if (bn) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
    // accessors ist stabil (Modul-/Render-Konstante) -> bewusst nicht in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, dir]);

  function toggle(k: string, defaultDir: SortDir = "desc") {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKey(k);
      setDir(defaultDir);
    }
  }

  return { sorted, key, dir, toggle };
}

export function SortHead({
  label,
  sortKey,
  sort,
  align = "right",
  defaultDir = "desc",
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: SortDir; toggle: (k: string, d?: SortDir) => void };
  align?: "left" | "right";
  defaultDir?: SortDir;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`px-4 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => sort.toggle(sortKey, defaultDir)}
        className={`inline-flex items-center gap-1 hover:text-slate-100 ${active ? "text-slate-100" : ""}`}
      >
        <span>{label}</span>
        <span className="text-xs opacity-60">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}
