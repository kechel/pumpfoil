import { useSyncExternalStore } from "react";

// "Vergleichskorb": markierte Sessions bzw. einzelne Läufe, die in der
// Vergleichsansicht (/vergleich) nebeneinander gestellt werden.
// runIdx === null  -> ganze Session; sonst der Lauf-Index (0-basiert).
export interface CompareRef {
  sessionId: number;
  runIdx: number | null;
  owned?: boolean;   // gehoert mir? (fuer Merge-Angebot in Vergleichen)
  date?: string;     // YYYY-MM-DD (Start), fuer „gleiches Datum"-Merge
}

const KEY = "foil_compare";
const MAX = 4; // 2–3 sind der Normalfall; etwas Luft nach oben.

export function refKey(r: CompareRef): string {
  return `${r.sessionId}:${r.runIdx ?? "s"}`;
}

function read(): CompareRef[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.sessionId === "number")
      .map((x) => ({ sessionId: x.sessionId, runIdx: x.runIdx ?? null, owned: x.owned, date: x.date }));
  } catch {
    return [];
  }
}

// useSyncExternalStore braucht eine stabile Referenz, solange sich nichts ändert.
let cache: CompareRef[] = read();
const listeners = new Set<() => void>();

function emit() {
  cache = read();
  listeners.forEach((l) => l());
  // Andere Tabs informieren passiert via 'storage'-Event automatisch.
}

function write(list: CompareRef[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  emit();
}

export function getCompare(): CompareRef[] {
  return cache;
}

export function isInCompare(r: CompareRef): boolean {
  const k = refKey(r);
  return cache.some((x) => refKey(x) === k);
}

// true = hinzugefügt, false = entfernt oder abgelehnt (Korb voll).
export function toggleCompare(r: CompareRef): boolean {
  const k = refKey(r);
  const list = read();
  const idx = list.findIndex((x) => refKey(x) === k);
  if (idx >= 0) {
    list.splice(idx, 1);
    write(list);
    return false;
  }
  if (list.length >= MAX) return false;
  list.push({ sessionId: r.sessionId, runIdx: r.runIdx, owned: r.owned, date: r.date });
  write(list);
  return true;
}

export function removeCompare(r: CompareRef) {
  const k = refKey(r);
  write(read().filter((x) => refKey(x) !== k));
}

export function clearCompare() {
  write([]);
}

// Korb komplett ersetzen (z. B. Merge-Vorschlag: genau diese Sessions vorauswaehlen).
export function setCompare(refs: CompareRef[]) {
  write(refs.slice(0, MAX).map((r) => ({ sessionId: r.sessionId, runIdx: r.runIdx ?? null, owned: r.owned, date: r.date })));
}

export const COMPARE_MAX = MAX;

// -> ids der zu mergenden Sessions, wenn die Auswahl mergebar ist: nur ganze Sessions
// (keine einzelnen Laeufe), alle EIGENE, gleiches Datum, >=2 verschiedene. Sonst null.
export function mergeableIds(refs: CompareRef[]): number[] | null {
  if (refs.some((r) => r.runIdx != null)) return null;
  const ids = [...new Set(refs.map((r) => r.sessionId))];
  if (ids.length < 2) return null;
  if (!refs.every((r) => r.owned && r.date)) return null;
  if (new Set(refs.map((r) => r.date)).size !== 1) return null;
  return ids;
}

// Reaktiver Zugriff: Komponenten re-rendern bei Korb-Änderungen (auch tab-übergreifend).
export function useCompare(): CompareRef[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => { if (e.key === KEY) emit(); };
      window.addEventListener("storage", onStorage);
      return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
    },
    getCompare,
    getCompare,
  );
}
