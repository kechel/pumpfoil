// Supporter-Badge am Profilbild (Jan, 23.10.2026) — wie der Online-Punkt (lib/online.ts): jedes sichtbare
// <Avatar userId=…> meldet sich an, EIN Aufruf fragt alle IDs gemeinsam ab (GET /api/supporter). Seltener als
// online (die Stufe aendert sich hoechstens taeglich): neue IDs gesammelt nach 400 ms, sonst alle 10 min.
import { useEffect, useSyncExternalStore } from "react";
import { api, getToken } from "./api";

const TAKT_MS = 10 * 60_000;
const angemeldet = new Map<number, number>();
let stufen = new Map<number, number>();
const hoerer = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let bald: ReturnType<typeof setTimeout> | null = null;
let gefragt = new Set<number>();

async function abfragen() {
  bald = null;
  if (!getToken() || angemeldet.size === 0) return;
  const ids = [...angemeldet.keys()].slice(0, 200);
  try {
    const r = await api.supporterStufen(ids);
    gefragt = new Set(ids);
    stufen = new Map(Object.entries(r.stufen).map(([k, v]) => [Number(k), v]));
    hoerer.forEach((h) => h());
  } catch { /* offline: Badges bleiben wie sie sind */ }
}

function planen() {
  if (bald) clearTimeout(bald);
  bald = setTimeout(abfragen, 400);
  if (!timer) timer = setInterval(abfragen, TAKT_MS);
}

/** Supporter-Stufe 1-3 dieses Nutzers, 0 = kein Badge. */
export function useSupporter(id: number | null | undefined): number {
  useEffect(() => {
    if (!id) return;
    angemeldet.set(id, (angemeldet.get(id) ?? 0) + 1);
    if (!gefragt.has(id)) planen();
    return () => {
      const n = (angemeldet.get(id) ?? 1) - 1;
      if (n <= 0) angemeldet.delete(id); else angemeldet.set(id, n);
    };
  }, [id]);
  return useSyncExternalStore(
    (h) => { hoerer.add(h); return () => { hoerer.delete(h); }; },
    () => (id ? stufen.get(id) ?? 0 : 0),
  );
}
