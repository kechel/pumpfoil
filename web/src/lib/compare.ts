import { useSyncExternalStore } from "react";

// "Vergleichskorb": markierte Sessions bzw. einzelne Läufe, die in der
// Vergleichsansicht (/vergleich) nebeneinander gestellt werden.
// runIdx === null  -> ganze Session; sonst der Lauf-Index (0-basiert).
export interface CompareRef {
  sessionId: number;
  runIdx: number | null;
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
      .map((x) => ({ sessionId: x.sessionId, runIdx: x.runIdx ?? null }));
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
  list.push({ sessionId: r.sessionId, runIdx: r.runIdx });
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

export const COMPARE_MAX = MAX;

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
